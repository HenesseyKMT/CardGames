const State = require('./enums/State');
const PayloadType = require('./enums/PayloadType');
const DefaultConfig = {
    name: "Room",
    public: State.ON,
    code: "",
    maxPlayers: 100
};

const { broadcastRealtime } = require('./realtime');

let maxRoomId = 0;
const ipToRoom = new Map, idToRoom = new Map;
const rooms = new Set;

class Room {
    constructor(ownerIp, settings, gameId) {
        this.id = maxRoomId++;
        this.ownerIp = ownerIp;
        this.gameId = gameId;
        this.settings = Object.assign(DefaultConfig, require(`../public/games/${gameId}/settings`), settings);
        this.clientId = 0;
        this.clients = new Set;
        this.handlers = {};
        ipToRoom.get(ownerIp)?.destroy();
        rooms.add(this);
        ipToRoom.set(ownerIp, this);
        idToRoom.set(this.id, this);
        updateRoomStatus(this);
    }
    // NOTE: maybe would be better as a WebSocket method
    join(ws, code) {
        if (this.clients.size === this.settings.maxPlayers)
            return ws.close(1009, 'Room Full');
        if (this.settings.public === State.OFF && this.settings.code !== code)
            return ws.close(1009, 'Wrong code');
        if (ws.ip !== this.ownerIp) {
            ipToRoom.get(ws.ip)?.leave(ws);
            ipToRoom.set(ws.ip, this);
        }
        ws.id = this.clientId++;
        this.clients.add(ws);
        this.onJoin?.(ws);
        updateRoomStatus(this);
    }
    leave(ws) {
        if (!this.clients.delete(ws)) return;
        if (ws.ip === this.ownerIp) return this.destroy();
        ipToRoom.delete(ws.ip);
        this.onLeave?.(ws);
        updateRoomStatus(this);
    }
    destroy() {
        for (const ws of this.clients)
            ws.close(1009, 'Room Destroyed');
        rooms.delete(this);
        ipToRoom.delete(this.ownerIp);
        idToRoom.delete(this.id);
        this.onDestroy?.();
        deleteRoomStatus(this);
    }
    get url() {
        let s = `/games/${this.gameId}?id=${this.id}`;
        if (this.settings.public === State.OFF)
            s += `&code=${encodeURIComponent(this.settings.code)}`;
        return s;
    }
    broadcast(data) {
        data = JSON.stringify(data);
        for (const ws of this.clients) ws.send(data);
    }
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

module.exports = { Room, rooms, ipToRoom, idToRoom, State, DefaultConfig, getRoomStatus, updateRoomStatus, deleteRoomStatus };