import { io } from 'socket.io-client';

// Generate or retrieve persistent clientId from localStorage
function getClientId() {
  let id = localStorage.getItem('syncwatch_client_id');
  if (!id) {
    id = 'c_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    localStorage.setItem('syncwatch_client_id', id);
  }
  return id;
}

export const clientId = getClientId();

// Generate unique command ID
export function generateCmdId() {
  return 'cmd_' + clientId + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

// Local-first Socket.IO connection — WebSocket transport only for zero handshake latency.
// The Vite dev server runs on :5173, backend on :3001.
const socketUrl = 'http://localhost:3001';

export const socket = io(socketUrl, {
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});

// Offline command queue (max 20)
const offlineQueue = [];

export function queueOrEmit(event, data, ack) {
  if (socket.connected) {
    socket.emit(event, data, ack);
  } else {
    if (offlineQueue.length >= 20) offlineQueue.shift();
    offlineQueue.push({ event, data, ack });
  }
}

socket.on('connect', () => {
  // Flush queued commands
  while (offlineQueue.length > 0) {
    const item = offlineQueue.shift();
    socket.emit(item.event, item.data, item.ack);
  }
});
