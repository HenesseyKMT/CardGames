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

class UnoRoom extends Room {
    constructor(...args) {
        super(...args, 'uno');
        this.players = []; // { nickname, hand }
        this.pile = [];
        this.discard = [...DECK_IDS];
        this.turn = 0;
        this.direction = 1; // -1
        this.top = null;
        this.plusCount = 0;
        this.waitingColorFrom = null;
        this.chosenColor = null;
        this.isRunning = false;
        this.handlers = {
            [PayloadType.HOST_START]: this.start.bind(this),
            [PayloadType.DISCARD_CARD]: this.play.bind(this),
            [PayloadType.CHOOSE_COLOR]: this.choseColor.bind(this)
        };
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
    async start(host) {
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
        for (let i = 0; i < 7; i++)
            for (const player of this.players) {
                this.draw(player);
                await sleep(this.settings.drawingIntervalCooldown);
            }
        // draw first card
        await sleep(this.settings.drawingIntervalCooldown);
        this.top = this.pile.pop();
        this.broadcast({
            type: PayloadType.GAME_BEGIN,
            data: this.top
        });
        this.broadcast({
            type: PayloadType.GAME_TURN,
            data: this.turn
        });
    }
    async play(player, cardId) {
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
            top.color !== CardColor.BLACK
        ))) return;

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

        if (card.type === CardType.CHANGE_DIRECTION) {
            if (this.direction > 0) {
                this.direction = -1   
            } else {
                this.direction = 1
            }
            // Boomer: this.direction = 2 - this.direction;
        }

        this.top = cardId;
        this.nextTurn();

        const nextPlayer = this.players[this.turn];

        switch (card.type) {
            case CardType.PLUS_TWO:
                this.plusCount += 2;
                if (
                    this.settings.stackPlusTwo === State.ON && has(nextPlayer, CardType.PLUS_TWO) ||
                    this.settings.jokerCancelsPlusTwo === State.ON && has(nextPlayer, CardType.JOKER) ||
                    this.settings.stackPlusFourOverPlusTwo === State.ON && has(nextPlayer, CardType.PLUS_FOUR)
                ) break;
                for (; this.plusCount > 0; this.plusCount--) {
                    this.draw(nextPlayer);
                    await sleep(this.settings.drawingIntervalCooldown);
                }
                this.nextTurn();
                break;
            case CardType.PLUS_FOUR:
                this.plusCount += 4;
                if (
                    this.settings.stackPlusFour === State.ON && has(nextPlayer, CardType.PLUS_FOUR) ||
                    this.settings.stackPlusTwoOverPlusFour === State.ON && has(nextPlayer, CardType.PLUS_TWO)
                ) break;
                for (; this.plusCount > 0; this.plusCount--) {
                    this.draw(nextPlayer);
                    await sleep(this.settings.drawingIntervalCooldown);
                }
                this.nextTurn();
                break;
            case CardType.SKIPS:
                nextPlayer.send(JSON.stringify({
                    type: PayloadType.TURN_SKIPPED
                }));
                this.nextTurn();
                break;
        }
        this.broadcast({
            type: PayloadType.GAME_TURN,
            data: this.turn
        });
    }
    choseColor(player, color) {
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
    }
    nextTurn() {
        this.turn += this.direction;
        // puts turn back into positives
        this.turn += this.players.length;
        this.turn %= this.players.length;
    }
}

module.exports = UnoRoom;