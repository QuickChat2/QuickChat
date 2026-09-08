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

// P2P / PeerJS Variables
let peer = null;
let conn = null;
let myId = null;

// Helper: Switch active UI screens
function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Initialize PeerJS Node
function initPeer(onReady) {
    if (peer && !peer.destroyed) {
        if (onReady) onReady();
        return;
    }
    
    nodeCounter.textContent = "NODE STATUS: CONNECTING TO RELAY...";

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
        nodeCounter.textContent = `NODE STATUS: ONLINE (ID: ${id.slice(0, 6)}...)`;
        console.log('My node ID is: ' + id);
        if (onReady) onReady();
    });

    peer.on('connection', (incomingConn) => {
        if (conn && conn.open) {
            incomingConn.close();
            return;
        }
        conn = incomingConn;
        setupConnection();
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        nodeCounter.textContent = "NODE STATUS: NETWORK ERROR";
        appendSystemMessage('>> NETWORK ANOMALY DETECTED.');
    });
}

// Start Matchmaking / Mode Selection for Single-Device Testing
function startMatchmaking() {
    switchScreen(searchingScreen);
    chatMessages.innerHTML = '';
    
    initPeer(() => {
        nodeCounter.textContent = "NODE STATUS: READY FOR LINK";
        
        // For single-device Safari/Chrome testing, let's prompt for target ID or host
        setTimeout(() => {
            let targetPeerId = prompt(`Your Node ID is: ${myId}\n\nEnter the Peer ID of the other browser window to connect:`);
            if (targetPeerId && targetPeerId.trim() !== "") {
                connectToPeer(targetPeerId.trim());
            } else {
                appendSystemMessage('>> WAITING FOR INCOMING CONNECTION...');
            }
        }, 500);
    });
}

function connectToPeer(targetId) {
    nodeCounter.textContent = "NODE STATUS: ESTABLISHING LINK...";
    appendSystemMessage(`>> CONNECTING TO NODE: ${targetId}...`);
    
    let tempConn = peer.connect(targetId, { reliable: true });
    
    tempConn.on('open', () => {
        conn = tempConn;
        setupConnection();
    });

    tempConn.on('error', (err) => {
        console.error('Connection fail:', err);
        appendSystemMessage('>> CONNECTION FAILED. CHECK ID AND RETRY.');
        nodeCounter.textContent = "NODE STATUS: LINK FAILED";
    });
}

// When a secure P2P data link is locked in
function setupConnection() {
    nodeCounter.textContent = "NODE STATUS: SECURE P2P LINKED";
    switchScreen(chatScreen);
    appendSystemMessage('>> SECURE P2P LINK ESTABLISHED WITH PEER NODE.');

    conn.on('data', (data) => {
        appendMessage(`STRANGER: ${data}`, 'msg-peer');
    });

    conn.on('close', () => {
        nodeCounter.textContent = "NODE STATUS: PEER DISCONNECTED";
        appendSystemMessage('>> PEER TERMINATED THE CONNECTION.');
    });
}

// Send Message Handler
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !conn || !conn.open) return;
    
    conn.send(text);
    appendMessage(`YOU: ${text}`, 'msg-self');
    messageInput.value = '';
}

// Skip Action
function handleSkip() {
    if (conn) {
        conn.close();
        conn = null;
    }
    switchScreen(landingScreen);
    if (peer) {
        peer.destroy();
        peer = null;
    }
}

// UI Event Listeners
startBtn.addEventListener('click', () => {
    startMatchmaking();
});

cancelSearchBtn.addEventListener('click', () => {
    switchScreen(landingScreen);
    if (peer) {
        peer.destroy();
        peer = null;
    }
});

skipBtn.addEventListener('click', handleSkip);
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

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