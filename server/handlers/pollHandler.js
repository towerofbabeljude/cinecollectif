import crypto from 'crypto';

export function registerPollHandlers(io, socket, roomManager) {
  // Create poll
  socket.on('poll:create', ({ question, options }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room || !clientId || !question || !Array.isArray(options) || options.length < 2) {
      return typeof ack === 'function' && ack({ error: 'Question and at least 2 options required' });
    }

    const pollId = crypto.randomUUID();
    const poll = {
      id: pollId,
      question: question.trim().slice(0, 150),
      options: options.slice(0, 6).map((opt, idx) => ({
        id: `opt_${idx}`,
        text: String(opt).trim().slice(0, 80),
        votes: [] // array of clientIds
      })),
      createdBy: clientId,
      createdByName: room.members[clientId]?.name || 'Guest',
      createdAt: Date.now(),
      closed: false
    };

    room.polls[pollId] = poll;
    io.to(roomCode).emit('poll:update', { poll });
    if (typeof ack === 'function') ack({ success: true, poll });
  });

  // Vote on poll
  socket.on('poll:vote', ({ pollId, optionId }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room || !clientId || !pollId || !optionId) {
      return typeof ack === 'function' && ack({ error: 'Invalid parameters' });
    }

    const poll = room.polls[pollId];
    if (!poll) return typeof ack === 'function' && ack({ error: 'Poll not found' });
    if (poll.closed) return typeof ack === 'function' && ack({ error: 'Poll is closed' });

    // Rule: One vote per user; the latest vote replaces the earlier one
    for (const opt of poll.options) {
      opt.votes = opt.votes.filter(id => id !== clientId);
    }

    const targetOption = poll.options.find(o => o.id === optionId);
    if (!targetOption) return typeof ack === 'function' && ack({ error: 'Option not found' });

    targetOption.votes.push(clientId);

    io.to(roomCode).emit('poll:update', { poll });
    if (typeof ack === 'function') ack({ success: true, poll });
  });

  // Close poll
  socket.on('poll:close', ({ pollId }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room || !clientId || !pollId) {
      return typeof ack === 'function' && ack({ error: 'Invalid parameters' });
    }

    const poll = room.polls[pollId];
    if (!poll) return typeof ack === 'function' && ack({ error: 'Poll not found' });

    // Only host or poll creator can close
    if (room.hostId !== clientId && poll.createdBy !== clientId) {
      return typeof ack === 'function' && ack({ error: 'Permission denied' });
    }

    poll.closed = true;
    io.to(roomCode).emit('poll:update', { poll });
    if (typeof ack === 'function') ack({ success: true, poll });
  });
}
