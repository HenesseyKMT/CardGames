const { Room } = require('../room');
const State = require('../enums/State');
const PayloadType = require('../enums/UnoPayloadType');
const CardType = require('../enums/UnoCardType');
const CardColor = require('../enums/UnoCardColor');

function sleep(s) {
    return new Promise(r => setTimeout(r, s * 1000));
}

const DECK = require('../data/uno');
const CARDS_COUNT = DECK.length
const DECK_IDS = Array(CARDS_COUNT).fill().map((_, i) => i);


Array.prototype.remove = function(elem) {
    const i = this.indexOf(elem);
    const exists = -1 !== i;
    if (exists) this.splice(i, 1);
    return exists;
};

function has(player, type) {
    for (const cardId of player.hand) {
        const card = DECK[cardId];
        if (card.type === type)
            return true;
    }
    return false;
}

const cardsHandlers = {
    // TODO: make it possible to skip when you have +4/+2/JOKER and top is +4/+2
    [CardType.PLUS_TWO]: async function() {
        const player = this.players[this.turn];
        this.plusCount += 2;
        if (
            this.settings.stackPlusTwo === State.ON && has(player, CardType.PLUS_TWO) ||
            this.settings.jokerCancelsPlusTwo === State.ON && has(player, CardType.JOKER) ||
            this.settings.stackPlusFourOverPlusTwo === State.ON && has(player, CardType.PLUS_FOUR)
        ) return;
        for (; this.plusCount > 0; this.plusCount--) {
            this.draw(player);
            await sleep(this.settings.drawingIntervalCooldown);
        }
        this.nextTurn();
    },
    [CardType.PLUS_FOUR]: async function() {
        const player = this.players[this.turn];
        this.plusCount += 4;
        if (
            this.settings.stackPlusFour === State.ON && has(player, CardType.PLUS_FOUR)
        ) return;
        for (; this.plusCount > 0; this.plusCount--) {
            this.draw(player);
            await sleep(this.settings.drawingIntervalCooldown);
        }
        this.nextTurn();
    },
    [CardType.SKIP_TURN]: function() {
        const player = this.players[this.turn];
        player.send(JSON.stringify({
            type: PayloadType.TURN_SKIPPED
        }));
        this.nextTurn();
    },
    [CardType.CHANGE_DIRECTION]: function() {
        this.direction = -this.direction;
        this.broadcast({
            type: PayloadType.DIRECTION_CHANGED
        });
    },
    [CardType.JOKER]: function() {
        this.plusCount = 0;
    }
};

class UnoRoom extends Room {
    static handlers = {
        [PayloadType.HOST_START]: async function(host) {
            if (host.id !== 0 || this.isRunning || this.clients.size < 2) return;
            this.isRunning = true;
            this.broadcast({
                type: PayloadType.GAME_STARTED
            });
            // freeze clients
            this.players = [...this.clients];
            // shuffle
            let n = CARDS_COUNT;
            for (let i = 0; i < CARDS_COUNT; i++)
                this.pile.push(this.discard.splice(Math.floor(Math.random() * n--), 1)[0]);
            // distribute
            let i = 0;
            for (const player of this.players) {
                player.hand = [];
                player.index = i++;
            }
            for (let i = 0; i < this.settings.startCards; i++)
                for (const player of this.players) {
                    this.draw(player);
                    await sleep(this.settings.drawingIntervalCooldown);
                }
            // draw first card
            await sleep(this.settings.drawingIntervalCooldown);

            let top;
            while (true) {
                this.top = this.pile.pop();
                top = DECK[this.top];
                if (
                    top.color === CardColor.BLACK ||
                    this.settings.startCardPlusTwoAllowed === State.OFF && top.type === CardType.PLUS_TWO ||
                    this.settings.startCardSkipTurnAllowed === State.OFF && top.type === CardType.SKIP_TURN ||
                    this.settings.startCardChangeDirectionAllowed === State.OFF && top.type === CardType.CHANGE_DIRECTION
                ) {
                    this.pile.unshift(this.top);
                } else break;
            }
            this.broadcast({
                type: PayloadType.GAME_BEGIN,
                data: this.top
            });
            this.broadcast({
                type: PayloadType.GAME_TURN,
                data: this.players[this.turn].id
            });
            cardsHandlers[top.type]?.call(this);
        },
        [PayloadType.DISCARD_CARD]: async function(player, cardId) {
            if (
                !Number.isInteger(cardId) ||
                cardId < 0 ||
                cardId > DECK.length ||
                this.waitingColorFrom ||
                !player.hand.includes(cardId)
            ) return;

            const top = DECK[this.top];
            const card = DECK[cardId];
            if (!(this.turn === player.index && (
                top.color === card.color ||
                (card.type === CardType.NUMBER ? top.value === card.value : top.type === card.type) ||
                card.color === CardColor.BLACK ||
                top.color === CardColor.BLACK && card.color === this.chosenColor
            ) || this.settings.interceptions === State.ON && (
                top.color === card.color &&
                top.type === card.type &&
                top.value === card.value &&
                top.color !== CardColor.BLACK
            ))) return;

            this.turn = player.index; // for interceptions
            player.hand.remove(cardId);
            this.broadcast({
                type: PayloadType.PLAYER_DISCARDED,
                data: {
                    id: player.id,
                    cardId
                }
            });

            if (card.color === CardColor.BLACK)
                this.waitingColorFrom = player;

            if (card.type === CardType.CHANGE_DIRECTION)
                await cardsHandlers[card.type]?.call(this);

            this.top = cardId;
            this.nextTurn();

            if (card.type !== CardType.CHANGE_DIRECTION)
                await cardsHandlers[card.type]?.call(this);

            this.broadcast({
                type: PayloadType.GAME_TURN,
                data: this.players[this.turn].id
            });

            this.drewCard = false;
        },
        [PayloadType.CHOOSE_COLOR]: function(player, color) {
            if (this.waitingColorFrom !== player || !(
                color === CardColor.RED ||
                color === CardColor.GREEN ||
                color === CardColor.BLUE ||
                color === CardColor.YELLOW
            )) return;
            this.waitingColorFrom = null;
            this.chosenColor = color;
            this.broadcast({
                type: PayloadType.CHOSEN_COLOR,
                data: color
            });
        },
        [PayloadType.DRAW_CARD]: function(player) {
            if (
                this.drewCard ||
                this.waitingColorFrom ||
                this.turn !== player.index
            ) return;
            this.drewCard = true;
            this.draw(player);
        },
        [PayloadType.SKIP]: function(player) {
            if (
                !this.drewCard ||
                this.waitingColorFrom ||
                this.turn !== player.index
            ) return;
            this.drewCard = false;
            this.nextTurn();
            this.broadcast({
                type: PayloadType.GAME_TURN,
                data: this.players[this.turn].id
            });
        }
    };

    constructor(...args) {
        super(...args);
        this.players = []; // { nickname, hand }
        this.pile = [];
        this.discard = [...DECK_IDS];
        this.turn = 0;
        this.direction = 1; // -1
        this.top = null;
        this.plusCount = 0;
        this.waitingColorFrom = null;
        this.chosenColor = null;
        this.drewCard = false;
        this.isRunning = false;
    }
    onLeave(ws) {
        this.broadcast({
            type: PayloadType.PLAYER_LEAVE,
            data: ws.id
        });
    }
    onJoin(ws) {
        // send players already inside the room
        for (const other of this.clients)
            if (other !== ws)
                ws.send(JSON.stringify({
                    type: PayloadType.PLAYER_JOIN,
                    data: {
                        id: other.id,
                        nickname: other.nickname
                    }
                }));
        ws.send(JSON.stringify({
            type: PayloadType.PLAYER_ID,
            data: ws.id
        }));
        this.broadcast({
            type: PayloadType.PLAYER_JOIN,
            data: {
                id: ws.id,
                nickname: ws.nickname
            }
        });
    }
    draw(player) {
        if (this.pile.length === 0) return;
        const card = this.pile.pop();
        player.hand.push(card);
        player.send(JSON.stringify({
            type: PayloadType.RECEIVE_CARD,
            data: card
        }));
        this.broadcast({
            type: PayloadType.PLAYER_DREW,
            data: player.id
        }, player);
    }
    nextTurn() {
        this.turn += this.direction;
        // puts turn back into positives
        this.turn += this.players.length;
        this.turn %= this.players.length;
    }
}

module.exports = UnoRoom;