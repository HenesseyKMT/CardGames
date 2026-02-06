const { Room } = require('../room');
const UnoPayloadType = require('../enums/UnoPayloadType');

const CardType = {
    NUMBER: 0,
    PLUS_TWO: 1,
    SKIPS: 2,
    CHANGE_DIRECTION: 3,
    JOKER: 4,
    PLUS_FOUR: 5
};
const CardColor = {
    RED: 0,
    YELLOW: 1,
    GREEN: 2,
    BLUE: 3,
    BLACK: 4
};

function sleep(s) {
    return new Promise(r => setTimeout(r, s * 1000));
}

function number(value, color) {
    return { type: CardType.NUMBER, value, color };
}

const DECK = [];
for (const color of [CardColor.RED, CardColor.YELLOW, CardColor.GREEN, CardColor.BLUE]) {
    DECK.push(number(0, color));
    for (let value = 1; value <= 9; value++)
        DECK.push(number(value, color), number(value, color));
    for (const type of [CardType.PLUS_TWO, CardType.SKIPS, CardType.CHANGE_DIRECTION])
        DECK.push({ type, value: 20, color }, { type, value: 20, color });
}
for (let i = 0; i < 4; i++)
    DECK.push({ type: CardType.JOKER, value: 50, color: CardColor.BLACK }, { type: CardType.PLUS_FOUR, value: 50, color: CardColor.BLACK });

const CARDS_COUNT = DECK.length
const DECK_IDS = Array(CARDS_COUNT).fill().map((_, i) => i);


class UnoRoom extends Room {
    constructor(...args) {
        super(...args, 'uno');
        this.players = []; // { nickname, hand }
        this.pile = [];
        this.discard = [...DECK_IDS];
        this.turn = 0;
        this.direction = 1; // -1
        this.top = null;
        this.isRunning = false;
        this.handlers = {
            [UnoPayloadType.HOST_START]: this.start.bind(this)
        };
    }
    onLeave(ws) {
        this.broadcast({
            type: UnoPayloadType.PLAYER_LEAVE,
            data: ws.id
        });
    }
    onJoin(ws) {
        // send players already inside the room
        for (const other of this.clients)
            if (other !== ws)
                ws.send(JSON.stringify({
                    type: UnoPayloadType.PLAYER_JOIN,
                    data: {
                        id: other.id,
                        nickname: other.nickname
                    }
                }));
        ws.send(JSON.stringify({
            type: UnoPayloadType.PLAYER_ID,
            data: ws.id
        }));
        this.broadcast({
            type: UnoPayloadType.PLAYER_JOIN,
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
            type: UnoPayloadType.RECEIVE_CARD,
            data: card
        }));
        this.broadcast({
            type: UnoPayloadType.PLAYER_DREW,
            data: player.index
        });
    }
    async start(host) {
        if (host.ip !== this.ownerIp || this.isRunning || this.clients.size < 2) return;
        this.isRunning = true;
        this.broadcast({
            type: UnoPayloadType.GAME_STARTED
        });
        // freeze clients
        this.players = [...this.clients];
        // shuffle
        let n = CARDS_COUNT;
        for (let i = 0; i < CARDS_COUNT; i++)
            this.pile.push(this.discard.splice(Math.floor(Math.random() * n--), 1)[0]);
        // distribute
        let index = 0;
        for (const player of this.players) {
            player.hand = [];
            player.index = index++;
        }
        for (let i = 0; i < 7; i++)
            for (const player of this.players) {
                this.draw(player);
                await sleep(0.7); // TODO: make that configurable
            }
        // draw first card
        await sleep(3);
        this.top = this.pile.pop();
        this.broadcast({
            type: UnoPayloadType.GAME_BEGIN,
            data: this.top
        });
        this.broadcast({
            type: UnoPayloadType.GAME_TURN,
            data: this.turn
        });
    }
    play(player, card) {
        // redefine top in function of what this player plays
        const top = DECK[this.top];
        card = DECK[card];
        if (
            top.type === card.type ||
            top.value === card.value ||
            top.color === card.color ||
            card.type === CardType.JOKER || card.type === CardType.PLUS_FOUR
        ) {
            const nextPlayer = this.players[this.turn + 1];
            switch (card.type) {
                case CardType.PLUS_TWO:
                    if (!nextPlayer.hand.some(card => card.type === CardType.PLUS_TWO || card.type === CardType.JOKER)) {
                        nextPlayer.hand.push(this.pile.pop(), this.pile.pop());
                        this.turn += this.direction;
                    }
                    break;
                case CardType.PLUS_FOUR:
                    if (!nextPlayer.hand.some(card => card.type === CardType.PLUS_FOUR)) {
                        nextPlayer.hand.push(this.pile.pop(), this.pile.pop(), this.pile.pop(), this.pile.pop());
                        this.turn += this.direction;
                    }
                    break;
                case CardType.SKIPS:
                    this.turn += this.direction;
                    break;
                case CardType.CHANGE_DIRECTION:
                    if (this.direction > 0) {
                        this.direction = -1   
                    } else {
                        this.direction = 1
                    }
                    // Boomer: this.direction = 2 - this.direction;
                    break;
            }
            this.turn += this.direction;
        }
        // remove card from player's deck
        // +1 to turn
    }
}

module.exports = UnoRoom;