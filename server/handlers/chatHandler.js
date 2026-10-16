import crypto from 'crypto';

export function registerChatHandlers(io, socket, roomManager) {
  // Send chat message
  socket.on('chat:send', ({ text }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room || !clientId || !room.members[clientId]) {
      return typeof ack === 'function' && ack({ error: 'Room or user invalid' });
    }

    // Rate limit: 5 messages in 5 seconds
    const allowed = roomManager.checkRateLimit(room.chatTimestamps, clientId, 5, 5000);
    if (!allowed) {
      socket.emit('error', { message: 'Chat rate limit reached (max 5 msg / 5s)' });
      return typeof ack === 'function' && ack({ error: 'Rate limit exceeded' });
    }

    if (!text || typeof text !== 'string') {
      return typeof ack === 'function' && ack({ error: 'Invalid text' });
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const cleanedText = trimmed.slice(0, 500); // Max 500 chars

    const message = {
      id: crypto.randomUUID(),
      clientId,
      name: room.members[clientId].name || 'Guest',
      text: cleanedText,
      timestamp: Date.now()
    };

    room.chat.push(message);
    if (room.chat.length > 200) {
      room.chat.shift();
    }

    io.to(roomCode).emit('chat:message', message);
    if (typeof ack === 'function') ack({ success: true, message });
  });

  // Floating emoji reaction
  socket.on('reaction:send', ({ emoji }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room || !clientId || !room.members[clientId]) {
      return typeof ack === 'function' && ack({ error: 'Room or user invalid' });
    }

    // Rate limit: 10 reactions in 5 seconds
    const allowed = roomManager.checkRateLimit(room.reactionTimestamps, clientId, 10, 5000);
    if (!allowed) {
      socket.emit('error', { message: 'Reaction rate limit reached (max 10 / 5s)' });
      return typeof ack === 'function' && ack({ error: 'Rate limit exceeded' });
    }

    if (!emoji || typeof emoji !== 'string') return;

    const reactionPayload = {
      id: crypto.randomUUID(),
      emoji: emoji.slice(0, 8),
      clientId,
      name: room.members[clientId].name || 'Guest',
      timestamp: Date.now()
    };

    io.to(roomCode).emit('reaction:show', reactionPayload);
    if (typeof ack === 'function') ack({ success: true, reaction: reactionPayload });
  });
}
