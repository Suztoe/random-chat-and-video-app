// DOM Elements
const loginScreen = document.getElementById('login-screen');
const waitingScreen = document.getElementById('waiting-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const skipBtn = document.getElementById('skip-btn');
const stopBtn = document.getElementById('stop-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteLabel = document.getElementById('remote-label');
const connectionStatus = document.getElementById('connection-status');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');

// State
let socket;
let peer;
let localStream;
let currentCall;
let currentPeerId;
let username;

// Initialize Socket.io
socket = io();

// Initialize PeerJS
function initPeer() {
  peer = new Peer();
  
  peer.on('open', (id) => {
    console.log('My peer ID is: ' + id);
    currentPeerId = id;
  });

  peer.on('call', (call) => {
    console.log('Receiving call...');
    call.answer(localStream);
    
    call.on('stream', (remoteStream) => {
      remoteVideo.srcObject = remoteStream;
      connectionStatus.textContent = 'Connected';
    });

    call.on('close', () => {
      connectionStatus.textContent = 'Disconnected';
      remoteVideo.srcObject = null;
    });

    currentCall = call;
  });

  peer.on('error', (err) => {
    console.error('PeerJS error:', err);
    connectionStatus.textContent = 'Error: ' + err.type;
  });
}

// Get local media stream
async function getLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error('Error getting media stream:', err);
    alert('Could not access camera/microphone. Please allow permissions.');
    throw err;
  }
}

// Socket event handlers
socket.on('login-success', (data) => {
  username = data.username;
  console.log('Logged in as:', username);
  showScreen('waiting');
  initPeer();
  getLocalStream().then(() => {
    socket.emit('find-match');
  });
});

socket.on('waiting', () => {
  showScreen('waiting');
});

socket.on('match-found', async (data) => {
  console.log('Match found with:', data.username);
  remoteLabel.textContent = data.username;
  clearChat();
  showScreen('chat');
  connectionStatus.textContent = 'Connecting...';
  
  // Call the matched peer
  if (peer && currentPeerId) {
    const call = peer.call(data.peerId, localStream);
    
    call.on('stream', (remoteStream) => {
      remoteVideo.srcObject = remoteStream;
      connectionStatus.textContent = 'Connected';
    });

    call.on('close', () => {
      connectionStatus.textContent = 'Disconnected';
      remoteVideo.srcObject = null;
    });

    currentCall = call;
  }
});

socket.on('skipped', () => {
  console.log('Match skipped');
  connectionStatus.textContent = 'Finding new match...';
  remoteVideo.srcObject = null;
  clearChat();
  showScreen('waiting');
  socket.emit('find-match');
});

socket.on('match-ended', () => {
  console.log('Match ended by other user');
  connectionStatus.textContent = 'Other user left';
  remoteVideo.srcObject = null;
  clearChat();
  showScreen('waiting');
  socket.emit('find-match');
});

socket.on('chat-message', (data) => {
  console.log('Received chat message:', data);
  addMessage(data.text, data.sender, 'received');
});

// UI Functions
function showScreen(screenName) {
  loginScreen.classList.add('hidden');
  waitingScreen.classList.add('hidden');
  chatScreen.classList.add('hidden');
  
  if (screenName === 'login') {
    loginScreen.classList.remove('hidden');
  } else if (screenName === 'waiting') {
    waitingScreen.classList.remove('hidden');
  } else if (screenName === 'chat') {
    chatScreen.classList.remove('hidden');
  }
}

function addMessage(text, sender, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  
  const senderDiv = document.createElement('div');
  senderDiv.className = 'sender';
  senderDiv.textContent = sender;
  
  const textDiv = document.createElement('div');
  textDiv.className = 'text';
  textDiv.textContent = text;
  
  messageDiv.appendChild(senderDiv);
  messageDiv.appendChild(textDiv);
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearChat() {
  chatMessages.innerHTML = '';
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (text) {
    socket.emit('chat-message', { text });
    addMessage(text, 'You', 'sent');
    chatInput.value = '';
  }
}

// Event Listeners
loginBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (name) {
    socket.emit('login', name);
  } else {
    alert('Please enter a username');
  }
});

usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    loginBtn.click();
  }
});

skipBtn.addEventListener('click', () => {
  if (currentCall) {
    currentCall.close();
  }
  socket.emit('skip-match');
});

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

stopBtn.addEventListener('click', () => {
  if (currentCall) {
    currentCall.close();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (peer) {
    peer.destroy();
  }
  socket.disconnect();
  showScreen('login');
  location.reload();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (currentCall) {
    currentCall.close();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (peer) {
    peer.destroy();
  }
});
