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
let isSearching = false;
let searchTimer = null;

// Helper: Switch active UI screens
function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Initialize PeerJS Node with a clean public broker
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
        nodeCounter.textContent = `NODE STATUS: ONLINE (ID ACTIVE)`;
        console.log('My node ID is: ' + id);
        if (onReady) onReady();
    });

    peer.on('connection', (incomingConn) => {
        if (conn && conn.open) {
            incomingConn.close(); // Busy with someone else
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

// Smart Matchmaking
function startMatchmaking() {
    isSearching = true;
    switchScreen(searchingScreen);
    chatMessages.innerHTML = '';
    
    initPeer(() => {
        nodeCounter.textContent = "NODE STATUS: SCANNING MATRIX...";
        appendSystemMessage('>> BROADCASTING TO QUICKCHAT MATRIX...');
        
        const timeBlock = Math.floor(Date.now() / 10000); 
        let partnerAttempt = 0;
        
        function tryNextTarget() {
            if (!isSearching) return;
            
            partnerAttempt++;
            const targetId = `qc-pool-${timeBlock}-${partnerAttempt}`;
            
            if (targetId === myId) {
                tryNextTarget();
                return;
            }

            let tempConn = peer.connect(targetId, { reliable: true });
            
            tempConn.on('open', () => {
                conn = tempConn;
                setupConnection();
            });

            tempConn.on('error', () => {
                if (isSearching) {
                    setTimeout(tryNextTarget, 600);
                }
            });
        }

        tryNextTarget();

        searchTimer = setTimeout(() => {
            if (isSearching) {
                nodeCounter.textContent = "NODE STATUS: LISTENING FOR PEERS...";
                appendSystemMessage('>> MATRIX CONGESTED. WAITING FOR INCOMING NODE LINK...');
            }
        }, 8000);
    });
}

// When a secure P2P data link is locked in
function setupConnection() {
    isSearching = false;
    clearTimeout(searchTimer);
    nodeCounter.textContent = "NODE STATUS: SECURE P2P LINKED";
    switchScreen(chatScreen);
    appendSystemMessage('>> SECURE P2P LINK ESTABLISHED WITH PEER NODE.');

    conn.on('data', (data) => {
        appendMessage(`STRANGER: ${data}`, 'msg-peer');
    });

    conn.on('close', () => {
        nodeCounter.textContent = "NODE STATUS: PEER DISCONNECTED";
        appendSystemMessage('>> PEER TERMINATED THE CONNECTION.');
        setTimeout(handleSkip, 1500);
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
    startMatchmaking();
}

// UI Event Listeners
startBtn.addEventListener('click', () => {
    startMatchmaking();
});

cancelSearchBtn.addEventListener('click', () => {
    isSearching = false;
    clearTimeout(searchTimer);
    nodeCounter.textContent = peer ? "NODE STATUS: ONLINE (ID ACTIVE)" : "NODE STATUS: OFFLINE";
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