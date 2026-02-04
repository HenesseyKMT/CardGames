const { Room } = require('../room');

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
    }
    start() {
        // freeze clients
        this.players = [...this.clients];
        // shuffle
        for (let i = 0; i < CARDS_COUNT; i++)
            this.pile.push(this.discard.splice(Math.floor(Math.random() * CARDS_COUNT), 1));
        // distribute
        for (let player of this.players)
            player.hand = [];
        for (let i = 0; i < 7; i++)
            for (let player of this.players)
                player.hand.push(this.pile.pop());
        // draw first card
        this.top = this.pile.pop();
    }
    play(player, card) {
        // redefine top in function of what this player plays
        const top = DECK[this.top],
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