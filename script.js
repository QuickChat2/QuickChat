const mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
const LOBBY_TOPIC = 'nullcam_matrix_lobby_v3_1';
const ADMIN_TOPIC = 'nullcam_admin_command_v3_1';

// DOM Elements
const landingScreen = document.getElementById('landing-screen');
const searchingScreen = document.getElementById('searching-screen');
const chatScreen = document.getElementById('chat-screen');
const reportModal = document.getElementById('report-modal');

const startBtn = document.getElementById('start-btn');
const taAgreeCheckbox = document.getElementById('ta-agree');

const cancelSearchBtn = document.getElementById('cancel-search-btn');
const sendBtn = document.getElementById('send-btn');
const skipBtn = document.getElementById('skip-btn');
const reportBtn = document.getElementById('report-btn');
const submitReportBtn = document.getElementById('submit-report-btn');
const cancelReportBtn = document.getElementById('cancel-report-btn');

const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');
const nodeCounter = document.getElementById('node-counter');
const typingIndicator = document.getElementById('typing-indicator');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const reportReason = document.getElementById('report-reason');

let localStream = null;
let peer = null;
let conn = null;
let mediaCall = null;
let myId = null;
let targetPeerId = null;
let isSearching = false;
let chatBuffer = [];
let typingTimeout = null;

// T&A Agreement Gate
taAgreeCheckbox.addEventListener('change', (e) => {
    startBtn.disabled = !e.target.checked;
});

function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Webcam Setup
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
        peer = new Peer({ config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });

        peer.on('open', (id) => {
            myId = id;
            nodeCounter.textContent = `ONLINE // ID: ${id.slice(0, 6)}`;
            resolve();
        });

        peer.on('connection', (incomingConn) => {
            conn = incomingConn;
            targetPeerId = conn.peer;
            setupDataHandlers();
        });

        peer.on('call', (call) => {
            mediaCall = call;
            call.answer(localStream);
            call.on('stream', (stream) => { remoteVideo.srcObject = stream; });
        });
    });
}

// Matchmaking
mqttClient.on('connect', () => mqttClient.subscribe(LOBBY_TOPIC));

mqttClient.on('message', (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        if (isSearching && topic === LOBBY_TOPIC && data.status === 'waiting' && data.id !== myId) {
            isSearching = false;
            mqttClient.publish(LOBBY_TOPIC, JSON.stringify({ id: data.id, status: 'claimed' }));
            connectToPeer(data.id);
        }
    } catch (e) {}
});

async function joinQueue() {
    switchScreen(searchingScreen);
    chatMessages.innerHTML = '';
    chatBuffer = [];
    targetPeerId = null;
    
    const hasMedia = await startWebcam();
    if (!hasMedia) { switchScreen(landingScreen); return; }

    await initPeer();
    isSearching = true;
    mqttClient.publish(LOBBY_TOPIC, JSON.stringify({ id: myId, status: 'waiting' }));
}

function connectToPeer(targetId) {
    targetPeerId = targetId;
    conn = peer.connect(targetId, { reliable: true });
    setupDataHandlers();
    mediaCall = peer.call(targetId, localStream);
    mediaCall.on('stream', (stream) => { remoteVideo.srcObject = stream; });
}

function setupDataHandlers() {
    isSearching = false;
    switchScreen(chatScreen);
    nodeCounter.textContent = "STATUS: P2P LINKED";

    conn.on('data', (packet) => {
        if (typeof packet === 'object' && packet.type === 'typing') {
            if (packet.isTyping) typingIndicator.classList.remove('hidden');
            else typingIndicator.classList.add('hidden');
        } else if (typeof packet === 'string') {
            typingIndicator.classList.add('hidden');
            chatBuffer.push(`Stranger: ${packet}`);
            appendMessage(`STRANGER: ${packet}`, 'msg-peer');
        }
    });

    conn.on('close', () => { 
        appendSystemMessage('>> STRANGER SEVERED CONNECTION.'); 
        typingIndicator.classList.add('hidden');
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

// Step 2: User Reporting & Evidence Catcher Triggers
reportBtn.addEventListener('click', () => { reportModal.classList.remove('hidden'); });
cancelReportBtn.addEventListener('click', () => { reportModal.classList.add('hidden'); });

submitReportBtn.addEventListener('click', () => {
    reportModal.classList.add('hidden');

    // 1. Capture canvas snapshot of the current remote video feed
    const canvas = document.createElement('canvas');
    canvas.width = remoteVideo.videoWidth || 320;
    canvas.height = remoteVideo.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    try {
        ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
    } catch (e) {
        console.error("Canvas snapshot failed:", e);
    }
    const snapshotUrl = canvas.toDataURL('image/jpeg', 0.6);

    // 2. Package evidence bundle (Reason, chat log history, snapshot image, targets)
    const reportEvidence = {
        type: 'report',
        reporterId: myId,
        reportedId: targetPeerId || 'UNKNOWN',
        reason: reportReason.value,
        chatLog: chatBuffer.slice(-10), // Past 10 messages context
        snapshot: snapshotUrl,
        timestamp: new Date().toISOString()
    };

    // 3. Broadcast to Admin MQTT Channel
    mqttClient.publish(ADMIN_TOPIC, JSON.stringify(reportEvidence));

    alert("VIOLATION REPORTED. Evidence bundle captured and transmitted to admin monitoring station.");
    handleSkip();
});

function cleanDisconnect() {
    isSearching = false;
    if (conn) { conn.close(); conn = null; }
    if (mediaCall) { mediaCall.close(); mediaCall = null; }
    remoteVideo.srcObject = null;
    typingIndicator.classList.add('hidden');
}

function handleSkip() {
    cleanDisconnect();
    joinQueue();
}

startBtn.addEventListener('click', joinQueue);
skipBtn.addEventListener('click', handleSkip);
cancelSearchBtn.addEventListener('click', () => { cleanDisconnect(); switchScreen(landingScreen); });

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !conn || !conn.open) return;
    conn.send(text);
    chatBuffer.push(`You: ${text}`);
    appendMessage(`YOU: ${text}`, 'msg-self');
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

window.addEventListener('beforeunload', cleanDisconnect);