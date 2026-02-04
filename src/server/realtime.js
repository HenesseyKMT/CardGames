const realtimeClients = new Set;

function broadcastRealtime(data) {
    data = JSON.stringify(data);
    for (const ws of realtimeClients) ws.send(data);
}

module.exports = { broadcastRealtime, realtimeClients };