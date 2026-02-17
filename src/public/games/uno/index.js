(async function() {
    'use strict';

    const s = new URLSearchParams(location.search);
    const roomId = s.get('id');
    const isHost = s.get('host') === "true";

    let hasStarted = false,
        isRunning = false;

    const players = {};
    let playerId, playerTurn;
    let direction = 1;

    let discarded;

    const colorChooser = document.getElementById('color-chooser');
    const turnSkip = document.getElementById('turn-skip');
    const sayUno = document.getElementById('say-uno');
    const skip = document.getElementById('skip');
    const currentDirection = document.getElementById('direction');
    const currentColor = document.getElementById('color');

    const PayloadType = await jsonFetch('/enums/UnoPayloadType'),
          CardType = await jsonFetch('/enums/UnoCardType'),
          CardColor = await jsonFetch('/enums/UnoCardColor'),
          DECK = await jsonFetch('/data/uno');

    const CardColorToName = Object.fromEntries(Object.entries(CardColor).map(([k, v]) => [v, k.toLowerCase()]));

    const ws = new WebSocket(`${location.protocol === 'http:' ? 'ws' : 'wss'}://${location.host}?id=${roomId}&nickname=${encodeURIComponent(localStorage.nickname || '')}`);
    ws.onmessage = message => {
        const { type, data } = JSON.parse(message.data);
        switch (type) {
            // Self
            case PayloadType.RECEIVE_CARD: // deck and draw
                addCard(playerId, data);
                break;
            case PayloadType.CAN_SKIP:
                skip.style.opacity = 1;
                break;
            case PayloadType.CHOSEN_COLOR:
                setCurrentColor(data);
                break;
            case PayloadType.TURN_SKIPPED:
                turnSkip.animate([
                    { display: 'block' },
                    { width: '60%' },
                    {}
                ], { duration: 300 });
                break;
            case PayloadType.SAID_UNO:
                const { playerElement, sayUnoElement } = players[data];
                playerElement.appendChild(sayUno);
                sayUno.animate([
                    { display: 'block' },
                    { opacity: '1' },
                    {}
                ], { duration: 700 });
                sayUnoElement.style.opacity = '';
                break;
            case PayloadType.DIRECTION_CHANGED:
                direction = -direction;
                currentDirection.style.transform = `rotateX(${direction === 1 ? 0 : 180}deg)`;
                break;

            // Broadcast
            // NOTE: would be better to send those offer HTTP in it fails
            case PayloadType.PLAYER_DISCARDED:
                skip.style.opacity = '';
                removeCard(data.id, data.cardId);
                const card = DECK[data.cardId];
                if (card.color === CardColor.BLACK) {
                    if (data.id === playerId) {
                        popup.innerHTML = '';
                        popup.appendChild(colorChooser);
                        showPopup();
                    }
                } else {
                    setCurrentColor(card.color);
                }
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
                setCurrentColor(DECK[data].color);
                break;
            case PayloadType.GAME_SUMMARY: // end game
                // player id
                // points
                break;
        }
    };
    ws.onclose = e => {
        popup.innerHTML = `<h1>Disconnected</h1>Reason: <code>${e.reason || 'Server down'}</code><br>Code: <code>${e.code}</code>`;
        showPopup();
        document.addEventListener('click', hidePopup);
    };
    ws.send = (type, data) => WebSocket.prototype.send.call(ws, JSON.stringify(data === undefined ? { type } : { type, data }));

    // put start button if client is host
    start.hidden = !isHost;
    start.addEventListener('click', () => {
        ws.send(PayloadType.HOST_START);
    });

    colorChooser.addEventListener('click', event => {
        if (event.target.tagName === 'I') {
            ws.send(PayloadType.CHOOSE_COLOR, parseInt(event.target.dataset.id));
            hidePopup();
        }
    });

    pile.firstElementChild.addEventListener('click', () => {
        if (playerTurn !== playerId) return;
        ws.send(PayloadType.DRAW_CARD);
    });

    skip.addEventListener('click', () => {
        if (playerTurn !== playerId || skip.style.opacity !== '1') return;
        skip.style.opacity = '';
        ws.send(PayloadType.SKIP);
    });
    uno.addEventListener('click', () => {
        if (uno.style.opacity !== '1') return;
        uno.style.opacity = '';
        ws.send(PayloadType.SAY_UNO);
    });

    function setCurrentColor(color) {
        currentColor.style.backgroundImage = 'url(assets/' + CardColorToName[color] + '.png)';
    }

    // TODO: should put this inside theme.js (but rename the file)
    async function jsonFetch(...args) {
        const rk = await fetch(...args);
        return await rk.json();
    }

    function showPopup() {
        popup.style.opacity = 1;
        popup.style.display = 'block';
    }

    function hidePopup() {
        popup.style.opacity = 0;
        setTimeout(() => {
            popup.style.display = 'none';
        }, 1000);
        document.removeEventListener('click', hidePopup);
    }

    const config = {
        handsDisplayCompact: false,
    };

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
        element.dataset.id = id;
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
        let sayUnoElement = uno;
        if (id === playerId) {
            playerElement.append(nicknameDisplay, handElement);
        } else {
            sayUnoElement = document.createElement('i');
            sayUnoElement.addEventListener('click', () => {
                if (sayUnoElement.style.opacity !== '1') return;
                sayUnoElement.style.opacity = '';
                ws.send(PayloadType.SAY_COUNTER_UNO, id);
            });
            playerElement.append(nicknameDisplay, sayUnoElement, handElement);
        }
        players[id] = {
            id,
            cards: 0,
            nickname,
            nicknameDisplay,
            playerElement,
            handElement,
            sayUnoElement
        };
        if (id === playerId) {
            handSlots.bottom.appendChild(playerElement);
            handElement.addEventListener('click', event => {
                discarded = event.target;
                const id = parseInt(discarded?.dataset.id);
                if (!Number.isInteger(id) || id < 0) return;
                ws.send(PayloadType.DISCARD_CARD, id);
            });
        }
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

        const player = players[id];
        const { handElement, playerElement, sayUnoElement } = player;
        player.cards++;
        sayUnoElement.style.opacity = '';

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
                let before;
                if (player.cards > 1) {
                    const card = DECK[cardId];
                    for (const cardElement of handElement.children) {
                        const other = DECK[cardElement.dataset.id];
                        if (card.color * 100 + card.value <= other.color * 100 + other.value) {
                            before = cardElement;
                            break;
                        }
                    }
                }
                if (before) {
                    handElement.insertBefore(target, before);
                } else {
                    handElement.appendChild(target);
                }
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
        const player = players[id];
        const { handElement, playerElement, sayUnoElement } = player;

        if (--player.cards === 1) {
            sayUnoElement.style.opacity = 1;
        }

        const target = playerId === id ? discarded : handElement.children.item(Math.floor(Math.random() * handElement.childElementCount));

        const from = discardTop.getBoundingClientRect();
        const to = target.getBoundingClientRect();

        const dx = to.left - from.left - 13;
        const dy = to.top - from.top - 20;
        const rot = playerElement.parentElement.style.getPropertyValue('--rotation');

        target.style.transformOrigin = 'center center';
        // FIXME: scale(1.5) fucks up everything change to width/height
        if (playerId === id) target.animate([{
            transform: `translate(${-dx}px, calc(${-dy}px)`
        }], {
            duration: 400,
            fill: 'forwards'
        }).onfinish = () => {
            target.remove();
            setCardPosition(discardTop, cardId);
        };
        else target.animate([{
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
})();