(async function() {
    return
    const PayloadType = await jsonFetch('/enums/UnoPayloadType');

    const ws = new WebSocket(`ws://localhost:8888${location.search}&nickname=${localStorage.nickname || ''}`);
    ws.onmessage = message => {
        const { type, data } = JSON.parse(message.data);
        switch (type) {
            // Self
            case PayloadType.RECEIVE_CARD: // deck and draw
                // card id
                break;

            // Broadcast
            // NOTE: would be better to send those offer HTTP in it fails
            case PayloadType.PLAYER_DISCARDED:
                // player id
                // card id
                break;
            case PayloadType.PLAYER_DREW:
                // player id
                break;

            // All
            case PayloadType.GAME_TURN: // whose turn is it
                // player id
                break;
            case PayloadType.GAME_STATUS: // on player join / leave
                // player count
                // spectator count
                // TODO: maybe merge ROOM_STATUS_UPDATE and this
                break;
            case PayloadType.GAME_START: // when host starts
                // cards count of each player
                // top card
                break;
            case PayloadType.GAME_SUMMARY: // end game
                // player id
                // points
                break;
        }
    };
    // ws.onclose = handleClose;
})();


let popupVisible = false;
window.addEventListener('keyup', e => {
    if (e.key === 'Escape') {
        popup.style = popupVisible ? 'display:none' : '';
        popupVisible = !popupVisible;
        e.preventDefault();
    }
});


async function jsonFetch(...args) {
    const rk = await fetch(...args);
    return await rk.json();
}

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
        // card.innerText = '9';
        // if (value === 9 || value === 6) card.style.textDecoration = 'underline';
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
discard.onclick = async () => {
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