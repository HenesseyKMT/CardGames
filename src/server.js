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


app.get('/games', (req, res) => res.status(200).send(games));
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
    for (const ws of realtimeClients) {
        const id = ~~(Math.random() * 3);
        ws.send(JSON.stringify({
            id: games[id].id,
            name: games[id].name,
            waiting: ~~(Math.random() * 20),
            running: ~~(Math.random() * 20)
        }));
    }
}, 1000);

wss.on('connection', (ws, req) => {
    console.log(req.url);
    if (req.url === '/realtime') {
        realtimeClients.add(ws);
        ws.on('message', () => {
            ws.close(1006, 'Unauthorized');
        });
    } else if (req.url.startsWith('/games')) {}
});

server.listen(8888, () => {
    console.log('listening...');
});