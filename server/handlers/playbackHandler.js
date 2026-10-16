export function registerPlaybackHandlers(io, socket, roomManager) {
  // Helper to verify command authority
  function canControlPlayback(room, clientId) {
    if (room.controlMode === 'host') {
      return room.hostId === clientId;
    }
    return true; // controlMode: 'everyone'
  }

  // Play command
  socket.on('playback:play', ({ cmdId, position, clientId }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    if (!room) return typeof ack === 'function' && ack({ error: 'Room not found' });

    if (roomManager.isDuplicateCommand(room, cmdId)) {
      return typeof ack === 'function' && ack({ duplicate: true });
    }

    const effectiveClientId = clientId || socket.clientId;
    if (!canControlPlayback(room, effectiveClientId)) {
      socket.emit('error', { message: 'Only the host can control playback in host mode' });
      return typeof ack === 'function' && ack({ error: 'Permission denied' });
    }

    const now = Date.now();
    const currentPos = (typeof position === 'number' && position >= 0)
      ? position
      : roomManager.getExpectedPosition(room.playback, now);

    room.playback.state = 'playing';
    room.playback.position = currentPos;
    room.playback.updatedAt = now;
    room.playback.version++;

    const payload = {
      state: room.playback.state,
      position: room.playback.position,
      updatedAt: room.playback.updatedAt,
      version: room.playback.version,
      videoId: room.playback.videoId,
      videoUrl: room.playback.videoUrl,
      title: room.playback.title,
      by: effectiveClientId
    };

    io.to(roomCode).emit('playback:update', payload);
    if (typeof ack === 'function') ack({ success: true, payload });
  });

  // Pause command
  socket.on('playback:pause', ({ cmdId, position, clientId }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    if (!room) return typeof ack === 'function' && ack({ error: 'Room not found' });

    if (roomManager.isDuplicateCommand(room, cmdId)) {
      return typeof ack === 'function' && ack({ duplicate: true });
    }

    const effectiveClientId = clientId || socket.clientId;
    if (!canControlPlayback(room, effectiveClientId)) {
      socket.emit('error', { message: 'Only the host can control playback in host mode' });
      return typeof ack === 'function' && ack({ error: 'Permission denied' });
    }

    const now = Date.now();
    const currentPos = (typeof position === 'number' && position >= 0)
      ? position
      : roomManager.getExpectedPosition(room.playback, now);

    room.playback.state = 'paused';
    room.playback.position = currentPos;
    room.playback.updatedAt = now;
    room.playback.version++;

    const payload = {
      state: room.playback.state,
      position: room.playback.position,
      updatedAt: room.playback.updatedAt,
      version: room.playback.version,
      videoId: room.playback.videoId,
      videoUrl: room.playback.videoUrl,
      title: room.playback.title,
      by: effectiveClientId
    };

    io.to(roomCode).emit('playback:update', payload);
    if (typeof ack === 'function') ack({ success: true, payload });
  });

  // Seek command
  socket.on('playback:seek', ({ cmdId, position, clientId }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    if (!room) return typeof ack === 'function' && ack({ error: 'Room not found' });

    if (roomManager.isDuplicateCommand(room, cmdId)) {
      return typeof ack === 'function' && ack({ duplicate: true });
    }

    const effectiveClientId = clientId || socket.clientId;
    if (!canControlPlayback(room, effectiveClientId)) {
      socket.emit('error', { message: 'Only the host can control playback in host mode' });
      return typeof ack === 'function' && ack({ error: 'Permission denied' });
    }

    const now = Date.now();
    room.playback.position = Math.max(0, Number(position) || 0);
    room.playback.updatedAt = now;
    room.playback.version++;

    const payload = {
      state: room.playback.state,
      position: room.playback.position,
      updatedAt: room.playback.updatedAt,
      version: room.playback.version,
      videoId: room.playback.videoId,
      videoUrl: room.playback.videoUrl,
      title: room.playback.title,
      by: effectiveClientId
    };

    io.to(roomCode).emit('playback:update', payload);
    if (typeof ack === 'function') ack({ success: true, payload });
  });

  // Load video command
  socket.on('playback:load', ({ cmdId, videoId, videoUrl, title, clientId }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    if (!room) return typeof ack === 'function' && ack({ error: 'Room not found' });

    if (roomManager.isDuplicateCommand(room, cmdId)) {
      return typeof ack === 'function' && ack({ duplicate: true });
    }

    const effectiveClientId = clientId || socket.clientId;
    if (!canControlPlayback(room, effectiveClientId)) {
      socket.emit('error', { message: 'Only the host can change video in host mode' });
      return typeof ack === 'function' && ack({ error: 'Permission denied' });
    }

    const now = Date.now();
    room.playback.videoId = videoId || `custom_${Date.now()}`;
    room.playback.videoUrl = videoUrl || null;
    room.playback.title = title || null;
    room.playback.position = 0;
    room.playback.state = 'paused';
    room.playback.updatedAt = now;
    room.playback.version++;

    // Mark all members as buffering until they canplay
    for (const member of Object.values(room.members)) {
      member.buffering = true;
    }

    const payload = {
      state: room.playback.state,
      position: room.playback.position,
      updatedAt: room.playback.updatedAt,
      version: room.playback.version,
      videoId: room.playback.videoId,
      videoUrl: room.playback.videoUrl,
      title: room.playback.title,
      by: effectiveClientId
    };

    io.to(roomCode).emit('playback:update', payload);
    io.to(roomCode).emit('member:status_bulk', { members: room.members });
    if (typeof ack === 'function') ack({ success: true, payload });
  });

  // Member buffering / ready status
  socket.on('member:ready', ({ buffering }) => {
    const room = roomManager.getRoom(socket.roomCode);
    if (!room || !socket.clientId || !room.members[socket.clientId]) return;

    room.members[socket.clientId].buffering = Boolean(buffering);
    io.to(room.code).emit('member:status', {
      clientId: socket.clientId,
      buffering: Boolean(buffering)
    });
  });
}
