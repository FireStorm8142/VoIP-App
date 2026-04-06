const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let activeVoicMembers = {};

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`User ${socket.id} connected`);
    socket.username='Anonymous';

    socket.on('set-username', (username) => {
        const oldUsername = socket.username;
        socket.username = username;
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                socket.to(room).emit('username-change', {
                    oldUsername: oldUsername,
                    newUsername: socket.username
                });
            }
        }
    });

    socket.on('join-room', (roomCode) => {
        socket.join(roomCode);
        console.log(`User ${socket.username} joined room: ${roomCode}`);
        //announce to everyone that a user has joined
        socket.to(roomCode).emit('chat-message', {
            sender: 'System',
            text: `${socket.username} has joined room ${roomCode}.`,
            room: roomCode,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('get-voice-list', (roomCode) => {
        socket.to(roomCode).emit('voice-list', {
            voice: activeVoicMembers
        })
        socket.emit('voice-list', {
            voice: activeVoicMembers
        })
    });

    socket.on('send-chat', (data) => {
        const { room, message } = data;
        const messageData = {
            sender: socket.username,
            text: message,
            room: room,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        socket.to(room).emit('chat-message', messageData);
        socket.emit('chat-message', { ...messageData, isSelf: true });
    });

    socket.on('join-voice', (roomCode) => {
        activeVoicMembers = {...activeVoicMembers, [socket.username]: [socket.id]}
        socket.to(roomCode).emit('user-joined-voice', { 
            socketId: socket.id, 
            username: socket.username 
        });
    });

    socket.on('webrtc-signal', (data) => {
        const { targetSocketId, signalData } = data;
        io.to(targetSocketId).emit('webrtc-signal', {
            senderSocketId: socket.id,
            signalData: signalData
        });
    });

    socket.on('leave-room', (roomCode) => {
        socket.leave(roomCode);
        console.log(`User ${socket.id} disconnected`);

        socket.to(roomCode).emit('chat-message', {
            sender: 'System',
            text: `${socket.username} has left`,
            room: roomCode,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});