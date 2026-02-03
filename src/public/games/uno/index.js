const config = {
    handsDisplayCompact: false,
}

const hiddenHands = [];

const hiddenHandSlots = {
    left: document.getElementById('left-hands'),
    top: document.getElementById('top-hands'),
    right: document.getElementById('right-hands')
};
const handElements = [];

function addDeck(cardsCount) {
    const handElement = document.createElement('div');
    handElement.className = 'hand-hidden';
    if (config.handsDisplayCompact) handElement.innerText = cardsCount;
    else for (let i = 0; i < cardsCount; i++) {
        const card = document.createElement('i');
        card.className = 'card';
        handElement.appendChild(card);
    }
    handElements.push(handElement);

    const c = handElements.length;
    let n = 0;
    while (c - 2 * n >= n) n++;
    n--;
    let i = 0;
    const m = c - 2 * n;
    for (let j = 0; j < n; j++)
        hiddenHandSlots.left.appendChild(handElements[i++]);
    for (let j = 0; j < m; j++)
        hiddenHandSlots.top.appendChild(handElements[i++]);
    for (let j = 0; j < n; j++)
        hiddenHandSlots.right.appendChild(handElements[i++]);
}
/*
setTimeout(addDeck, 0, 6);
setTimeout(addDeck, 2000, 7);
setTimeout(addDeck, 2000, 11);
setTimeout(addDeck, 4000, 7);
setTimeout(addDeck, 4000, 9);
setTimeout(addDeck, 4000, 3);
*/
addDeck(6);
addDeck(7);
addDeck(11);
addDeck(7);
addDeck(9);
addDeck(3);

const { left: TX, top: TY } = discard.getBoundingClientRect();
discard.onclick = () => {
    const cards = Array.from(handElements[Math.floor(Math.random() * handElements.length)].children);
    const card = cards[Math.floor(Math.random() * cards.length)];
    // const card = handElements[4].children.item(0);
    moveFlipSwap(card, TX, TY, "url('./trans.png')");
}

function moveFlipSwap(el, x, y, newBg, duration = 1000) {
    const rect = el.getBoundingClientRect()
    const globalTarget = new DOMPoint(x, y)
    const globalCurrent = new DOMPoint(rect.left, rect.top)

    const style = getComputedStyle(el.parentElement.parentElement);
    const comp = new DOMMatrix(style.transform);
    const rot = Math.atan2(comp.b, comp.a) * (180 / Math.PI);
    const inv = comp.inverse();

    const localTarget = inv.transformPoint(globalTarget)
    const localCurrent = inv.transformPoint(globalCurrent)

    let dx = localTarget.x - localCurrent.x;
    let dy = localTarget.y - localCurrent.y;
    if (rot === -90) {
        dx += 51;
        dy += 80;
    } else if (rot === 180) {
        dx -= 27;
        dy += 80;
    }

    const anim = el.animate(
        [
            { transform: 'translate(0px, 0px) rotateY(0deg)' },
            { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) rotateY(90deg) rotateX(${rot}deg) scale(1.25)` },
            { transformOrigin: 'top left', backgroundImage: newBg, transform: `translate(${dx}px, ${dy}px) rotateY(180deg) rotate(${rot}deg) scale(1.5)` }
        ],
        {
            duration,
            fill: 'forwards',
            easing: 'ease'
        }
    ).onfinish = () => el.parentElement.removeChild(el);

    return anim
}

const ws = new WebSocket(`ws://localhost:8888${location.search}&nickname=${prompt('Nickname?')}`);
ws.onmessage = message => {
    const data = JSON.parse(message.data);
    switch (data.type) {
        // Actions
        case PLAYER_SKIPPED:
            // player id
            break;
        case PLAYER_PLAYED:
            // player id
            // card
            break;
        case PLAYER_DREW:
            // player id
            break;

        case GAME_INIT:
            // cards count of each player
            // own deck
            break;
        case GAME_START:
            // current card
            break;
        case GAME_SUMMARY:
            // player id
            // points
            break;
    }
};
// ws.onclose = handleClose;
