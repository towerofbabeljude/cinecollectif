import crypto from 'crypto';

export function registerPlaylistHandlers(io, socket, roomManager) {
  // Add item to playlist
  socket.on('playlist:add', ({ videoId, videoUrl, title }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room || !clientId || (!videoId && !videoUrl)) {
      return typeof ack === 'function' && ack({ error: 'Invalid parameters' });
    }

    const newItem = {
      itemId: crypto.randomUUID(),
      videoId: videoId || `custom_${Date.now()}`,
      videoUrl: videoUrl || null,
      title: title || 'Custom Video',
      addedBy: clientId,
      addedByName: room.members[clientId]?.name || 'Guest',
      addedAt: Date.now()
    };

    room.playlist.push(newItem);
    io.to(roomCode).emit('playlist:update', { playlist: room.playlist });
    if (typeof ack === 'function') ack({ success: true, item: newItem });
  });

  // Remove item from playlist
  socket.on('playlist:remove', ({ itemId }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room || !itemId) {
      return typeof ack === 'function' && ack({ error: 'Invalid parameters' });
    }

    // Permission check: if host mode, only host or the user who added it can remove
    const item = room.playlist.find(p => p.itemId === itemId);
    if (!item) return typeof ack === 'function' && ack({ error: 'Item not found' });

    if (room.controlMode === 'host' && room.hostId !== clientId && item.addedBy !== clientId) {
      return typeof ack === 'function' && ack({ error: 'Permission denied' });
    }

    room.playlist = room.playlist.filter(p => p.itemId !== itemId);
    io.to(roomCode).emit('playlist:update', { playlist: room.playlist });
    if (typeof ack === 'function') ack({ success: true });
  });

  // Reorder items in playlist
  socket.on('playlist:reorder', ({ fromIndex, toIndex }, ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room || fromIndex === undefined || toIndex === undefined) {
      return typeof ack === 'function' && ack({ error: 'Invalid parameters' });
    }

    if (room.controlMode === 'host' && room.hostId !== clientId) {
      return typeof ack === 'function' && ack({ error: 'Host only' });
    }

    if (
      fromIndex < 0 ||
      fromIndex >= room.playlist.length ||
      toIndex < 0 ||
      toIndex >= room.playlist.length
    ) {
      return typeof ack === 'function' && ack({ error: 'Index out of bounds' });
    }

    const [moved] = room.playlist.splice(fromIndex, 1);
    room.playlist.splice(toIndex, 0, moved);

    io.to(roomCode).emit('playlist:update', { playlist: room.playlist });
    if (typeof ack === 'function') ack({ success: true, playlist: room.playlist });
  });

  // Next video in playlist
  socket.on('playlist:next', (ack) => {
    const roomCode = socket.roomCode;
    const room = roomManager.getRoom(roomCode);
    const clientId = socket.clientId;

    if (!room) return typeof ack === 'function' && ack({ error: 'Room not found' });
    if (room.controlMode === 'host' && room.hostId !== clientId) {
      return typeof ack === 'function' && ack({ error: 'Host only' });
    }

    if (room.playlist.length === 0) {
      return typeof ack === 'function' && ack({ error: 'Playlist is empty' });
    }

    // Find current index
    const currentIndex = room.playlist.findIndex(p => p.videoId === room.playback.videoId);
    let nextItem;
    if (currentIndex >= 0 && currentIndex + 1 < room.playlist.length) {
      nextItem = room.playlist[currentIndex + 1];
    } else {
      nextItem = room.playlist[0];
    }

    const now = Date.now();
    room.playback.videoId = nextItem.videoId;
    room.playback.videoUrl = nextItem.videoUrl || null;
    room.playback.title = nextItem.title || null;
    room.playback.position = 0;
    room.playback.state = 'playing';
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
      by: clientId
    };

    io.to(roomCode).emit('playback:update', payload);
    if (typeof ack === 'function') ack({ success: true, payload });
  });
}
