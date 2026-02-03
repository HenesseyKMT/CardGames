const PayloadType = {
    GAME_STATUS_UPDATE: 0,
    ROOM_STATUS_UPDATE: 1,
};

let games;
const rooms = [];
const gameItems = {},
    roomItems = {};
const [gamesList, roomsList] = document.querySelectorAll('.list');
const realtime = new WebSocket('ws://localhost:8888/realtime');
realtime.onmessage = message => {
    const { type, data } = JSON.parse(message.data);
    switch (type) {
        case PayloadType.GAME_STATUS_UPDATE:
            updateGameItem(data);
            break;
        case PayloadType.ROOM_STATUS_UPDATE:
            updateRoomItem(data);
            break;
    }
};

(async () => {
    const rk = await fetch('http://localhost:8888/games');
    games = await rk.json();
    games.forEach(updateGameItem);
    gamesList.addEventListener('click', e => {
        if (e.target.tagName !== 'DIV') return;
        location.href = location.origin + '/make/' + e.target.dataset.id;
    });
    roomsList.addEventListener('click', e => {
        if (e.target.tagName !== 'DIV') return;
        location.href = location.origin + '/games/' + e.target.dataset.id + '?id='; // TODO: missing room id
    });
})();

function updateGameItem(game) {
    const item = (gameItems[game.id] ||= gamesList.appendChild(document.createElement('div')));
    item.dataset.id = game.id;
    item.innerHTML = `<b>${game.name}</b><br>Queue: ${game.waiting}<br>Games: ${game.running}`;
}

function updateRoomItem(room) {
    const item = (roomItems[room.id] ||= roomsList.appendChild(document.createElement('div')));
    item.dataset.id = room.id;
    item.innerHTML = `<b>${room.name}</b><br>Players: ${room.players}`;
}