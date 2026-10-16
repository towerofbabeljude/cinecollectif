import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client } from 'socket.io-client';
import { httpServer, roomManager } from '../index.js';

describe('SyncWatch Server & Rooms', () => {
  let serverPort;
  let clientSocket1;
  let clientSocket2;

  beforeAll(async () => {
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });
  });

  afterAll(() => {
    if (clientSocket1) clientSocket1.disconnect();
    if (clientSocket2) clientSocket2.disconnect();
    httpServer.close();
  });

  it('connects via websocket transport and answers time:ping', async () => {
    clientSocket1 = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      forceNew: true
    });

    await new Promise((resolve) => clientSocket1.on('connect', resolve));
    expect(clientSocket1.connected).toBe(true);

    const t0 = Date.now();
    const pongPromise = new Promise((resolve) => {
      clientSocket1.on('time:pong', resolve);
      clientSocket1.emit('time:ping', { t0 });
    });

    const pong = await pongPromise;
    expect(pong.t0).toBe(t0);
    expect(typeof pong.t1).toBe('number');
  });

  it('creates a room and joins it', async () => {
    const createRes = await new Promise((resolve) => {
      clientSocket1.emit('room:create', {
        name: 'Alice',
        clientId: 'client_alice',
        initialVideoId: 'bbb'
      }, resolve);
    });

    expect(createRes.success).toBe(true);
    expect(createRes.code).toHaveLength(6);
    expect(createRes.snapshot.hostId).toBe('client_alice');
    expect(createRes.snapshot.members['client_alice'].name).toBe('Alice');

    // Second client joins
    clientSocket2 = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      forceNew: true
    });
    await new Promise((resolve) => clientSocket2.on('connect', resolve));

    const joinRes = await new Promise((resolve) => {
      clientSocket2.emit('room:join', {
        code: createRes.code,
        clientId: 'client_bob',
        name: 'Bob'
      }, resolve);
    });

    expect(joinRes.success).toBe(true);
    expect(joinRes.snapshot.members['client_bob'].name).toBe('Bob');
  });

  it('processes play/pause/seek authoritative commands with versioning', async () => {
    const room = Array.from(roomManager.rooms.values())[0];
    const initialVersion = room.playback.version;

    // Bob sends play
    const updatePromise = new Promise((resolve) => {
      clientSocket1.once('playback:update', resolve);
      clientSocket2.emit('playback:play', {
        cmdId: 'cmd_1',
        position: 12.5,
        clientId: 'client_bob'
      });
    });

    const update = await updatePromise;
    expect(update.state).toBe('playing');
    expect(update.position).toBe(12.5);
    expect(update.version).toBe(initialVersion + 1);

    // Duplicate command should be dropped
    const ack = await new Promise((resolve) => {
      clientSocket2.emit('playback:play', {
        cmdId: 'cmd_1',
        position: 12.5,
        clientId: 'client_bob'
      }, resolve);
    });
    expect(ack.duplicate).toBe(true);
  });

  it('enforces chat rate limits (max 5 msg in 5s)', async () => {
    let rejectedCount = 0;
    for (let i = 0; i < 7; i++) {
      const res = await new Promise((resolve) => {
        clientSocket2.emit('chat:send', { text: `Message ${i}` }, resolve);
      });
      if (res.error) rejectedCount++;
    }
    expect(rejectedCount).toBeGreaterThan(0);
  });
});
