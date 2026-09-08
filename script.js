// MQTT Broker for Matchmaking
const mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
const LOBBY_TOPIC = 'quickchat_retro_neon_lobby_v2';

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
const typingIndicator = document.getElementById('typing-indicator');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

// State Variables
let localStream = null;
let peer = null;
let conn = null;
let mediaCall = null;
let myId = null;
let isSearching = false;
let typingTimeout = null;

// --- AUDIO SYNTHESIZER (Retro Beeps) ---
function playTone(freq, type, duration) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        // AudioContext policy restrictions bypassed on interaction
    }
}

const sounds = {
    click: () => playTone(600, 'sine', 0.05),
    connect: () => { playTone(440, 'triangle', 0.1); setTimeout(() => playTone(880, 'triangle', 0.2), 100); },
    send: () => playTone(550, 'square', 0.08),
    receive: () => playTone(750, 'sine', 0.1)
};

function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Media Setup
async function startWebcam() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        alert("Camera and Microphone access required.");
        return false;
    }
}

// PeerJS Setup
function initPeer() {
    return new Promise((resolve) => {
        if (peer && !peer.destroyed) return resolve();

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

        peer.on('connection', (incomingConn) => {
            conn = incomingConn;
            setupDataHandlers();
        });

        peer.on('call', (call) => {
            mediaCall = call;
            call.answer(localStream);
            call.on('stream', (remoteStream) => {
                remoteVideo.srcObject = remoteStream;
            });
        });

        peer.on('error', () => cleanDisconnect());
    });
}

// Matchmaking Logic
mqttClient.on('connect', () => mqttClient.subscribe(LOBBY_TOPIC));

mqttClient.on('message', (topic, message) => {
    if (!isSearching) return;
    try {
        const data = JSON.parse(message.toString());
        if (data.status === 'waiting' && data.id !== myId) {
            isSearching = false;
            mqttClient.publish(LOBBY_TOPIC, JSON.stringify({ id: data.id, status: 'claimed' }));
            connectToPeer(data.id);
        }
    } catch (e) {}
});

async function joinQueue() {
    sounds.click();
    switchScreen(searchingScreen);
    chatMessages.innerHTML = '';
    
    const hasMedia = await startWebcam();
    if (!hasMedia) {
        switchScreen(landingScreen);
        return;
    }

    await initPeer();
    isSearching = true;
    mqttClient.publish(LOBBY_TOPIC, JSON.stringify({ id: myId, status: 'waiting' }));
}

function connectToPeer(targetId) {
    conn = peer.connect(targetId, { reliable: true });
    setupDataHandlers();

    mediaCall = peer.call(targetId, localStream);
    mediaCall.on('stream', (remoteStream) => {
        remoteVideo.srcObject = remoteStream;
    });
}

// Data Handlers & Protocol
function setupDataHandlers() {
    isSearching = false;
    switchScreen(chatScreen);
    nodeCounter.textContent = "STATUS: SECURE P2P LINKED";
    sounds.connect();
    appendSystemMessage('>> QUANTUM TUNNEL LINKED.');

    conn.on('data', (packet) => {
        // Handle object packets (typing indicator vs text message)
        if (typeof packet === 'object' && packet.type === 'typing') {
            if (packet.isTyping) {
                typingIndicator.classList.remove('hidden');
            } else {
                typingIndicator.classList.add('hidden');
            }
        } else {
            typingIndicator.classList.add('hidden');
            appendMessage(`STRANGER: ${packet}`, 'msg-peer');
            sounds.receive();
        }
    });

    conn.on('close', () => {
        appendSystemMessage('>> STRANGER SEVERED CONNECTION.');
        nodeCounter.textContent = "STATUS: DISCONNECTED";
    });
}

// Typing Broadcast Handler
messageInput.addEventListener('input', () => {
    if (!conn || !conn.open) return;
    conn.send({ type: 'typing', isTyping: true });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        if (conn && conn.open) conn.send({ type: 'typing', isTyping: false });
    }, 1000);
});

function cleanDisconnect() {
    isSearching = false;
    if (conn) { conn.close(); conn = null; }
    if (mediaCall) { mediaCall.close(); mediaCall = null; }
    remoteVideo.srcObject = null;
    typingIndicator.classList.add('hidden');
}

function handleSkip() {
    sounds.click();
    cleanDisconnect();
    joinQueue();
}

// UI Triggers
startBtn.addEventListener('click', joinQueue);
skipBtn.addEventListener('click', handleSkip);
cancelSearchBtn.addEventListener('click', () => {
    sounds.click();
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
    sounds.send();
    messageInput.value = '';
    
    if (conn && conn.open) conn.send({ type: 'typing', isTyping: false });
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

// Mobile Keyboard Fix (Visual Viewport resizing for iPads/Phones)
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        document.body.style.height = `${window.visualViewport.height}px`;
    });
}

window.addEventListener('beforeunload', cleanDisconnect);