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

// P2P / PeerJS Variables
let peer = null;
let conn = null;
let myId = null;
let isSearching = false;

// Helper: Switch active UI screens
function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Initialize PeerJS Node
function initPeer() {
    if (peer) return;
    
    // Using a public PeerJS cloud server for zero-config routing
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
        console.log('My node ID is: ' + id);
        if (isSearching) {
            findOrCreatePeer();
        }
    });

    // Incoming connection from a stranger
    peer.on('connection', (incomingConn) => {
        if (conn) {
            incomingConn.close(); // Already busy
            return;
        }
        conn = incomingConn;
        setupConnection();
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        appendSystemMessage('>> NETWORK ANOMALY DETECTED. RETRYING...');
        setTimeout(resetToLanding, 2000);
    });
}

// Matchmaking Logic (Pseudo-random pairing mechanism)
function findOrCreatePeer() {
    if (!peer || peer.disconnected) return;
    
    appendSystemMessage('>> SCANNING MATRIX FOR ACTIVE NODES...');
    
    // Generates a rolling window target ID so people hitting search around the same time match up
    const timestampBlock = Math.floor(Date.now() / 5000); 
    const targetId = `quickchat-node-${timestampBlock}-${Math.floor(Math.random() * 5)}`;
    
    if (targetId === myId) {
        setTimeout(findOrCreatePeer, 1000);
        return;
    }

    let tempConn = peer.connect(targetId);
    
    tempConn.on('open', () => {
        conn = tempConn;
        setupConnection();
    });

    tempConn.on('error', () => {
        // If target doesn't exist yet, wait a moment and try scanning again
        setTimeout(() => {
            if (isSearching) {
                setTimeout(findOrCreatePeer, 2000);
            }
        }, 1000);
    });
}

// When a secure P2P data link is locked in
function setupConnection() {
    isSearching = false;
    switchScreen(chatScreen);
    chatMessages.innerHTML = '';
    appendSystemMessage('>> SECURE P2P LINK ESTABLISHED WITH PEER NODE.');

    conn.on('data', (data) => {
        appendMessage(`STRANGER: ${data}`, 'msg-peer');
    });

    conn.on('close', () => {
        appendSystemMessage('>> PEER TERMINATED THE CONNECTION.');
        setTimeout(handleSkip, 1500);
    });
}

// Send Message Handler
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !conn || conn.open === false) return;
    
    conn.send(text);
    appendMessage(`YOU: ${text}`, 'msg-self');
    messageInput.value = '';
}

// Skip Action: Loops straight back to searching, NOT home
function handleSkip() {
    if (conn) {
        conn.close();
        conn = null;
    }
    
    switchScreen(searchingScreen);
    isSearching = true;
    
    if (!peer) {
        initPeer();
    } else {
        setTimeout(findOrCreatePeer, 1500);
    }
}

// UI Event Listeners
startBtn.addEventListener('click', () => {
    switchScreen(searchingScreen);
    isSearching = true;
    
    if (!peer) {
        initPeer();
    } else {
        findOrCreatePeer();
    }
});

cancelSearchBtn.addEventListener('click', () => {
    isSearching = false;
    if (peer) {
        peer.destroy();
        peer = null;
    }
    switchScreen(landingScreen);
});

skipBtn.addEventListener('click', handleSkip);

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function resetToLanding() {
    isSearching = false;
    if (conn) { conn.close(); conn = null; }
    if (peer) { peer.destroy(); peer = null; }
    switchScreen(landingScreen);
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