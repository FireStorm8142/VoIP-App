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
const callFeed = document.getElementById('call-feed');
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

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    messageDiv.innerHTML = `
        <span class="meta" style="color: DarkCyan; font-weight: bold">System • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="content" style="background:black">${data.oldUsername} changed name to ${data.newUsername}</span>
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
    chatFeed.innerHTML = `<div class="message"><span class="meta"; style="color: DarkCyan; font-weight: bold">
    System • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    <span class="content" style="background:black">Joined Room: ${code}</span>
    </div>`;
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
    if (data.sender === 'System') {
        messageDiv.className = 'message system';
    } else {
        messageDiv.className = data.isSelf ? 'message self' : 'message';
    }
    messageDiv.innerHTML = `
        <span class="meta">${data.sender === 'System' ? 'System' : data.sender} • ${data.time}</span>
        <span class="content">${data.text}</span>
    `;
    chatFeed.appendChild(messageDiv);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    socket.on('voice-list', (data) => {
        if (data.voice === null) return;
        else{
            (data.voice).forEach(user => {
                const voiceDiv = document.createElement('div');
                voiceDiv.className = 'call-members';
                voiceDiv.innerText=[user.key];
                callFeed.appendChild(voiceDiv);
                callFeed.scrollTop = callFeed.scrollHeight;
            });
        }
    })
});

//----------webRTC-section---------//
let localStream;
let peerConnections = {};

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const btnCall = document.getElementById('btn-join');
const audioContainer = document.getElementById('audio-container');

// Function to initialise a connection with a user
function initWebRTC(targetSocketId) {
    const peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnections[targetSocketId] = peerConnection

    //fires when browser receives ice canidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-signal', {
                targetSocketId: targetSocketId,
                signalData: { type: 'ice-candidate', candidate: event.candidate }
            });
        }
    };

    //fires when an audio stream is received by the browser
    peerConnection.ontrack = (event) => {
        console.log(`Received remote audio stream from ${targetSocketId}`);
        const audioId = `audio-${targetSocketId}`
        if (!document.getElementById(audioId)) {
            const remoteAudio = document.createElement('audio');
            remoteAudio.id = audioId;
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.autoplay = true;
            audioContainer.appendChild(remoteAudio);
            chatFeed.innerHTML += `<div class="message"><span class="meta">System</span>
            <span class="content" style="background: var(--success); color: white;">Audio Connected</span>
            </div>`;
        }
    };
    if (localStream){
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    return peerConnection;
}

// Mic access
async function getMicStream(){
    if(!localStream){
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            console.log("Microphone access granted.");
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone.");
            return false;
        }
    }
    return true;
}

// Starting the call
btnCall.addEventListener('click', async () => {
    if (!currentRoom) return alert("Join a room first!");
    
    const micAccess = await getMicStream();
    if (!micAccess) return;

    btnCall.style.display = 'none';
    btnLeaveVoice.style.display = 'inline-block';

    socket.emit('join-voice', currentRoom);
    socket.emit('get-voice-list', currentRoom);
    console.log("Sent Ready for call Signal");
});

// Muting calls
const btnMute = document.getElementById('btn-mute');
let isMuted = false;

btnMute.addEventListener('click', () => {
    if (!localStream) return; 

    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled=!isMuted);
    btnMute.textContent = isMuted ? "Unmute Mic" : "Mute Mic";
    btnMute.style.backgroundColor = isMuted ? "#ed4245" : "#4f545c"; 
    }
);

// Hanging up calls
const btnLeaveVoice = document.getElementById('btn-leave');

function endCall() {
    for (const socketId in peerConnections){
        peerConnections[socketId].close();
        socket.emit('webrtc-signal', {
            targetSocketId: socketId,
            signalData: {type: 'hangup'}
        });
        delete peerConnections[socketId];
    }

    if (localStream){
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        };

    audioContainer.innerHTML = '';
    btnCall.style.display = 'inline-block';
    btnLeaveVoice.style.display = 'none';
    btnMute.textContent = "Mute Mic";
    btnMute.style.backgroundColor = "#4f545c";
    isMuted = false;

    chatFeed.innerHTML += `<div class="message"><span class="meta">System</span>
    <span class="content" style="background: var(--danger); color: white;">Voice Disconnected</span>
    </div>`;
    chatFeed.scrollTop = chatFeed.scrollHeight;
}
btnLeaveVoice.addEventListener('click', endCall)

// Handling incoming voice connection signals
socket.on('user-joined-voice', async (data) => {
    const { socketId, username } = data;

    if (localStream) {
        console.log(`${username} is ready to join voice, creating offer`);
        const peerConnection = initWebRTC(socketId);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer); 

        socket.emit('webrtc-signal', {
            targetSocketId: socketId,
            signalData: { type: 'offer', sdp: offer }
        });
    }
});

// Handling incoming webRTC Signals (ICE Canidates, offer, answer etc..)
socket.on('webrtc-signal', async (data) => {
    const { senderSocketId, signalData } = data;

    let peerConnection = peerConnections[senderSocketId];

    if (signalData.type === 'offer'){
        console.log(`Received offer from ${senderSocketId}`);
        await getMicStream();

        if (!peerConnection) peerConnection = initWebRTC(senderSocketId);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('webrtc-signal', {
            targetSocketId: senderSocketId,
            signalData: {type: 'answer', sdp: answer}
        });
        btnCall.style.display='none';
        btnLeaveVoice.style.display='inline-block';
    }

    if (signalData.type === 'answer'){
        console.log(`Received from ${senderSocketId}`);
        if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
    }

    if (signalData.type === 'ice-candidate'){
        if (peerConnection){
            try{
                await peerConnection.addIceCandidate(new RTCIceCandidate(signalData.candidate));
            }catch (e){
                console.error("Error adding ice canidate", e);
            }
        }
    }

    if (signalData === 'hangup'){
        console.log(`User ${senderSocketId}hung up.`);
        if (peerConnection){
            peerConnection.close();
            delete peerConnections[senderSocketId];
        }
        const audioElement = document.getElementById(`audio-${senderSocketId}`);
        if (audioElement) audioElement.remove();
    }
});