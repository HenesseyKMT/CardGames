const s = new URLSearchParams(location.search);
const roomId = s.get('id');
const isHost = s.get('host') === "true";

let players = {}, playerId, hasStarted = false, isRunning = false, playerTurn, DECK, CardType;

(async function() {
    const PayloadType = await jsonFetch('/enums/UnoPayloadType');
    CardType = await jsonFetch('/enums/UnoCardType');
    DECK = await jsonFetch('/data/uno');

    const ws = new WebSocket(`ws://localhost:8888?id=${roomId}&nickname=${encodeURIComponent(localStorage.nickname || '')}`);
    ws.onmessage = message => {
        const { type, data } = JSON.parse(message.data);
        switch (type) {
            // Self
            case PayloadType.RECEIVE_CARD: // deck and draw
                addCard(playerId, data);
                break;

            // Broadcast
            // NOTE: would be better to send those offer HTTP in it fails
            case PayloadType.PLAYER_DISCARDED:
                // player id
                // card id
                break;
            case PayloadType.PLAYER_DREW:
                addCard(data);
                break;
            case PayloadType.PLAYER_LEAVE:
                deletePlayer(data);
                break;
            case PayloadType.PLAYER_JOIN:
                // TODO: add as spectator otherwise
                if (!hasStarted)
                    addPlayer(data.id, data.nickname);
                break;
            case PayloadType.PLAYER_ID:
                playerId = data;
                break;

            // All
            case PayloadType.GAME_TURN: // whose turn is it
                players[playerTurn]?.nicknameDisplay.classList.remove('playing');
                players[playerTurn = data]?.nicknameDisplay.classList.add('playing');
                break;
            case PayloadType.GAME_STARTED: // when host starts
                hasStarted = true;
                start.hidden = true;
                break;
            case PayloadType.GAME_BEGIN: // when game begins
                isRunning = true;
                setCardPosition(discardTop, data);
                discard.appendChild(discardTop);
                break;
            case PayloadType.GAME_SUMMARY: // end game
                // player id
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

// TODO: should put this inside theme.js (but rename the file)
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

const card = document.createElement('i');
card.className = 'card';

const discardTop = card.cloneNode(true);

function setCardPosition(element, id) {
    const { type, value, color } = DECK[id];
    element.style.setProperty('--x',
        type === CardType.NUMBER ? value :
        type === CardType.JOKER ? 0 :
        type === CardType.PLUS_FOUR ? 1 :
        9 + type
    );
    element.style.setProperty('--y', color);
}

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
        nicknameDisplay,
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

function addCard(id, cardId) {
    // thanks ChatGPT, I was about to lose my mind on this
    // FIXME: left and right hands are offseted

    const { handElement, playerElement } = players[id];

    const target = card.cloneNode(true);
    handElement.appendChild(target);

    const pileCard = pile.firstElementChild;
    const from = pileCard.getBoundingClientRect();
    const to = target.getBoundingClientRect();

    target.remove();

    const ghost = pileCard.cloneNode(true);
    document.body.appendChild(ghost);

    ghost.style.position = 'fixed';
    ghost.style.left = from.left + 'px';
    ghost.style.top = from.top + 'px';
    ghost.style.margin = '0';
    ghost.style.zIndex = '9999';

    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const rot = playerElement.parentElement.style.getPropertyValue('--rotation');

    ghost.style.transformOrigin = 'center center';

    if (playerId === id) ghost.animate([{
        transform: 'translate(0px, 0px) scale(1.5) rotate(0deg)'
    }, {
        transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(1.5) rotateY(90deg)`
    }], {
        duration: 300,
        fill: 'forwards'
    }).onfinish = () => {
        setCardPosition(ghost, cardId);
        ghost.animate([{
            transform: `translate(${dx}px, ${dy}px) scale(1.5)`
        }], {
            duration: 100,
            fill: 'forwards'
        }).onfinish = () => {
            ghost.remove();
            setCardPosition(target, cardId);
            handElement.appendChild(target);
        };
    };
    else ghost.animate(
        [
            {
                transform: 'translate(0px, 0px) scale(1.5) rotate(0deg)'
            },
            {
                transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${rot})`
            }
        ],
        {
            duration: 500,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'forwards'
        }
    ).onfinish = () => {
        ghost.remove();
        handElement.appendChild(target);
    };
}

function removeCard(id, cardId) {
    const { handElement, playerElement } = players[id];

    const target = handElement.children.item(Math.floor(Math.random() * handElement.childElementCount));

    const from = discardTop.getBoundingClientRect();
    const to = target.getBoundingClientRect();

    const dx = to.left - from.left - 13;
    const dy = to.top - from.top - 20;
    const rot = playerElement.parentElement.style.getPropertyValue('--rotation');

    target.style.transformOrigin = 'center center';
    target.animate([{
        transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(${1.5 * 0.9}) rotate(-${rot}) rotateY(90deg)`
    }], {
        duration: 300,
        fill: 'forwards'
    }).onfinish = () => {
        setCardPosition(target, cardId);
        target.animate([{
            transform: `translate(${dx}px, ${dy}px) scale(1.5) rotate(-${rot})`
        }], {
            duration: 100,
            fill: 'forwards'
        }).onfinish = () => {
            target.remove();
            setCardPosition(discardTop, cardId);
        };
    };
}


discard.onclick = async () => {
    const cards = document.querySelectorAll('.card');
    const card = cards[Math.floor(Math.random() * cards.length)];
    // const card = players[4].children.item(0);
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