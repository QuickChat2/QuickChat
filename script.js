// Connect to Public MQTT WebSockets Broker for Zero-Account Matchmaking
const mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
const LOBBY_TOPIC = 'quickchat_retro_neon_lobby_v1';

// DOM Elements
const landingScreen = document.getElementById('landing-screen');
const searchingScreen = document.getElementById('searching-screen');
const chatScreen = document.getElementById('chat-screen');

const startBtn = document.getElementById('start-btn');
const cancelSearchBtn = document.getElementById('cancel-search-btn');
const sendBtn = document.getElementById('send-btn');
const skipBtn = document.getElementById('skip-btn');

const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');
const nodeCounter = document.getElementById('node-counter');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

// Engine State Variables
let localStream = null;
let peer = null;
let conn = null;      // Text Data
let mediaCall = null; // A/V Data
let myId = null;
let isSearching = false;

function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// 1. Get User Hardware
async function startWebcam() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        console.error("Hardware access denied:", err);
        alert("CRITICAL ERROR: Camera and Microphone access required to access the matrix.");
        return false;
    }
}

// 2. Initialize P2P Node
function initPeer() {
    return new Promise((resolve) => {
        if (peer && !peer.destroyed) return resolve();

        nodeCounter.textContent = "STATUS: GENERATING ANON ID...";
        peer = new Peer({
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        peer.on('open', (id) => {
            myId = id;
            nodeCounter.textContent = `ONLINE // ID: ${id.slice(0, 6)}`;
            resolve();
        });

        // Listen for Incoming Text Connection
        peer.on('connection', (incomingConn) => {
            conn = incomingConn;
            setupDataHandlers();
        });

        // Listen for Incoming Video Connection
        peer.on('call', (call) => {
            mediaCall = call;
            call.answer(localStream);
            call.on('stream', (remoteStream) => {
                remoteVideo.srcObject = remoteStream;
            });
        });

        peer.on('error', (err) => {
            console.error("PeerJS Error:", err);
            cleanDisconnect();
        });
    });
}

// 3. Broker Matchmaking Logic (No Database Required)
mqttClient.on('connect', () => {
    mqttClient.subscribe(LOBBY_TOPIC);
    console.log("Connected to public matchmaking ghost node.");
});

mqttClient.on('message', (topic, message) => {
    if (!isSearching) return; // Ignore if we aren't looking

    try {
        const data = JSON.parse(message.toString());
        
        // If we see someone waiting, and it's not us
        if (data.status === 'waiting' && data.id !== myId) {
            isSearching = false; // Stop looking
            
            // Announce we claimed them so others don't try
            mqttClient.publish(LOBBY_TOPIC, JSON.stringify({ id: data.id, status: 'claimed' }));
            
            connectToPeer(data.id);
        }
    } catch (e) {
        console.error("Garbage data on broker:", e);
    }
});

async function joinQueue() {
    switchScreen(searchingScreen);
    chatMessages.innerHTML = '';
    nodeCounter.textContent = "STATUS: REQUESTING HARDWARE...";

    const hasMedia = await startWebcam();
    if (!hasMedia) {
        switchScreen(landingScreen);
        return;
    }

    await initPeer();
    
    isSearching = true;
    nodeCounter.textContent = "STATUS: BROADCASTING TO MATRIX...";
    
    // Broadcast our presence to the public topic
    mqttClient.publish(LOBBY_TOPIC, JSON.stringify({ id: myId, status: 'waiting' }));
}

// 4. P2P Connection Protocol
function connectToPeer(targetId) {
    nodeCounter.textContent = "STATUS: EXECUTING P2P HANDSHAKE...";
    
    conn = peer.connect(targetId, { reliable: true });
    setupDataHandlers();

    mediaCall = peer.call(targetId, localStream);
    mediaCall.on('stream', (remoteStream) => {
        remoteVideo.srcObject = remoteStream;
    });
}

function setupDataHandlers() {
    isSearching = false;
    switchScreen(chatScreen);
    nodeCounter.textContent = "STATUS: SECURE P2P ESTABLISHED";
    appendSystemMessage('>> QUANTUM TUNNEL LINKED. NODE ANONYMIZED.');

    conn.on('data', (data) => {
        appendMessage(`STRANGER: ${data}`, 'msg-peer');
    });

    conn.on('close', () => {
        appendSystemMessage('>> STRANGER SEVERED THE CONNECTION.');
        nodeCounter.textContent = "STATUS: NODE ORPHANED";
    });
}

// 5. Cleanup & Skipping
function cleanDisconnect() {
    isSearching = false;
    if (conn) { conn.close(); conn = null; }
    if (mediaCall) { mediaCall.close(); mediaCall = null; }
    remoteVideo.srcObject = null;
}

function handleSkip() {
    cleanDisconnect();
    appendSystemMessage('>> SEVERING LINK. RE-ENTERING MATRIX...');
    joinQueue(); 
}

// UI Event Listeners
startBtn.addEventListener('click', joinQueue);
skipBtn.addEventListener('click', handleSkip);
cancelSearchBtn.addEventListener('click', () => {
    cleanDisconnect();
    switchScreen(landingScreen);
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !conn || !conn.open) return;
    
    conn.send(text);
    appendMessage(`YOU: ${text}`, 'msg-self');
    messageInput.value = '';
}

function appendMessage(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Failsafe cleanup
window.addEventListener('beforeunload', cleanDisconnect);