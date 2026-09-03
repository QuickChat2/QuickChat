const landingScreen = document.getElementById('landing-screen');
const searchingScreen = document.getElementById('searching-screen');
const chatScreen = document.getElementById('chat-screen');

const startBtn = document.getElementById('start-btn');
const cancelSearchBtn = document.getElementById('cancel-search-btn');
const sendBtn = document.getElementById('send-btn');
const skipBtn = document.getElementById('skip-btn');

const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');

let searchTimeout;

// Switch screens helper
function switchScreen(screen) {
    landingScreen.classList.add('hidden');
    searchingScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// 1. Start searching button clicked
startBtn.addEventListener('click', () => {
    switchScreen(searchingScreen);
    
    // Simulate finding a stranger after 2.5 seconds (Ready for WebRTC hookup later)
    searchTimeout = setTimeout(() => {
        switchScreen(chatScreen);
        appendSystemMessage(">> SECURE CONNECTION SECURED. SAY HELLO.");
    }, 2500);
});

// 2. Cancel search
cancelSearchBtn.addEventListener('click', () => {
    clearTimeout(searchTimeout);
    switchScreen(landingScreen);
});

// 3. Send message handler
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    
    appendMessage(`YOU: ${text}`, 'msg-self');
    messageInput.value = '';
    
    // Mock auto-reply for offline testing flavor
    setTimeout(() => {
        const replies = [
            "ACKNOWLEDGED.", 
            "SCANNING YOUR INPUT...", 
            "CYBER-SPACE IS VAST TODAY.", 
            "CONNECTION STABLE. GO ON."
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];
        appendMessage(`STRANGER: ${randomReply}`, 'msg-peer');
    }, 1200);
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// 4. Skip / Disconnect handler
skipBtn.addEventListener('click', () => {
    chatMessages.innerHTML = '<div class="system-msg">>> DISCONNECTED FROM NODE.</div>';
    switchScreen(landingScreen);
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
