const WebSocket = require('ws');
const http = require('http');
const express = require("express");
const cors = require('cors');
const app = express();

app.use(express.json({ type: "application/json" }));
app.use(cors());

app.get("/", (req, res) => {
    res.send("Api is connected");
});

const server = http.createServer(app);
const wsServer = new WebSocket.Server({ server: server });
const rooms = {};
const websockets = []

function broadcastToRoom(webSocketmessage) {
    const mes = JSON.parse(webSocketmessage);
    if (mes.type === "delete") {
        for (const client of wsServer.clients) {
               client.send(webSocketmessage);
        }
    }
    else if (mes.type === "kicked") {
        for (const client of wsServer.clients) {
               client.send(webSocketmessage);
        }
    }
    else {
        for (const client of wsServer.clients) {
            client.send(webSocketmessage);
            // break;
        }
    }
};

wsServer.on('connection', function (ws) {

    ws.on('message', (message) => {
        let mes = JSON.parse(message)
        broadcastToRoom(JSON.stringify(mes));
    });

    ws.on('open', () => {
        console.log('WebSocket open');
    });

    ws.on('close', () => {
        console.log('WebSocket closed');
    });
});

app.post('/create-room', (req, res) => {
    const { gameStrength } = req.body;
    let randomNumber = Math.floor(Math.random() * 10000);
    let fourDigitCode = randomNumber.toString().padStart(4, '0');
    const roomId = fourDigitCode;
    rooms[roomId] = { participants: [] , gameStrength : gameStrength , membersWithAudioOn : [], membersWithVedioOn : [] , streams : {} };
    res.json({ roomId });
});

app.post('/join-room', (req, res) => {
    const { roomId, name , isMobile } = req.body;
    if (!rooms[roomId]) {
        return res.status(404).json({ error: 'Room not found' });
    }
    rooms[roomId].participants.push(name);
    rooms[roomId].membersWithAudioOn.push(name);
    if(!isMobile){
      rooms[roomId].membersWithVedioOn.push(name);
    }

    const ws = {}
    ws.roomId = roomId;
    ws.name = name;
    websockets.push(ws);

    broadcastToRoom(JSON.stringify({ roomId: roomId, sender: name, type: 'join', members: rooms[roomId].participants , notifyMessage: `${name} joined the room` }));

    res.json({ message: `${name} joined the room` });
});

app.get('/get-participants/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    if (!rooms[roomId]) {
        return res.status(404).json({ error: 'Room not found' });
    }
    const participants = rooms[roomId].participants;
    const gameStrength =  rooms[roomId].gameStrength;
    const membersWithAudioOn =  rooms[roomId].membersWithAudioOn;
    const membersWithVedioOn =  rooms[roomId].membersWithVedioOn;
    const streams = rooms[roomId].streams
    res.json({participants : participants , gameStrength : gameStrength , membersWithAudioOn : membersWithAudioOn , membersWithVedioOn : membersWithVedioOn , streams : streams});
});

app.post('/leave-room', (req, res) => {
    const { roomId, name, type } = req.body;
    if (!rooms[roomId]) {
        return res.status(404).json({ error: 'Room not found' });
    }
    const participants = rooms[roomId].participants;
    const membersWithAudioOn = rooms[roomId].membersWithAudioOn;
    const membersWithVedioOn = rooms[roomId].membersWithVedioOn;
    const streams = rooms[roomId].streams
    const indexparticipants = participants.indexOf(name);
    const indexmembersWithAudioOn = membersWithAudioOn.indexOf(name)
    if(indexmembersWithAudioOn !== -1){
       membersWithAudioOn.splice(indexmembersWithAudioOn, 1);
    }
    const indexmembersWithVedioOn = membersWithVedioOn.indexOf(name)
    if(indexmembersWithVedioOn !== -1){
        membersWithVedioOn.splice(indexmembersWithVedioOn, 1)
    }
    delete streams[name]
    if (indexparticipants !== -1) {
        participants.splice(indexparticipants, 1);
        for (let i = websockets.length - 1; i >= 0; i--) {
            const ws = websockets[i];
            if (ws.roomId === roomId && ws.name === name && type === "kick") {
                websockets.splice(i, 1);
                broadcastToRoom(JSON.stringify({ roomId: roomId, sender: name, type: "kicked", notifyMessage: "Sorry you have been kicked out of the room by creator" }));
                broadcastToRoom(JSON.stringify({ roomId: roomId, sender: name, type: type, notifyMessage: type === "leave" ? `${name} left the room` : `${name} has been kicked out by the creator` }));
            }
            else if (ws.roomId === roomId && ws.name === name) {
                websockets.splice(i, 1);
                broadcastToRoom(JSON.stringify({ roomId: roomId, sender: name, type: type, notifyMessage: type === "leave" ? `${name} left the room` : `${name} has been kicked out by the creator` }));
            }
        }
        res.json({ message: `${name} left the room` });
    } else {
        res.status(404).json({ error: 'User not found in the room' });
    }
});

app.delete('/delete-room/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    if (!rooms[roomId]) {
        return res.status(404).json({ error: 'Room not found' });
    }

    for (let i = websockets.length - 1; i >= 0; i--) {
        const ws = websockets[i];
        if (ws.roomId === roomId) {
            websockets.splice(i, 1);
            broadcastToRoom(JSON.stringify({ roomId: roomId, type: 'delete', notifyMessage: `Room ${roomId} has been deleted, and all participants have been removed.` }));
        }
    }
    rooms[roomId].participants = [];
    rooms[roomId].membersWithAudioOn = [];
    rooms[roomId].membersWithVedioOn = [];
    rooms[roomId].streams = {};
    delete rooms[roomId];
    res.json({ message: `Room ${roomId} has been deleted, and all participants have been removed.` });
});

app.post('/updateParticipantsAudioVedio', (req, res) => {
    const { roomId, name , type } = req.body;
    if (!rooms[roomId]) {
        return res.status(404).json({ error: 'Room not found' });
    }
    if(type === "audio"){
        const membersWithAudioOn = rooms[roomId].membersWithAudioOn;
        const index = membersWithAudioOn.indexOf(name)
        if(index !== -1){
            membersWithAudioOn.splice(index, 1);
            broadcastToRoom(JSON.stringify({ roomId: roomId, type: type, name : name , notifyMessage: `${name} turned off his ${type}`}));
        } else{
            rooms[roomId].membersWithAudioOn.push(name)
            broadcastToRoom(JSON.stringify({ roomId: roomId, type: type , name : name , notifyMessage: `${name} turned on his ${type}`}));
        }
    }
    if(type === "vedio"){
        const membersWithVedioOn = rooms[roomId].membersWithVedioOn;
        const index = membersWithVedioOn.indexOf(name)
        if(index !== -1){
            membersWithVedioOn.splice(index, 1);
            broadcastToRoom(JSON.stringify({ roomId: roomId, type: type, name : name , notifyMessage: `${name} turned off his ${type}`}));
        } else{
            rooms[roomId].membersWithVedioOn.push(name)
            broadcastToRoom(JSON.stringify({ roomId: roomId, type: type, name : name , notifyMessage: `${name} turned on his ${type}`}));
        }
    }
    res.json({ message: `${name}'s  ${type} value is updated` });
})

app.post('/upload-stream', (req, res) => {
    const { roomId, userStream } = req.body;
    if (!rooms[roomId]) {
        return res.status(404).json({ error: 'Room not found' });
    }else {
        rooms[roomId].streams = { ...rooms[roomId].streams, ...userStream };
        broadcastToRoom(JSON.stringify({ roomId: roomId, type: "newStreamUploaded"}));
    }
    res.json({ message: "stream is updated" });
})

app.post('/access-denaid-member', (req, res) => {
    const { roomId, name } = req.body;
    if (!rooms[roomId]) {
        return res.status(404).json({ error: 'Room not found' });
    }else {
        const membersWithAudioOn = rooms[roomId].membersWithAudioOn;
        const indexmembersWithAudioOn = membersWithAudioOn.indexOf(name)
        if(indexmembersWithAudioOn !== -1){
            membersWithAudioOn.splice(indexmembersWithAudioOn, 1);
        } 
        const membersWithVedioOn = rooms[roomId].membersWithVedioOn;
        const indexmembersWithVedioOn = membersWithVedioOn.indexOf(name)
        if(indexmembersWithVedioOn !== -1){
            membersWithVedioOn.splice(indexmembersWithVedioOn, 1);
        } 
    }
    res.json({ message: "removed from membersWithAudioOn and membersWithVedioOn" });
})

server.listen(5000, () => {
    console.log('WebSocket server listening on port 5000');
});