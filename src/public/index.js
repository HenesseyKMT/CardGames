(async function() {
    'use strict';

    const gameItems = {},
          roomItems = {};

    const [gamesList, roomsList] = document.querySelectorAll('.list');

    const PayloadType = await jsonFetch('/enums/PayloadType');

    const realtime = new WebSocket(`${location.protocol === 'http:' ? 'ws' : 'wss'}://${location.host}/realtime`);
    realtime.onmessage = message => {
        const { type, data } = JSON.parse(message.data);
        switch (type) {
            case PayloadType.GAME_STATUS_UPDATE:
                updateGameItem(data);
                break;
            case PayloadType.ROOM_STATUS_UPDATE:
                updateRoomItem(data);
                break;
            case PayloadType.ROOM_STATUS_DELETE:
                deleteRoomItem(data);
                break;
        }
    };

    const games = await jsonFetch('/games');
    games.forEach(updateGameItem);
    gamesList.addEventListener('click', e => {
        if (e.target.tagName !== 'DIV') return;
        location.href = location.origin + '/make/' + e.target.dataset.id;
    });
    const rooms = await jsonFetch('/rooms');
    rooms.forEach(updateRoomItem);
    roomsList.addEventListener('click', e => {
        if (e.target.tagName !== 'DIV') return;
        location.href = location.origin + '/games/' + e.target.dataset.game + '?id=' + e.target.dataset.id;
    });

    nickname.value = localStorage.nickname || '';
    nickname.addEventListener('change', () => {
        localStorage.setItem('nickname', nickname.value);
    });

    function updateGameItem(game) {
        const item = (gameItems[game.id] ||= gamesList.appendChild(document.createElement('div')));
        item.dataset.id = game.id;
        item.innerHTML = `<b>${game.name}</b><br>Queue: ${game.waiting}<br>Games: ${game.running}`;
    }

    function updateRoomItem(room) {
        const item = (roomItems[room.id] ||= roomsList.appendChild(document.createElement('div')));
        item.dataset.game = room.game;
        item.dataset.id = room.id;
        item.innerHTML = `<b>${room.name}</b><br>Players: ${room.players}`;
    }

    function deleteRoomItem(roomId) {
        roomsList.removeChild(roomItems[roomId]);
        delete roomItems[roomId];
    }

    async function jsonFetch(...args) {
        const rk = await fetch(...args);
        return await rk.json();
    }
})();