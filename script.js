const mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
const LOBBY_TOPIC = 'nullcam_matrix_lobby_v3';
const ADMIN_TOPIC = 'nullcam_admin_command_v3';

// DOM Elements
const landingScreen = document.getElementById('landing-screen');
const searchingScreen = document.getElementById('searching-screen');
const chatScreen = document.getElementById('chat-screen');
const adminScreen = document.getElementById('admin-screen');
const reportModal = document.getElementById('report-modal');

const startBtn = document.getElementById('start-btn');
const taAgreeCheckbox = document.getElementById('ta-agree');
const adminLoginBtn = document.getElementById('admin-login-btn');
const exitAdminBtn = document.getElementById('exit-admin-btn');

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
const aiBlurOverlay = document.getElementById('ai-blur-overlay');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const reportReason = document.getElementById('report-reason');
const adminFeedList = document.getElementById('admin-feed-list');

let localStream = null;
let peer = null;
let conn = null;
let mediaCall = null;
let myId = null;
let isSearching = false;
let isAdmin = false;
let chatBuffer = [];

// Check local storage for active bans
function checkBanStatus() {
    const banData = localStorage.getItem('nullcam_ban');
    if (banData) {
        const ban = JSON.parse(banData);
        if (new Date().getTime() < ban.expiresAt) {
            alert(`ACCESS DENIED: You are banned from NullCam for ${ban.hours} hours.\nReason: ${ban.reason}`);
            startBtn.disabled = true;
            taAgreeCheckbox.disabled = true;
        } else {
            localStorage.removeItem('nullcam_ban');
        }
    }
}
checkBanStatus();

// T&A Agreement Gate
taAgreeCheckbox.addEventListener('change', (e) => {
    startBtn.disabled = !e.target.checked;
});

function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    adminScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Admin Backdoor Login
adminLoginBtn.addEventListener('click', () => {
    const pin = prompt("ENTER ADMIN CLEARANCE PIN:");
    if (pin === "9999") { // Secure PIN example
        isAdmin = true;
        switchScreen(adminScreen);
        mqttClient.subscribe(ADMIN_TOPIC);
    } else {
        alert("ACCESS REJECTED.");
    }
});

exitAdminBtn.addEventListener('click', () => {
    isAdmin = false;
    switchScreen(landingScreen);
});

// Webcam & AI Blur Simulation
async function startWebcam() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        // AI Nudity Blur Simulation Hook (Monitors local feed)
        startAiBlurGuard();
        return true;
    } catch (err) {
        alert("Hardware access required.");
        return false;
    }
}

function startAiBlurGuard() {
    // Conceptual AI Hook: In production, NSFW.js runs inference on localVideo frames here.
    // If >25% NSFW probability is calculated, triggers local blur and alerts admins.
    setInterval(() => {
        // Random probabilistic test for demonstration purposes, or tie to actual AI model
        const nsfwDetected = false; // Toggle true to test AI blur response
        if (nsfwDetected) {
            localVideo.classList.add('blurred-video');
            aiBlurOverlay.classList.remove('hidden');
            triggerAdminFlag("AI_AUTO_FLAG: Nudity probability > 25%");
        }
    }, 5000);
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
        
        if (isAdmin && topic === ADMIN_TOPIC && data.type === 'report') {
            appendAdminFeed(data);
        }

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
    
    const hasMedia = await startWebcam();
    if (!hasMedia) { switchScreen(landingScreen); return; }

    await initPeer();
    isSearching = true;
    mqttClient.publish(LOBBY_TOPIC, JSON.stringify({ id: myId, status: 'waiting' }));
}

function connectToPeer(targetId) {
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
        if (typeof packet === 'string') {
            chatBuffer.push(`Stranger: ${packet}`);
            appendMessage(`STRANGER: ${packet}`, 'msg-peer');
        }
    });

    conn.on('close', () => { appendSystemMessage('>> STRANGER SEVERED CONNECTION.'); });
}

// Reporting & Evidence Catcher
reportBtn.addEventListener('click', () => { reportModal.classList.remove('hidden'); });
cancelReportBtn.addEventListener('click', () => { reportModal.classList.add('hidden'); });

submitReportBtn.addEventListener('click', () => {
    reportModal.classList.add('hidden');
    
    // Capture canvas screenshot of remote video feed
    const canvas = document.createElement('canvas');
    canvas.width = remoteVideo.videoWidth || 320;
    canvas.height = remoteVideo.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
    const snapshotUrl = canvas.toDataURL('image/jpeg', 0.5);

    const reportData = {
        type: 'report',
        targetId: myId,
        reason: reportReason.value,
        chatLog: chatBuffer.slice(-10), // Past 10 chat messages
        snapshot: snapshotUrl,
        timestamp: new Date().toISOString()
    };

    // Broadcast report packet to admins via MQTT command channel
    mqttClient.publish(ADMIN_TOPIC, JSON.stringify(reportData));
    alert("REPORT LOGGED. Evidence sent to Admin Viewing Station. Re-matching...");
    handleSkip();
});

function triggerAdminFlag(reasonText) {
    const reportData = {
        type: 'report',
        targetId: myId,
        reason: reasonText,
        chatLog: chatBuffer.slice(-5),
        timestamp: new Date().toISOString()
    };
    mqttClient.publish(ADMIN_TOPIC, JSON.stringify(reportData));
}

function appendAdminFeed(report) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.innerHTML = `<strong>FLAG:</strong> [${report.reason}] ID: ${report.targetId}<br>
        <button class="neon-btn danger" onclick="issueBan('${report.targetId}', 24, '${report.reason}')">BAN USER (24H)</button>`;
    adminFeedList.prepend(div);
}

window.issueBan = function(targetId, hours, reason) {
    localStorage.setItem('nullcam_ban', JSON.stringify({
        hours: hours,
        reason: reason,
        expiresAt: new Date().getTime() + (hours * 3600 * 1000)
    }));
    alert(`User ${targetId} banned for ${hours} hours.`);
}

function cleanDisconnect() {
    isSearching = false;
    if (conn) { conn.close(); conn = null; }
    if (mediaCall) { mediaCall.close(); mediaCall = null; }
    remoteVideo.srcObject = null;
    localVideo.classList.remove('blurred-video');
    aiBlurOverlay.classList.add('hidden');
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