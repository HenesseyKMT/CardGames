const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.set('trust proxy', true);
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    // res.setHeader("Cache-Control", "no-store");
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const State = {
    ON: "on",
    OFF: "off",
    ALIKE: "alike"
};
const DefaultConfig = {
    name: "Room",
    public: State.ON,
    code: "",
    maxPlayers: 100
};
const PayloadType = {
    GAME_STATUS_UPDATE: 0,
    ROOM_STATUS_UPDATE: 1,
    ROOM_STATUS_DELETE: 2,
};

let maxRoomId = 0;
const ipToRoom = new Map, idToRoom = new Map;
const rooms = new Set;

class Room {
    constructor(ownerIp, gameId, settings) {
        this.id = maxRoomId++;
        this.ownerIp = ownerIp;
        this.gameId = gameId;
        this.settings = Object.assign(DefaultConfig, require(`./public/games/${gameId}/settings`), settings);
        this.clients = new Set;
        ipToRoom.get(ownerIp)?.destroy();
        rooms.add(this);
        ipToRoom.set(ownerIp, this);
        idToRoom.set(this.id, this);
        updateRoomStatus(this);
    }
    // NOTE: maybe would be better as a WebSocket method
    join(ws, req, code) {
        if (this.clients.size === this.settings.maxPlayers)
            return ws.close(1006, 'Room Full');
        if (this.settings.public === State.OFF && this.settings.code !== code)
            return ws.close(1006, 'Wrong code');
        if (ws.ip !== this.ownerIp) {
            ipToRoom.get(ws.ip)?.leave(ws);
            ipToRoom.set(ws.ip, this);
        }
        this.clients.add(ws);
        updateRoomStatus(this);
    }
    leave(ws) {
        if (!this.clients.delete(ws)) return;
        if (ws.ip === this.ownerIp) return this.destroy();
        ipToRoom.delete(ws.ip);
        this.clients.delete(ws);
        updateRoomStatus(this);
    }
    destroy() {
        for (const ws of this.clients)
            ws.close(1006, 'Room Destroyed');
        rooms.delete(this);
        ipToRoom.delete(this.ownerIp);
        idToRoom.delete(this.id);
        deleteRoomStatus(this);
    }
    get url() {
        let s = `/games/${this.gameId}?id=${this.id}`;
        if (this.settings.public === State.OFF)
            s += `&code=${encodeURIComponent(this.settings.code)}`;
        return s;
    }
}

app.get('/games', (req, res) => res.status(200).send(games));
app.get('/rooms', (req, res) => res.status(200).send([...rooms].map(getRoomStatus)));
app.post('/make/:id/', (req, res) => {
    const room = new Room(req.ip, req.params.id, req.body);
    res.redirect(303, room.url); // prevents form resubmission
});

app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore' }));

const realtimeClients = new Set;
const games = [{
    id: "uno",
    name: "Uno",
    waiting: 3,
    running: 5
}, {
    id: "chiure",
    name: "Chiure",
    waiting: 1,
    running: 2
}, {
    id: "mystigri",
    name: "Mystigri",
    waiting: 3,
    running: 5
}];

setInterval(() => {
    const id = ~~(Math.random() * 3);
    broadcastRealtime({
        type: PayloadType.GAME_STATUS_UPDATE,
        data: {
            id: games[id].id,
            name: games[id].name,
            waiting: ~~(Math.random() * 20),
            running: ~~(Math.random() * 20)
        }
    });
}, 1000);

function broadcastRealtime(data) {
    data = JSON.stringify(data);
    for (const ws of realtimeClients) ws.send(data);
}

function updateRoomStatus(room) {
    if (room.settings.public === State.ON) broadcastRealtime({
        type: PayloadType.ROOM_STATUS_UPDATE,
        data: getRoomStatus(room)
    });
}

function deleteRoomStatus(room) {
    if (room.settings.public === State.ON) broadcastRealtime({
        type: PayloadType.ROOM_STATUS_DELETE,
        data: room.id
    });
}

function getRoomStatus(room) {
    return {
        id: room.id,
        game: room.gameId,
        name: room.settings.name,
        players: room.clients.size
    }
}

wss.on('connection', (ws, req) => {
    console.log(req.url);
    if (req.url === '/realtime') {
        realtimeClients.add(ws);
        ws.on('message', () => {
            ws.close(1009, 'Unauthorized');
        });
    } else {
        const u = new URLSearchParams(req.url.split('?')[1]);
        const id = u.get('id') || 0,
            code = u.get('code') || '';
        const room = idToRoom.get(id);
        if (!room) return ws.close(1009, 'Unknown room');
        ws.ip = ws._socket.remoteAddress;
        ws.nickname = u.get('nickname') || '';
        room.join(ws, req, code);
        ws.on('close', () => room.leave(ws));
    }
});

server.listen(8888, () => {
    console.log('listening...');
});