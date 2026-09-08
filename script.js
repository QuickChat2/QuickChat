// Firebase Config - Replace with your project details from firebase.google.com
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-app.firebaseapp.com",
    databaseURL: "https://your-app-default-rtdb.firebaseio.com",
    projectId: "your-app",
    storageBucket: "your-app.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const queueRef = db.ref('matchmaking_queue');

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

// WebRTC State
let localStream = null;
let peer = null;
let conn = null;      // Data Connection
let mediaCall = null; // Media Call
let myId = null;
let queueKey = null;

function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Request Media Stream (iPad Camera & Audio)
async function startWebcam() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        console.error("Camera access failed:", err);
        alert("Camera and Microphone access are required for QuickChat.");
        return false;
    }
}

// Initialize Peer Node
function initPeer() {
    return new Promise((resolve) => {
        if (peer && !peer.destroyed) return resolve();

        nodeCounter.textContent = "NODE STATUS: CONNECTING TO MATRIX...";
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
            nodeCounter.textContent = `NODE ONLINE // ID: ${id.slice(0, 6)}...`;
            resolve();
        });

        // Handle incoming data channel
        peer.on('connection', (incomingConn) => {
            conn = incomingConn;
            setupDataHandlers();
        });

        // Handle incoming video call
        peer.on('call', (call) => {
            mediaCall = call;
            call.answer(localStream);
            call.on('stream', (remoteStream) => {
                remoteVideo.srcObject = remoteStream;
            });
        });

        peer.on('error', (err) => {
            console.error(err);
            cleanDisconnect();
        });
    });
}

// Firebase Matchmaking Broker
async function joinQueue() {
    switchScreen(searchingScreen);
    chatMessages.innerHTML = '';

    const hasMedia = await startWebcam();
    if (!hasMedia) {
        switchScreen(landingScreen);
        return;
    }

    await initPeer();

    // Check if another peer is waiting in the queue
    queueRef.once('value').then((snapshot) => {
        const queue = snapshot.val();
        let targetPeerId = null;

        if (queue) {
            const keys = Object.keys(queue);
            for (let key of keys) {
                if (queue[key] !== myId) {
                    targetPeerId = queue[key];
                    // Remove matched peer from queue
                    db.ref(`matchmaking_queue/${key}`).remove();
                    break;
                }
            }
        }

        if (targetPeerId) {
            // We found a waiting peer -> Initiate connection
            connectToPeer(targetPeerId);
        } else {
            // Queue is empty -> Push our ID and wait
            const newQueueItem = queueRef.push(myId);
            queueKey = newQueueItem.key;
            newQueueItem.onDisconnect().remove(); // Clean up if window closes

            // Listen for direct P2P incoming connection
            nodeCounter.textContent = "SEARCHING FOR PEER...";
        }
    });
}

function connectToPeer(targetId) {
    nodeCounter.textContent = "LINKING TO PEER...";
    
    // Connect Data Channel
    conn = peer.connect(targetId, { reliable: true });
    setupDataHandlers();

    // Initiate Video Stream Call
    mediaCall = peer.call(targetId, localStream);
    mediaCall.on('stream', (remoteStream) => {
        remoteVideo.srcObject = remoteStream;
    });
}

function setupDataHandlers() {
    removeFromQueue();
    switchScreen(chatScreen);
    nodeCounter.textContent = "NODE LINKED // SECURE P2P";
    appendSystemMessage('>> P2P VIDEO & DATA LINK ESTABLISHED.');

    conn.on('data', (data) => {
        appendMessage(`STRANGER: ${data}`, 'msg-peer');
    });

    conn.on('close', () => {
        appendSystemMessage('>> PEER TERMINATED LINK.');
        nodeCounter.textContent = "NODE DISCONNECTED";
    });
}

function removeFromQueue() {
    if (queueKey) {
        db.ref(`matchmaking_queue/${queueKey}`).remove();
        queueKey = null;
    }
}

function cleanDisconnect() {
    removeFromQueue();
    if (conn) conn.close();
    if (mediaCall) mediaCall.close();
    conn = null;
    mediaCall = null;
    remoteVideo.srcObject = null;
}

function handleSkip() {
    cleanDisconnect();
    joinQueue(); // Immediate loop into queue
}

// UI Triggers
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

// Safari / Mobile Lifecycle cleanup
window.addEventListener('beforeunload', cleanDisconnect);