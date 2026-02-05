const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const Games = require('./games');
const { Room, rooms, idToRoom, ipToRoom, getRoomStatus } = require('./room');
const { broadcastRealtime, realtimeClients } = require('./realtime');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const enumsDir = path.join(__dirname, 'enums');

app.set('trust proxy', true);
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    // res.setHeader("Cache-Control", "no-store");
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public'), { dotfiles: 'ignore' }));
app.get('/enums/:name', (req, res) => {
    const fileName = req.params.name + '.json';
    const filePath = path.join(enumsDir, fileName);

    fs.access(filePath, fs.constants.R_OK, (err) => {
        if (err) {
            res.status(404).send({ error: 'Not found' });
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        res.sendFile(filePath);
    });
});
app.get('/games', (req, res) => res.status(200).send(games));
app.get('/rooms', (req, res) => res.status(200).send([...rooms].map(getRoomStatus)));
app.post('/make/:id/', (req, res) => {
    const room = new Games[req.params.id](req.ip, req.body);
    res.redirect(303, room.url); // prevents form resubmission
});

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

// Testing purposes
const PayloadType = require('./enums/PayloadType');

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

const ipsOnCooldown = new Map;
wss.on('connection', (ws, req) => {
    ws.ip = ws._socket.remoteAddress;
    const cooldown = ipsOnCooldown.get(ws.ip);
    const now = Date.now();
    if (cooldown && cooldown > now)
        return ws.close(1009, 'On cooldown');
    console.log(req.url);
    if (req.url === '/realtime') {
        realtimeClients.add(ws);
        ws.on('message', () => {
            ipsOnCooldown.set(ws.ip, Date.now() + 60000);
            ws.close(1009, 'Unauthorized');
        });
    } else {
        const u = new URLSearchParams(req.url.split('?')[1]);
        const id = parseInt(u.get('id') || 0),
            code = u.get('code') || '';
        const room = idToRoom.get(id);
        if (!room) return ws.close(1009, 'Unknown room');
        ws.nickname = u.get('nickname') || '';
        room.join(ws, req, code);
        ws.on('message', message => {
            try {
                var { type, data } = JSON.parse(message);
            } catch {
                ipsOnCooldown.set(ws.ip, Date.now() + 60000);
                ws.close(1009, 'Unauthorized');
            }
            room.handlers[type]?.call(ws, data);
        });
        ws.on('close', () => room.leave(ws));
    }
});

server.listen(8888, () => {
    console.log('listening...');
});