const socket = io();

let username='Anonymous';
let currentRoom = null; 
const usernameInput = document.getElementById('username-input');
const usernameBtn = document.getElementById('btn-set-username');
const usernameDisplay = document.getElementById('username-display');
const roomInput = document.getElementById('room-code-input');
const joinBtn = document.getElementById('btn-join-room');
const roomList = document.getElementById('room-list');
const chatFeed = document.getElementById('chat-feed');
const msgInput = document.getElementById('msg-input');
const disconnect = document.getElementById('btn-disconnect');

usernameBtn.addEventListener('click', () => {
    const value = usernameInput.value.trim();
    if (!value) return;

    username = value;
    usernameDisplay.textContent = `Current Username: ${username}`;
    usernameInput.value = '';

    socket.emit('set-username', username);
});

socket.on('username-change', (data) => {
        if (!currentRoom) return;

        if (data.newUsername === username) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    messageDiv.innerHTML = `
        <span class="meta">System</span>
        <span class="content">${data.oldUsername} changed name to ${data.newUsername}</span>
    `;
    chatFeed.appendChild(messageDiv);
});

joinBtn.addEventListener('click', () => {
    const code = roomInput.value.trim();
    if(!code) return;

    if (currentRoom) {
        alert("Please leave your current room before joining a new one!");
        return;
    }
    //temp fix for "ghost room" cases, add UI handler later for multiple rooms

    currentRoom = code;
    socket.emit('join-room', currentRoom);
    const roomItem = document.createElement('div');
    roomItem.className = 'user-list-item';
    roomItem.innerHTML = `<div class="status-dot online"></div><span># ${code}</span>`;
    roomList.appendChild(roomItem);
    chatFeed.innerHTML = `<div class="message"><span class="meta">System</span><span class="content">Joined Room: ${code}</span></div>`;
    roomInput.value = '';
});

disconnect.addEventListener('click', () => {
    if (!currentRoom) return;

    socket.emit('leave-room', currentRoom);
    chatFeed.innerHTML='';
    const roomItems = document.querySelectorAll('.user-list-item');
    roomItems.forEach(item => {
        if (item.textContent.includes(currentRoom)) {
            item.remove();
        }
    });
    currentRoom=null;
});

msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && msgInput.value.trim() !== '') {
        if (!currentRoom) {
            alert("Please join a room first!");
            return;
        }
        socket.emit('send-chat', {
            room: currentRoom,
            message: msgInput.value
        });
        
        msgInput.value = ''; 
    }
});

socket.on('chat-message', (data) => {
    if (data.room !== currentRoom && data.sender !== 'System') return;

    const messageDiv = document.createElement('div');
    messageDiv.className = data.isSelf ? 'message self' : 'message';
    messageDiv.innerHTML = `
        <span class="meta">${data.sender === 'System' ? 'System' : data.sender.substring(0,5)} • ${data.time}</span>
        <span class="content">${data.text}</span>
    `;
    chatFeed.appendChild(messageDiv);
    chatFeed.scrollTop = chatFeed.scrollHeight;
});


let localStream;
let peerConnection;

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// DOM Elements for Audio
const btnCall = document.getElementById('btn-join'); // We'll repurpose this as the "Call" button
const audioContainer = document.getElementById('audio-container');

// --- 1. SETUP THE PEER CONNECTION ---
async function initWebRTC() {
    // Create the connection object
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Listen for ICE candidates (our public IP routing info) and send them to the peer
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentRoom) {
            socket.emit('webrtc-signal', {
                room: currentRoom,
                signalData: { type: 'ice-candidate', candidate: event.candidate }
            });
        }
    };

    // Listen for the remote audio track arriving!
    peerConnection.ontrack = (event) => {
        console.log("Received remote audio stream!");
        // Check if we already created an audio element for them
        if (!document.getElementById('remote-audio')) {
            const remoteAudio = document.createElement('audio');
            remoteAudio.id = 'remote-audio';
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.autoplay = true; // Crucial: tell it to play automatically
            audioContainer.appendChild(remoteAudio);
            
            // Add a system message so we know it connected
            chatFeed.innerHTML += `<div class="message"><span class="meta">System</span><span class="content" style="background: var(--success); color: white;">Audio Connected!</span></div>`;
        }
    };

    // Get our microphone
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        // Add our audio tracks to the connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        console.log("Microphone access granted.");
    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Could not access microphone.");
    }
}

// --- 2. START THE CALL (Create Offer) ---
btnCall.addEventListener('click', async () => {
    if (!currentRoom) return alert("Join a room first!");
    
    await initWebRTC(); // Setup mic and connection

    // Create the SDP Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Send the offer to the other person in the room via our Node server
    socket.emit('webrtc-signal', {
        room: currentRoom,
        signalData: { type: 'offer', sdp: offer }
    });
    
    console.log("Sent Call Offer");
});

// --- 3. HANDLE INCOMING WEBRTC SIGNALS ---
socket.on('webrtc-signal', async (data) => {
    const { signalData } = data;

    // If we receive an OFFER, we must create an ANSWER
    if (signalData.type === 'offer') {
        console.log("Received Offer, creating Answer...");
        await initWebRTC(); // Setup our mic and connection to reply
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('webrtc-signal', {
            room: currentRoom,
            signalData: { type: 'answer', sdp: answer }
        });
    }

    // If we receive an ANSWER to our offer, set it
    if (signalData.type === 'answer') {
        console.log("Received Answer, connection establishing...");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
    }

    // If we receive an ICE CANDIDATE (routing info), add it
    if (signalData.type === 'ice-candidate') {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } catch (e) {
            console.error("Error adding received ice candidate", e);
        }
    }
});