const mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
const LOBBY_TOPIC = 'nullcam_matrix_lobby_v3_7';
const ADMIN_TOPIC = 'nullcam_admin_command_v3_7';

// DOM Elements
const landingScreen = document.getElementById('landing-screen');
const searchingScreen = document.getElementById('searching-screen');
const chatScreen = document.getElementById('chat-screen');
const adminScreen = document.getElementById('admin-screen');
const reportModal = document.getElementById('report-modal');
const reviewModal = document.getElementById('review-modal');

const startBtn = document.getElementById('start-btn');
const taAgreeCheckbox = document.getElementById('ta-agree');
const aiBlurToggle = document.getElementById('ai-blur-toggle');
const aiStatusText = document.getElementById('ai-status-text');
const adminTriggerEl = document.getElementById('admin-trigger');

const cancelSearchBtn = document.getElementById('cancel-search-btn');
const sendBtn = document.getElementById('send-btn');
const skipBtn = document.getElementById('skip-btn');
const reportBtn = document.getElementById('report-btn');
const submitReportBtn = document.getElementById('submit-report-btn');
const cancelReportBtn = document.getElementById('cancel-report-btn');
const exitAdminBtn = document.getElementById('exit-admin-btn');
const closeReviewBtn = document.getElementById('close-review-btn');
const wipeBansBtn = document.getElementById('wipe-bans-btn');

const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');
const nodeCounter = document.getElementById('node-counter');
const typingIndicator = document.getElementById('typing-indicator');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const reportReason = document.getElementById('report-reason');
const aiBlurOverlay = document.getElementById('ai-blur-overlay');
const adminFeedList = document.getElementById('admin-feed-list');
const adminBansList = document.getElementById('admin-bans-list');
const reviewModalContent = document.getElementById('review-modal-content');

let localStream = null;
let peer = null;
let conn = null;
let mediaCall = null;
let myId = null;
let targetPeerId = null;
let isSearching = false;
let isAdmin = false;
let chatBuffer = [];
let typingTimeout = null;

// Persistent Bans Registry via localStorage for Admin station
function getActiveBansRegistry() {
    try {
        const stored = localStorage.getItem('nullcam_admin_bans_registry');
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
}

function saveActiveBansRegistry(registry) {
    try {
        localStorage.setItem('nullcam_admin_bans_registry', JSON.stringify(registry));
    } catch (e) {}
}

// AI Model State
let nsfwModel = null;
let aiInterval = null;

// Check local storage for active bans on startup
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

// Admin Trigger Logic (Keyboard shortcut + Mobile Triple-Tap)
function triggerAdminPrompt() {
    const pin = prompt("ENTER ADMIN CLEARANCE PIN:");
    if (pin === "9999") { // Configurable Admin PIN
        isAdmin = true;
        switchScreen(adminScreen);
        mqttClient.subscribe(ADMIN_TOPIC);
        renderAdminBansList();
        alert("ADMIN CLEARANCE GRANTED: Connected to live matrix command station.");
    } else {
        alert("INVALID SECURITY CREDENTIALS.");
    }
}

// Desktop Keyboard Shortcut: Ctrl + Shift + A (or Cmd + Shift + A)
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        triggerAdminPrompt();
    }
});

// Mobile / Screen-Keyboard Discreet Trigger: Triple-tap subtitle text
let adminTapCount = 0;
let adminTapTimer = null;
adminTriggerEl.addEventListener('click', () => {
    adminTapCount++;
    clearTimeout(adminTapTimer);
    if (adminTapCount >= 3) {
        adminTapCount = 0;
        triggerAdminPrompt();
    } else {
        adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 1000);
    }
});

exitAdminBtn.addEventListener('click', () => {
    isAdmin = false;
    switchScreen(landingScreen);
});

// Load NSFW.js AI Model on Startup
async function loadAiModel() {
    if (nsfwModel) return;
    try {
        aiStatusText.textContent = "AI: LOADING MODEL...";
        await tf.ready();
        tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
        nsfwModel = await nsfwjs.load();
        aiStatusText.textContent = "AI: ACTIVE & SHIELDING";
    } catch (err) {
        console.error("AI Model Load Error:", err);
        aiStatusText.textContent = "AI: OFFLINE (FALLBACK)";
    }
}
loadAiModel();

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

// Client-Side AI Nudity Scanner & Auto-Flag Loop
function startAiScanner() {
    if (aiInterval) clearInterval(aiInterval);

    aiInterval = setInterval(async () => {
        if (!nsfwModel || !localVideo || localVideo.paused || localVideo.ended || localVideo.readyState < 2) return;

        try {
            const predictions = await nsfwModel.classify(localVideo, 3);
            const violation = predictions.find(p => 
                (p.className === 'Porn' || p.className === 'Hentai' || p.className === 'Sexy') && p.probability > 0.25
            );

            if (violation) {
                const triggerReason = `AI_AUTO_FLAG: Detected [${violation.className}] at ${(violation.probability * 100).toFixed(1)}% confidence.`;
                
                triggerAdminAutoFlag(triggerReason, predictions);

                if (aiBlurToggle.checked) {
                    localVideo.classList.add('blurred-video');
                    aiBlurOverlay.classList.remove('hidden');
                } else {
                    localVideo.classList.remove('blurred-video');
                    aiBlurOverlay.classList.add('hidden');
                }
            } else {
                localVideo.classList.remove('blurred-video');
                aiBlurOverlay.classList.add('hidden');
            }
        } catch (err) {
            console.error("AI Frame Analysis Error:", err);
        }
    }, 4000);
}

function triggerAdminAutoFlag(reasonText, predictions) {
    const canvas = document.createElement('canvas');
    canvas.width = localVideo.videoWidth || 320;
    canvas.height = localVideo.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    try {
        ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
    } catch (e) {}
    const snapshotUrl = canvas.toDataURL('image/jpeg', 0.5);

    const autoFlagData = {
        type: 'report',
        reporterId: 'SYSTEM_AI_SHIELD',
        reportedId: myId,
        reason: reasonText,
        predictions: predictions,
        chatLog: chatBuffer.slice(-5),
        snapshot: snapshotUrl,
        timestamp: new Date().toISOString()
    };

    mqttClient.publish(ADMIN_TOPIC, JSON.stringify(autoFlagData));
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

// Matchmaking & Admin Feed Listener
mqttClient.on('connect', () => {
    mqttClient.subscribe(LOBBY_TOPIC);
    mqttClient.subscribe(ADMIN_TOPIC);
});

mqttClient.on('message', (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        
        // Handle incoming reports on admin station
        if (isAdmin && topic === ADMIN_TOPIC && data.type === 'report') {
            appendAdminFeedCard(data);
        }

        // Track ban records in registry if sent on admin topic
        if (topic === ADMIN_TOPIC && data.type === 'ban_command') {
            const registry = getActiveBansRegistry();
            registry[data.targetId] = data;
            saveActiveBansRegistry(registry);
            if (isAdmin) renderAdminBansList();
        }

        // Remove from registry if unbanned
        if (topic === ADMIN_TOPIC && data.type === 'unban_command') {
            const registry = getActiveBansRegistry();
            delete registry[data.targetId];
            saveActiveBansRegistry(registry);
            if (isAdmin) renderAdminBansList();
        }

        // Handle incoming ban commands broadcasted across the network
        if (topic === ADMIN_TOPIC && data.type === 'ban_command' && data.targetId === myId) {
            localStorage.setItem('nullcam_ban', JSON.stringify({
                hours: data.hours,
                reason: data.reason,
                expiresAt: new Date().getTime() + (data.hours * 3600 * 1000),
                snapshot: data.snapshot,
                chatLog: data.chatLog
            }));
            alert(`SECURITY NOTICE: You have been banned from NullCam for ${data.hours} hours.\nReason: ${data.reason}`);
            window.location.reload();
        }

        // Handle incoming unban commands broadcasted across the network
        if (topic === ADMIN_TOPIC && data.type === 'unban_command' && data.targetId === myId) {
            localStorage.removeItem('nullcam_ban');
            alert("SECURITY NOTICE: Your ban has been lifted by admin authority. Access restored.");
            window.location.reload();
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
    
    startAiScanner();

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

// User Reporting & Evidence Catcher Triggers
reportBtn.addEventListener('click', () => { reportModal.classList.remove('hidden'); });
cancelReportBtn.addEventListener('click', () => { reportModal.classList.add('hidden'); });

submitReportBtn.addEventListener('click', () => {
    reportModal.classList.add('hidden');

    const canvas = document.createElement('canvas');
    canvas.width = remoteVideo.videoWidth || 320;
    canvas.height = remoteVideo.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    try {
        ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
    } catch (e) {}
    const snapshotUrl = canvas.toDataURL('image/jpeg', 0.6);

    const reportEvidence = {
        type: 'report',
        reporterId: myId,
        reportedId: targetPeerId || 'UNKNOWN',
        reason: reportReason.value,
        chatLog: chatBuffer.slice(-10),
        snapshot: snapshotUrl,
        timestamp: new Date().toISOString()
    };

    mqttClient.publish(ADMIN_TOPIC, JSON.stringify(reportEvidence));
    alert("VIOLATION REPORTED. Evidence bundle captured and transmitted to admin monitoring station.");
    handleSkip();
});

// Admin Dashboard Feed Card Renderer
function appendAdminFeedCard(report) {
    if (adminFeedList.querySelector('.system-msg')) {
        adminFeedList.innerHTML = '';
    }

    const card = document.createElement('div');
    card.className = 'admin-card';
    
    let chatLogHtml = report.chatLog ? report.chatLog.join('<br>') : 'No chat history';
    card.dataset.reportPayload = JSON.stringify(report);

    card.innerHTML = `
        <div><strong>TIME:</strong> ${new Date(report.timestamp).toLocaleTimeString()}</div>
        <div><strong>TARGET ID:</strong> ${report.reportedId}</div>
        <div><strong>REASON:</strong> <span style="color:var(--neon-yellow);">${report.reason}</span></div>
        <div><strong>RECENT CHAT:</strong><br><div style="background:#111; padding:4px; font-size:0.75rem; color:#a5f3fc;">${chatLogHtml}</div></div>
        <div><strong>EVIDENCE SNAPSHOT:</strong><br><img src="${report.snapshot}" alt="Evidence Frame"></div>
        <button class="neon-btn danger" onclick="issueBanCommand(this)" style="margin-top: 5px;">BAN USER</button>
    `;
    adminFeedList.prepend(card);
}

window.issueBanCommand = function(btnEl) {
    const card = btnEl.closest('.admin-card');
    const report = JSON.parse(card.dataset.reportPayload);

    const hoursInput = prompt("Enter ban duration in hours (e.g., 24):", "24");
    const hours = parseInt(hoursInput);
    if (!hours || isNaN(hours)) return;

    const reasonInput = prompt("Enter ban reason:", report.reason);

    const banCommand = {
        type: 'ban_command',
        targetId: report.reportedId,
        hours: hours,
        reason: reasonInput || report.reason,
        snapshot: report.snapshot,
        chatLog: report.chatLog,
        timestamp: new Date().toISOString()
    };

    mqttClient.publish(ADMIN_TOPIC, JSON.stringify(banCommand));
    
    const registry = getActiveBansRegistry();
    registry[banCommand.targetId] = banCommand;
    saveActiveBansRegistry(registry);
    renderAdminBansList();

    alert(`Ban command issued for user ${report.reportedId} (${hours} hours). Added to Active Bans Registry.`);
};

// Render Banned Users Registry List from localStorage
function renderAdminBansList() {
    const registry = getActiveBansRegistry();
    const keys = Object.keys(registry);
    
    if (keys.length === 0) {
        adminBansList.innerHTML = '<div class="system-msg">No active user bans recorded.</div>';
        return;
    }

    adminBansList.innerHTML = '';
    keys.forEach((targetId) => {
        const ban = registry[targetId];
        const item = document.createElement('div');
        item.className = 'admin-card';
        item.style.borderColor = 'var(--neon-pink)';
        item.innerHTML = `
            <div><strong>NODE ID:</strong> ${targetId.slice(0, 10)}...</div>
            <div><strong>REASON:</strong> <span style="color:var(--neon-yellow);">${ban.reason}</span></div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button class="neon-btn" onclick="reviewBanFile('${targetId}')" style="flex:1; font-size: 0.75rem;">REVIEW FILE</button>
                <button class="neon-btn warning" onclick="executeUnban('${targetId}')" style="flex:1; font-size: 0.75rem;">UNBAN</button>
            </div>
        `;
        adminBansList.appendChild(item);
    });
}

// Review Ban File Modal
window.reviewBanFile = function(targetId) {
    const registry = getActiveBansRegistry();
    const ban = registry[targetId];
    if (!ban) return;

    let chatHtml = ban.chatLog && ban.chatLog.length > 0 ? ban.chatLog.join('<br>') : 'No chat data logged.';
    let snapshotHtml = ban.snapshot ? `<img src="${ban.snapshot}" style="max-width:100%; border:1px solid var(--neon-cyan); margin-top:5px;" alt="Snapshot">` : 'No snapshot available.';

    reviewModalContent.innerHTML = `
        <p><strong>TARGET ID:</strong> ${ban.targetId}</p>
        <p><strong>DURATION:</strong> ${ban.hours} Hours</p>
        <p><strong>REASON:</strong> <span style="color:var(--neon-yellow);">${ban.reason}</span></p>
        <p style="margin-top:8px;"><strong>LOGGED CHAT BUFFER:</strong></p>
        <div style="background:#111; padding:6px; font-size:0.75rem; color:#a5f3fc; border:1px solid #333;">${chatHtml}</div>
        <p style="margin-top:8px;"><strong>EVIDENCE SNAPSHOT:</strong></p>
        ${snapshotHtml}
    `;
    reviewModal.classList.remove('hidden');
};

closeReviewBtn.addEventListener('click', () => {
    reviewModal.classList.add('hidden');
});

// Execute Instant Unban Broadcast
window.executeUnban = function(targetId) {
    const unbanCommand = {
        type: 'unban_command',
        targetId: targetId
    };

    mqttClient.publish(ADMIN_TOPIC, JSON.stringify(unbanCommand));
    
    const registry = getActiveBansRegistry();
    delete registry[targetId];
    saveActiveBansRegistry(registry);
    renderAdminBansList();

    alert(`Unban command broadcasted successfully for node: ${targetId}`);
};

// Wipe All Bans Button Handler (Touch-friendly reset)
wipeBansBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all local ban restrictions and wipe the admin ban registry?")) {
        localStorage.removeItem('nullcam_ban');
        localStorage.removeItem('nullcam_admin_bans_registry');
        alert("All local bans and registries wiped. Reloading system...");
        window.location.reload();
    }
});

function cleanDisconnect() {
    isSearching = false;
    if (aiInterval) { clearInterval(aiInterval); aiInterval = null; }
    if (conn) { conn.close(); conn = null; }
    if (mediaCall) { mediaCall.close(); mediaCall = null; }
    remoteVideo.srcObject = null;
    localVideo.classList.remove('blurred-video');
    aiBlurOverlay.classList.add('hidden');
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