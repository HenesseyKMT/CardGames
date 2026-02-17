const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const Games = require('./games');
const { Room, rooms, stats, idToRoom, getRoomStatus } = require('./room');
const { broadcastRealtime, realtimeClients } = require('./realtime');

for (const id in Games) stats[id] = { id, rooms: 0, players: 0 };

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const enumsDir = path.join(__dirname, 'enums');
const dataDir = path.join(__dirname, 'data');

app.set('trust proxy', true);
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    // res.setHeader("Cache-Control", "no-store");
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public'), { dotfiles: 'ignore' }));
app.get(['/enums/:name', '/data/:name'], (req, res) => {
    const filePath = path.join(__dirname, req.url + '.json');

    fs.access(filePath, fs.constants.R_OK, (err) => {
        if (err) {
            res.sendStatus(404);
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        res.sendFile(filePath);
    });
});
app.get('/games', (req, res) => res.status(200).send(Object.values(stats)));
app.get('/rooms', (req, res) => res.status(200).send([...rooms].map(getRoomStatus)));
app.post('/make/:id/', (req, res) => {
    const gameId = req.params.id;
    const room = new Games[gameId](req.body, gameId);
    res.redirect(303, room.url + '&host=true'); // prevents form resubmission
});

const ipsOnCooldown = new Map;
wss.on('connection', (ws, req) => {
    ws.ip = ws._socket.remoteAddress;
    const cooldown = ipsOnCooldown.get(ws.ip);
    const now = Date.now();
    if (cooldown && cooldown > now)
        return ws.close(1009, 'On cooldown');
    console.log(ws.ip, req.url);
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
        room.join(ws, code);
        ws.on('message', message => {
            try {
                var { type, data } = JSON.parse(message);
            } catch {
                ipsOnCooldown.set(ws.ip, Date.now() + 60000);
                ws.close(1009, 'Unauthorized');
            }
            room.constructor.handlers[type]?.call(room, ws, data);
        });
        ws.on('close', () => room.leave(ws));
    }
});

server.listen(8888, () => {
    console.log('listening...');
});