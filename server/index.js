import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

import { RoomManager } from './rooms.js';
import { registerPlaybackHandlers } from './handlers/playbackHandler.js';
import { registerChatHandlers } from './handlers/chatHandler.js';
import { registerPlaylistHandlers } from './handlers/playlistHandler.js';
import { registerPollHandlers } from './handlers/pollHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const MAX_ROOM_SIZE = Number(process.env.MAX_ROOM_SIZE) || 25;
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS) || 2000;
const HOST_GRACE_MS = Number(process.env.HOST_GRACE_MS) || 30000;

const app = express();
app.use(cors());
app.use(express.json());

// Load movies seed catalog
let moviesData = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, 'data', 'movies.json'), 'utf-8');
  moviesData = JSON.parse(raw);
} catch (err) {
  console.error('Failed to load movies.json:', err.message);
}


// Static uploads serving
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${cleanName}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1 GB
});

// Video upload endpoint
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }
  const videoUrl = `/uploads/${req.file.filename}`;
  const title = path.basename(req.file.originalname, path.extname(req.file.originalname));
  res.json({
    success: true,
    videoUrl,
    title,
    filename: req.file.filename
  });
});

// REST endpoints
app.get('/', (req, res) => {
  if (req.accepts('html')) {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ciné-Collectif Backend Status</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 520px;
      width: 90%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #064e3b;
      color: #34d399;
      font-size: 0.85rem;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-bottom: 1rem;
    }
    .dot {
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 8px #10b981;
    }
    h1 { margin: 0 0 0.5rem; font-size: 1.75rem; font-weight: 700; }
    p { color: #94a3b8; margin: 0 0 1.5rem; line-height: 1.5; font-size: 0.95rem; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      text-decoration: none;
      padding: 0.75rem 1.5rem;
      border-radius: 10px;
      font-weight: 600;
      font-size: 1rem;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
    .endpoints {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #334155;
      text-align: left;
    }
    .endpoints h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.75rem; }
    .endpoint-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 0.85rem;
    }
    .endpoint-item a { color: #38bdf8; text-decoration: none; font-family: monospace; }
    .endpoint-item a:hover { text-decoration: underline; }
    .endpoint-item span { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Backend Active</div>
    <h1>Ciné-Collectif Server</h1>
    <p>The backend API & WebSocket server is running properly. To use the app, open the web client UI:</p>
    <a class="btn" href="http://localhost:5173">Open Web App (localhost:5173)</a>
    <div class="endpoints">
      <h3>Available Endpoints</h3>
      <div class="endpoint-item">
        <a href="/api/health">/api/health</a>
        <span>Health check & room count</span>
      </div>
      <div class="endpoint-item">
        <a href="/api/movies">/api/movies</a>
        <span>Movie catalog list</span>
      </div>
      <div class="endpoint-item">
        <a href="/uploads">/uploads</a>
        <span>Static uploaded media</span>
      </div>
    </div>
  </div>
</body>
</html>`);
  } else {
    res.json({
      status: 'ok',
      service: 'cinecollectif-backend',
      frontendUrl: 'http://localhost:5173',
      endpoints: ['/api/health', '/api/movies', '/api/upload', '/uploads']
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), roomsCount: roomManager.rooms.size });
});

app.get('/api/movies', (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'data', 'movies.json'), 'utf-8');
    moviesData = JSON.parse(raw);
  } catch (err) {
    console.error('Error reloading movies.json:', err.message);
  }
  res.json(moviesData);
});

const httpServer = createServer(app);

// Socket.IO — WebSocket-only transport for minimal latency on localhost
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket'],
  pingTimeout: 20000,
  pingInterval: 10000
});

const roomManager = new RoomManager({
  maxRoomSize: MAX_ROOM_SIZE,
  heartbeatMs: HEARTBEAT_MS,
  hostGraceMs: HOST_GRACE_MS
});
roomManager.setIO(io);

io.on('connection', (socket) => {
  // 5.1 Clock Synchronization
  socket.on('time:ping', ({ t0 }) => {
    socket.emit('time:pong', {
      t0,
      t1: Date.now()
    });
  });

  // Create room
  socket.on('room:create', ({ name, clientId, initialVideoId, initialVideoUrl, initialTitle }, ack) => {
    try {
      if (!clientId) {
        return typeof ack === 'function' && ack({ error: 'clientId is required' });
      }

      const room = roomManager.createRoom({
        hostClientId: clientId,
        hostName: name || 'Host',
        initialVideoId: initialVideoId || 'bbb',
        initialVideoUrl: initialVideoUrl || null,
        initialTitle: initialTitle || null
      });

      socket.roomCode = room.code;
      socket.clientId = clientId;
      socket.join(room.code);

      // Link socket to member
      room.members[clientId].socketId = socket.id;
      room.members[clientId].connected = true;

      const link = `/r/${room.code}`;
      const snapshot = roomManager.getSnapshot(room);

      if (typeof ack === 'function') {
        ack({
          success: true,
          code: room.code,
          link,
          snapshot
        });
      }
    } catch (err) {
      console.error('Error creating room:', err);
      if (typeof ack === 'function') ack({ error: 'Failed to create room' });
    }
  });

  // Join or Rejoin room
  socket.on('room:join', ({ code, clientId, name, lastVersion }, ack) => {
    try {
      const formattedCode = (code || '').toUpperCase().trim();
      const result = roomManager.handleMemberJoin(formattedCode, {
        clientId,
        name,
        socketId: socket.id
      });

      if (result.error) {
        socket.emit('error', { message: result.error });
        return typeof ack === 'function' && ack({ error: result.error });
      }

      const { room, member } = result;
      socket.roomCode = room.code;
      socket.clientId = clientId;
      socket.join(room.code);

      // Broadcast new or reconnected member to the room
      io.to(room.code).emit('member:joined', { member });

      const snapshot = roomManager.getSnapshot(room);
      if (typeof ack === 'function') {
        ack({
          success: true,
          code: room.code,
          snapshot
        });
      }
      // Also emit snapshot directly
      socket.emit('room:snapshot', snapshot);
    } catch (err) {
      console.error('Error joining room:', err);
      if (typeof ack === 'function') ack({ error: 'Failed to join room' });
    }
  });

  socket.on('room:rejoin', ({ code, clientId, name, lastVersion }, ack) => {
    try {
      const formattedCode = (code || '').toUpperCase().trim();
      const result = roomManager.handleMemberJoin(formattedCode, {
        clientId,
        name,
        socketId: socket.id
      });

      if (result.error) {
        socket.emit('error', { message: result.error });
        return typeof ack === 'function' && ack({ error: result.error });
      }

      const { room, member } = result;
      socket.roomCode = room.code;
      socket.clientId = clientId;
      socket.join(room.code);

      io.to(room.code).emit('member:status', {
        clientId: member.clientId,
        connected: true,
        lastSeen: member.lastSeen
      });

      const snapshot = roomManager.getSnapshot(room);
      if (typeof ack === 'function') {
        ack({ success: true, snapshot });
      }
      socket.emit('room:snapshot', snapshot);
    } catch (err) {
      console.error('Error rejoining room:', err);
      if (typeof ack === 'function') ack({ error: 'Failed to rejoin room' });
    }
  });

  // Leave room intentionally
  socket.on('room:leave', (ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (room && clientId && room.members[clientId]) {
      const member = room.members[clientId];
      member.connected = false;
      member.lastSeen = Date.now();
      socket.leave(roomCode);

      // If intentional leave by host, immediate auto transfer
      if (room.hostId === clientId) {
        roomManager.autoTransferHost(room);
      }

      io.to(roomCode).emit('member:left', { clientId });

      const active = Object.values(room.members).filter(m => m.connected);
      if (active.length === 0) {
        roomManager.scheduleIdleDelete(room);
      }
    }
    socket.roomCode = null;
    if (typeof ack === 'function') ack({ success: true });
  });

  // Host transfer (manual)
  socket.on('host:transfer', ({ toClientId }, ack) => {
    const room = roomManager.getRoom(socket.roomCode);
    const clientId = socket.clientId;

    if (!room || !clientId) return typeof ack === 'function' && ack({ error: 'Room not found' });
    if (room.hostId !== clientId) {
      socket.emit('error', { message: 'Only host can transfer host privileges' });
      return typeof ack === 'function' && ack({ error: 'Permission denied' });
    }

    if (!room.members[toClientId]) {
      return typeof ack === 'function' && ack({ error: 'Target member not found' });
    }

    room.hostId = toClientId;
    io.to(room.code).emit('room:host', {
      hostId: toClientId,
      reason: 'manual_transfer'
    });
    if (typeof ack === 'function') ack({ success: true, hostId: toClientId });
  });

  // Control mode change (everyone vs host)
  socket.on('host:controlMode', ({ mode }, ack) => {
    const room = roomManager.getRoom(socket.roomCode);
    const clientId = socket.clientId;

    if (!room || !clientId) return typeof ack === 'function' && ack({ error: 'Room not found' });
    if (room.hostId !== clientId) {
      socket.emit('error', { message: 'Only host can change control mode' });
      return typeof ack === 'function' && ack({ error: 'Permission denied' });
    }

    if (mode === 'everyone' || mode === 'host') {
      room.controlMode = mode;
      io.to(room.code).emit('room:controlMode', { controlMode: mode });
      if (typeof ack === 'function') ack({ success: true, controlMode: mode });
    }
  });

  // Kick member
  socket.on('room:kick', ({ clientId }, ack) => {
    const room = roomManager.getRoom(socket.roomCode);
    if (!room || room.hostId !== socket.clientId) {
      return typeof ack === 'function' && ack({ error: 'Host only' });
    }

    if (clientId === room.hostId) {
      return typeof ack === 'function' && ack({ error: 'Cannot kick host' });
    }

    const targetMember = room.members[clientId];
    if (targetMember) {
      const targetSocket = io.sockets.sockets.get(targetMember.socketId);
      if (targetSocket) {
        targetSocket.emit('room:kicked', { message: 'You have been removed from the room by the host' });
        targetSocket.leave(room.code);
        targetSocket.roomCode = null;
      }
      delete room.members[clientId];
      io.to(room.code).emit('member:left', { clientId });
      if (typeof ack === 'function') ack({ success: true });
    }
  });

  // Register modular handlers
  registerPlaybackHandlers(io, socket, roomManager);
  registerChatHandlers(io, socket, roomManager);
  registerPlaylistHandlers(io, socket, roomManager);
  registerPollHandlers(io, socket, roomManager);

  // Disconnect
  socket.on('disconnect', () => {
    roomManager.handleMemberDisconnect(socket.id);
  });
});

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`SyncWatch server running on http://localhost:${PORT}`);
  });
}

export { app, httpServer, io, roomManager };
export default app;
