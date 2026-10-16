// Room state manager and authoritative server logic
import crypto from 'crypto';

export class RoomManager {
  constructor({ maxRoomSize = 30, heartbeatMs = 2000, hostGraceMs = 30000, idleDeleteMs = 300000 } = {}) {
    this.rooms = new Map();
    this.maxRoomSize = maxRoomSize;
    this.heartbeatMs = heartbeatMs;
    this.hostGraceMs = hostGraceMs;
    this.idleDeleteMs = idleDeleteMs;
    this.io = null; // Socket.IO server reference attached on setup
  }

  setIO(io) {
    this.io = io;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous chars like 0, O, 1, I
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom({ hostClientId, hostName, initialVideoId = 'bbb', initialVideoUrl = null, initialTitle = null }) {
    const code = this.generateRoomCode();
    const now = Date.now();

    const room = {
      code,
      hostId: hostClientId,
      controlMode: 'everyone', // or 'host'
      members: {
        [hostClientId]: {
          clientId: hostClientId,
          name: hostName || 'Host',
          socketId: null,
          connected: false,
          joinedAt: now,
          lastSeen: now,
          buffering: false
        }
      },
      playback: {
        videoId: initialVideoId,
        videoUrl: initialVideoUrl,
        title: initialTitle,
        state: 'paused', // 'playing' | 'paused'
        position: 0, // seconds at updatedAt
        updatedAt: now,
        version: 0
      },
      playlist: [
        {
          itemId: crypto.randomUUID(),
          videoId: initialVideoId,
          videoUrl: initialVideoUrl,
          title: initialTitle || 'Opening Video',
          addedBy: hostClientId
        }
      ],
      chat: [],
      polls: {},
      cmdIds: [], // array capped at 100
      cmdIdSet: new Set(),
      // Rate limiting: clientId -> array of timestamps
      chatTimestamps: new Map(),
      reactionTimestamps: new Map(),
      // Timers
      hostGraceTimer: null,
      idleDeleteTimer: null,
      heartbeatTimer: null
    };

    this.rooms.set(code, room);
    this.startHeartbeat(room);
    return room;
  }

  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(code.toUpperCase()) || null;
  }

  // Deduplication helper
  isDuplicateCommand(room, cmdId) {
    if (!cmdId) return false;
    if (room.cmdIdSet.has(cmdId)) {
      return true;
    }
    room.cmdIdSet.add(cmdId);
    room.cmdIds.push(cmdId);
    if (room.cmdIds.length > 100) {
      const removed = room.cmdIds.shift();
      room.cmdIdSet.delete(removed);
    }
    return false;
  }

  // Calculate authoritative expected position
  getExpectedPosition(playback, serverNow = Date.now()) {
    if (playback.state === 'playing') {
      const elapsed = (serverNow - playback.updatedAt) / 1000;
      return playback.position + elapsed;
    }
    return playback.position;
  }

  // Check rate limit: returns true if allowed, false if limit exceeded
  checkRateLimit(timestampsMap, clientId, limit, windowMs) {
    const now = Date.now();
    let timestamps = timestampsMap.get(clientId) || [];
    timestamps = timestamps.filter(ts => now - ts < windowMs);
    if (timestamps.length >= limit) {
      timestampsMap.set(clientId, timestamps);
      return false;
    }
    timestamps.push(now);
    timestampsMap.set(clientId, timestamps);
    return true;
  }

  // Snapshot generation
  getSnapshot(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      controlMode: room.controlMode,
      members: room.members,
      playback: {
        videoId: room.playback.videoId,
        videoUrl: room.playback.videoUrl,
        title: room.playback.title,
        state: room.playback.state,
        position: this.getExpectedPosition(room.playback),
        updatedAt: room.playback.updatedAt,
        version: room.playback.version
      },
      playlist: room.playlist,
      chat: room.chat.slice(-50),
      polls: room.polls,
      serverTime: Date.now()
    };
  }

  startHeartbeat(room) {
    if (room.heartbeatTimer) clearInterval(room.heartbeatTimer);
    room.heartbeatTimer = setInterval(() => {
      if (room.playback.state === 'playing' && this.io) {
        this.io.to(room.code).emit('playback:heartbeat', {
          state: room.playback.state,
          position: room.playback.position,
          updatedAt: room.playback.updatedAt,
          version: room.playback.version,
          by: 'server'
        });
      }
    }, this.heartbeatMs);
  }

  stopHeartbeat(room) {
    if (room.heartbeatTimer) {
      clearInterval(room.heartbeatTimer);
      room.heartbeatTimer = null;
    }
  }

  handleMemberJoin(code, { clientId, name, socketId }) {
    const room = this.getRoom(code);
    if (!room) return { error: 'Room not found' };

    const connectedCount = Object.values(room.members).filter(m => m.connected).length;
    const isExisting = Boolean(room.members[clientId]);

    if (!isExisting && connectedCount >= this.maxRoomSize) {
      return { error: 'Room is full (max 25 members)' };
    }

    // Cancel idle deletion if scheduled
    if (room.idleDeleteTimer) {
      clearTimeout(room.idleDeleteTimer);
      room.idleDeleteTimer = null;
    }

    const now = Date.now();
    if (isExisting) {
      room.members[clientId].socketId = socketId;
      room.members[clientId].connected = true;
      room.members[clientId].lastSeen = now;
      if (name) room.members[clientId].name = name;

      // If the reconnecting member was the host, clear grace timer
      if (room.hostId === clientId && room.hostGraceTimer) {
        clearTimeout(room.hostGraceTimer);
        room.hostGraceTimer = null;
      }
    } else {
      room.members[clientId] = {
        clientId,
        name: name || `Guest_${clientId.slice(0, 4)}`,
        socketId,
        connected: true,
        joinedAt: now,
        lastSeen: now,
        buffering: true
      };
    }

    // Only auto-assign host if the host member record is completely gone (e.g. kicked).
    // If host is simply disconnected, the grace period timer handles transfer.
    if (!room.members[room.hostId]) {
      room.hostId = clientId;
    }

    return { room, member: room.members[clientId] };
  }

  handleMemberDisconnect(socketId) {
    for (const room of this.rooms.values()) {
      for (const member of Object.values(room.members)) {
        if (member.socketId === socketId && member.connected) {
          member.connected = false;
          member.lastSeen = Date.now();

          // Broadcast member status update
          if (this.io) {
            this.io.to(room.code).emit('member:status', {
              clientId: member.clientId,
              connected: false,
              lastSeen: member.lastSeen
            });
          }

          // If the disconnected user is the host, start grace period
          if (room.hostId === member.clientId) {
            this.scheduleHostGracePeriod(room);
          }

          // Check if all members are disconnected
          const activeMembers = Object.values(room.members).filter(m => m.connected);
          if (activeMembers.length === 0) {
            this.scheduleIdleDelete(room);
          }

          return { room, member };
        }
      }
    }
    return null;
  }

  scheduleHostGracePeriod(room) {
    if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
    room.hostGraceTimer = setTimeout(() => {
      room.hostGraceTimer = null;
      // If host is still disconnected, transfer to longest-connected member
      if (room.members[room.hostId] && !room.members[room.hostId].connected) {
        this.autoTransferHost(room);
      }
    }, this.hostGraceMs);
  }

  autoTransferHost(room) {
    const connectedMembers = Object.values(room.members)
      .filter(m => m.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt);

    if (connectedMembers.length > 0) {
      const newHost = connectedMembers[0];
      room.hostId = newHost.clientId;
      if (this.io) {
        this.io.to(room.code).emit('room:host', {
          hostId: newHost.clientId,
          reason: 'auto_transfer'
        });
      }
      return newHost;
    }
    return null;
  }

  scheduleIdleDelete(room) {
    if (room.idleDeleteTimer) clearTimeout(room.idleDeleteTimer);
    room.idleDeleteTimer = setTimeout(() => {
      this.deleteRoom(room.code);
    }, this.idleDeleteMs);
  }

  deleteRoom(code) {
    const room = this.rooms.get(code);
    if (room) {
      this.stopHeartbeat(room);
      if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
      if (room.idleDeleteTimer) clearTimeout(room.idleDeleteTimer);
      this.rooms.delete(code);
    }
  }
}
