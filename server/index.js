const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// PeerJS server for WebRTC signaling
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs'
});

app.use('/peerjs', peerServer);

// Store users, waiting queue, and active matches
const users = new Map();
const waitingQueue = [];
const matches = new Map(); // socketId -> matchedSocketId

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User login
  socket.on('login', (username) => {
    const userId = uuidv4();
    users.set(socket.id, { id: userId, username, socketId: socket.id });
    socket.emit('login-success', { userId, username });
    console.log(`User logged in: ${username} (${userId})`);
  });

  // Find random match
  socket.on('find-match', () => {
    const user = users.get(socket.id);
    if (!user) return;

    // Check if there's someone waiting
    if (waitingQueue.length > 0) {
      const matchedUser = waitingQueue.shift();
      
      // Remove from queue if they're still connected
      if (users.has(matchedUser.socketId)) {
        // Store the match
        matches.set(socket.id, matchedUser.socketId);
        matches.set(matchedUser.socketId, socket.id);
        
        io.to(socket.id).emit('match-found', {
          peerId: matchedUser.peerId,
          username: matchedUser.username
        });
        io.to(matchedUser.socketId).emit('match-found', {
          peerId: user.peerId,
          username: user.username
        });
        console.log(`Matched: ${user.username} with ${matchedUser.username}`);
      } else {
        // If matched user disconnected, put current user in queue
        waitingQueue.push(user);
      }
    } else {
      // Add to waiting queue
      user.peerId = socket.id; // Use socket ID as peer ID for simplicity
      waitingQueue.push(user);
      socket.emit('waiting');
      console.log(`User ${user.username} added to waiting queue`);
    }
  });

  // Skip current match
  socket.on('skip-match', () => {
    const user = users.get(socket.id);
    if (user) {
      // Clear the match
      const matchedSocketId = matches.get(socket.id);
      if (matchedSocketId) {
        matches.delete(socket.id);
        matches.delete(matchedSocketId);
        
        // Notify the other user
        io.to(matchedSocketId).emit('match-ended');
      }
      
      socket.emit('skipped');
      // Trigger find-match again
      socket.emit('find-match');
    }
  });

  // Chat message
  socket.on('chat-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const matchedSocketId = matches.get(socket.id);
    if (matchedSocketId) {
      const matchedUser = users.get(matchedSocketId);
      if (matchedUser) {
        // Send message to the matched user
        io.to(matchedSocketId).emit('chat-message', {
          sender: user.username,
          text: data.text,
          timestamp: new Date().toISOString()
        });
        console.log(`Chat message from ${user.username} to ${matchedUser.username}`);
      }
    }
  });

  // User disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      // Remove from waiting queue
      const queueIndex = waitingQueue.findIndex(u => u.socketId === socket.id);
      if (queueIndex !== -1) {
        waitingQueue.splice(queueIndex, 1);
      }
      
      // Clear match if exists
      const matchedSocketId = matches.get(socket.id);
      if (matchedSocketId) {
        matches.delete(socket.id);
        matches.delete(matchedSocketId);
        
        // Notify the other user that the match ended
        io.to(matchedSocketId).emit('match-ended');
      }
      
      users.delete(socket.id);
      console.log(`User disconnected: ${user.username}`);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
