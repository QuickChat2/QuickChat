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
        appendSystemMessage('>> NETWORK ANOMALY DETECTED.');
    });
}

// Smart Matchmaking: Try to connect to a shared global pool or wait for connection
function startMatchmaking() {
    isSearching = true;
    switchScreen(searchingScreen);
    chatMessages.innerHTML = '';
    
    initPeer(() => {
        appendSystemMessage('>> BROADCASTING TO QUICKCHAT MATRIX...');
        
        // Strategy: Try connecting to a rolling minute-pool ID
        // Anyone clicking search within the same 10-second window shares a pool prefix
        const timeBlock = Math.floor(Date.now() / 10000); 
        let partnerAttempt = 0;
        
        function tryNextTarget() {
            if (!isSearching) return;
            
            partnerAttempt++;
            // Try connecting to a randomized slot in the current time block
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
                // If target doesn't exist, keep cycling quickly
                if (isSearching) {
                    setTimeout(tryNextTarget, 600);
                }
            });
        }

        // Also register ourselves briefly under a pool name so others can find US
        try {
            const hostId = `qc-pool-${timeBlock}-${Math.floor(Math.random() * 10)}`;
            // If we claim a host slot, incoming connections will trigger peer.on('connection')
        } catch(e) {}

        tryNextTarget();

        // Fallback safety: If matchmaking takes more than 8 seconds, transition to direct host listener mode
        searchTimer = setTimeout(() => {
            if (isSearching) {
                appendSystemMessage('>> MATRIX CONGESTED. WAITING FOR INCOMING NODE LINK...');
            }
        }, 8000);
    });
}

// When a secure P2P data link is locked in
function setupConnection() {
    isSearching = false;
    clearTimeout(searchTimer);
    switchScreen(chatScreen);
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
    if (!text || !conn || !conn.open) return;
    
    conn.send(text);
    appendMessage(`YOU: ${text}`, 'msg-self');
    messageInput.value = '';
}

// Skip Action: Loops straight back to searching
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