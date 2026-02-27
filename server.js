const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`User ${socket.id} connected`);
    socket.on('join-room', (roomCode) => {
        socket.join(roomCode);
        console.log(`User ${socket.id} joined room: ${roomCode}`);
        //announce to everyone that a user has joined
        socket.to(roomCode).emit('chat-message', {
            sender: 'System',
            text: `A user joined room ${roomCode}.`,
            room: roomCode,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('send-chat', (data) => {
        const { room, message } = data;
        const messageData = {
            sender: socket.id,
            text: message,
            room: room,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        socket.to(room).emit('chat-message', messageData);
        socket.emit('chat-message', { ...messageData, isSelf: true });
    });

    socket.on('leave-room', (roomCode) => {
        socket.leave(roomCode);
        console.log(`User ${socket.id} disconnected`);

        socket.to(roomCode).emit('chat-message', {
            sender: 'System',
            text: `User ${socket.id} has left`,
            room: roomCode,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});