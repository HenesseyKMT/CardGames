const s = new URLSearchParams(location.search);
const roomId = s.get('id');
const isHost = s.get('host') === "true";

let players = {}, playerId;

(async function() {
    const PayloadType = await jsonFetch('/enums/UnoPayloadType');

    const ws = new WebSocket(`ws://localhost:8888?id=${roomId}&nickname=${localStorage.nickname || ''}`);
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
                // player index
                // card id
                break;
            case PayloadType.PLAYER_DREW:
                // player index
                break;
            case PayloadType.PLAYER_LEAVE:
                deletePlayer(data);
                break;
            case PayloadType.PLAYER_JOIN:
                addPlayer(data.id, data.nickname);
                break;
            case PayloadType.PLAYER_ID:
                playerId = data;
                break;

            // All
            case PayloadType.GAME_TURN: // whose turn is it
                // player index
                break;
            case PayloadType.GAME_STARTED: // when host starts
                start.hidden = true;
                break;
            case PayloadType.GAME_BEGIN: // when game begins
                // top card
                break;
            case PayloadType.GAME_SUMMARY: // end game
                // player index
                // points
                break;
        }
    };
    // ws.onclose = handleClose;
    ws.send = (type, data) => WebSocket.prototype.send.call(ws, JSON.stringify(data === undefined ? { type } : { type, data }));

    // put start button if client is host
    start.hidden = !isHost;
    start.addEventListener('click', () => {
        ws.send(PayloadType.HOST_START);
    });
})();

async function jsonFetch(...args) {
    const rk = await fetch(...args);
    return await rk.json();
}

const config = {
    handsDisplayCompact: false,
}

const handSlots = {
    left: document.getElementById('left-hands'),
    top: document.getElementById('top-hands'),
    right: document.getElementById('right-hands'),
    bottom: document.getElementById('bottom-hands')
};

function addPlayer(id, nickname) {
    const playerElement = document.createElement('div');
    playerElement.className = 'hand';
    const nicknameDisplay = document.createElement('span');
    nicknameDisplay.innerText = nickname;
    const handElement = document.createElement('div');
    playerElement.append(nicknameDisplay, handElement);
    players[id] = {
        id,
        nickname,
        playerElement,
        handElement
    };
    if (id === playerId)
        handSlots.bottom.appendChild(playerElement);
    orderPlayers();
}

function deletePlayer(id) {
    const { playerElement } = players[id];
    playerElement.remove();
    delete players[id];
    orderPlayers();
}

function orderPlayers() {
    const p = Object.values(players);
    while (p[0].id < playerId) p.push(p.shift());
    p.shift(); // player
    const c = p.length;
    let n = 0;
    while (c - 2 * n >= n) n++;
    n--;
    let i = 0;
    const m = c - 2 * n;
    for (let j = 0; j < n; j++)
        handSlots.left.appendChild(p[i++].playerElement);
    for (let j = 0; j < m; j++)
        handSlots.top.appendChild(p[i++].playerElement);
    for (let j = 0; j < n; j++)
        handSlots.right.appendChild(p[i++].playerElement);
}

discard.onclick = async () => {
    const cards = Array.from(playerElements[Math.floor(Math.random() * playerElements.length)].lastElementChild.children);
    const card = cards[Math.floor(Math.random() * cards.length)];
    // const card = playerElements[4].children.item(0);
    const { left, top } = discard.getBoundingClientRect(); // in case window is resized
    moveFlipSwap(card, left, top, "url('./trans.png')");
}

function moveFlipSwap(el, x, y, newBg, duration = 1000) {
    const rect = el.getBoundingClientRect()
    const globalTarget = new DOMPoint(x, y)
    const globalCurrent = new DOMPoint(rect.left, rect.top)
    const style = getComputedStyle(el.parentElement.parentElement.parentElement);
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
    ).onfinish = () => el.remove();

    return anim
}