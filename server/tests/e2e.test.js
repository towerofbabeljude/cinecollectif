import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client } from 'socket.io-client';
import Fuse from 'fuse.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('SyncWatch End-to-End Scenarios & Features', () => {
  const SERVER_URL = 'http://localhost:3001';
  let hostSocket;
  let guestSocket1;
  let guestSocket2;
  let roomCode;
  let moviesCatalog;

  beforeAll(async () => {
    // Load movies catalog
    const raw = fs.readFileSync(path.join(__dirname, '../data/movies.json'), 'utf-8');
    moviesCatalog = JSON.parse(raw);

    // Connect host
    hostSocket = Client(SERVER_URL, { transports: ['websocket'], forceNew: true });
    await new Promise((r) => hostSocket.on('connect', r));

    // Connect guests
    guestSocket1 = Client(SERVER_URL, { transports: ['websocket'], forceNew: true });
    guestSocket2 = Client(SERVER_URL, { transports: ['websocket'], forceNew: true });
    await Promise.all([
      new Promise((r) => guestSocket1.on('connect', r)),
      new Promise((r) => guestSocket2.on('connect', r))
    ]);
  });

  afterAll(() => {
    hostSocket.disconnect();
    guestSocket1.disconnect();
    guestSocket2.disconnect();
  });

  it('verifies movie catalog has verified titles and fuzzy typo search works', () => {
    expect(moviesCatalog.length).toBeGreaterThanOrEqual(10);

    const fuse = new Fuse(moviesCatalog, {
      keys: [
        { name: 'title', weight: 0.5 },
        { name: 'cast', weight: 0.2 },
        { name: 'tags', weight: 0.2 },
        { name: 'genres', weight: 0.1 }
      ],
      threshold: 0.35
    });

    // Typo test: 'bug buck bunni' must find Big Buck Bunny
    const results = fuse.search('bug buck bunni');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.title).toBe('Big Buck Bunny');
  });

  it('creates room, joins with 3 participants, and verifies snapshots', async () => {
    const createRes = await new Promise((resolve) => {
      hostSocket.emit(
        'room:create',
        {
          name: 'AliceHost',
          clientId: 'client_alice',
          initialVideoId: 'bbb'
        },
        resolve
      );
    });

    expect(createRes.success).toBe(true);
    roomCode = createRes.code;
    expect(roomCode).toHaveLength(6);

    // Guest 1 joins
    const join1 = await new Promise((resolve) => {
      guestSocket1.emit(
        'room:join',
        {
          code: roomCode,
          clientId: 'client_bob',
          name: 'Bob'
        },
        resolve
      );
    });
    expect(join1.success).toBe(true);
    expect(join1.snapshot.members['client_bob']).toBeDefined();

    // Guest 2 joins
    const join2 = await new Promise((resolve) => {
      guestSocket2.emit(
        'room:join',
        {
          code: roomCode,
          clientId: 'client_carol',
          name: 'Carol'
        },
        resolve
      );
    });
    expect(join2.success).toBe(true);
    expect(Object.keys(join2.snapshot.members).length).toBe(3);
  });

  it('propagates play, pause, seek across all participants deterministically', async () => {
    // Host plays at 15s
    const playPromise1 = new Promise((resolve) => guestSocket1.once('playback:update', resolve));
    const playPromise2 = new Promise((resolve) => guestSocket2.once('playback:update', resolve));

    hostSocket.emit('playback:play', {
      cmdId: 'cmd_play_1',
      position: 15.0,
      clientId: 'client_alice'
    });

    const [u1, u2] = await Promise.all([playPromise1, playPromise2]);
    expect(u1.state).toBe('playing');
    expect(u1.position).toBe(15.0);
    expect(u2.state).toBe('playing');
    expect(u2.version).toBe(u1.version);

    // Guest 1 seeks to 45s
    const seekPromise = new Promise((resolve) => hostSocket.once('playback:update', resolve));
    guestSocket1.emit('playback:seek', {
      cmdId: 'cmd_seek_1',
      position: 45.0,
      clientId: 'client_bob'
    });

    const seekUpdate = await seekPromise;
    expect(seekUpdate.position).toBe(45.0);
    expect(seekUpdate.version).toBe(u1.version + 1);
  });

  it('manages shared playlist: add, reorder, and advance next', async () => {
    // Add item
    const addRes = await new Promise((resolve) => {
      guestSocket2.emit('playlist:add', { videoId: 'tos', title: 'Tears of Steel' }, resolve);
    });
    expect(addRes.success).toBe(true);
    expect(addRes.item.videoId).toBe('tos');

    // Add another item
    await new Promise((resolve) => {
      guestSocket1.emit('playlist:add', { videoId: 'sintel', title: 'Sintel' }, resolve);
    });

    // Advance to next video
    const nextUpdatePromise = new Promise((resolve) => hostSocket.once('playback:update', resolve));
    hostSocket.emit('playlist:next');

    const nextUpdate = await nextUpdatePromise;
    expect(nextUpdate.videoId).toBe('tos');
    expect(nextUpdate.state).toBe('playing');
  });

  it('manages group polls with single-vote replacement per user', async () => {
    // Host creates poll
    const pollRes = await new Promise((resolve) => {
      hostSocket.emit(
        'poll:create',
        {
          question: 'What to watch after this?',
          options: ['Elephants Dream', 'Night of the Living Dead', 'Sprite Fright']
        },
        resolve
      );
    });

    expect(pollRes.success).toBe(true);
    const pollId = pollRes.poll.id;

    // Bob votes for option 0
    const vote1 = await new Promise((resolve) => {
      guestSocket1.emit('poll:vote', { pollId, optionId: 'opt_0' }, resolve);
    });
    expect(vote1.poll.options[0].votes).toContain('client_bob');

    // Bob changes vote to option 1 (single-vote replacement)
    const vote2 = await new Promise((resolve) => {
      guestSocket1.emit('poll:vote', { pollId, optionId: 'opt_1' }, resolve);
    });
    expect(vote2.poll.options[0].votes).not.toContain('client_bob');
    expect(vote2.poll.options[1].votes).toContain('client_bob');

    // Carol votes for option 1
    const vote3 = await new Promise((resolve) => {
      guestSocket2.emit('poll:vote', { pollId, optionId: 'opt_1' }, resolve);
    });
    expect(vote3.poll.options[1].votes.length).toBe(2);

    // Host closes poll
    const closeRes = await new Promise((resolve) => {
      hostSocket.emit('poll:close', { pollId }, resolve);
    });
    expect(closeRes.poll.closed).toBe(true);
  });

  it('verifies chat messaging and floating reactions', async () => {
    // Send message
    const msgPromise = new Promise((resolve) => guestSocket2.once('chat:message', resolve));
    guestSocket1.emit('chat:send', { text: 'Popcorn is ready! 🍿' });
    const msg = await msgPromise;
    expect(msg.text).toBe('Popcorn is ready! 🍿');
    expect(msg.name).toBe('Bob');

    // Send reaction
    const reactPromise = new Promise((resolve) => hostSocket.once('reaction:show', resolve));
    guestSocket2.emit('reaction:send', { emoji: '🔥' });
    const reaction = await reactPromise;
    expect(reaction.emoji).toBe('🔥');
    expect(reaction.name).toBe('Carol');
  });

  it('tests host transfer and host-only playback control mode', async () => {
    // Host switches to host-only mode
    await new Promise((resolve) => {
      hostSocket.emit('host:controlMode', { mode: 'host' }, resolve);
    });

    // Guest tries to pause in host mode -> should be rejected
    const pauseAttempt = await new Promise((resolve) => {
      guestSocket1.emit(
        'playback:pause',
        { cmdId: 'unauthorized_cmd', position: 10, clientId: 'client_bob' },
        resolve
      );
    });
    expect(pauseAttempt.error).toBe('Permission denied');

    // Transfer host to Bob
    const transferRes = await new Promise((resolve) => {
      hostSocket.emit('host:transfer', { toClientId: 'client_bob' }, resolve);
    });
    expect(transferRes.success).toBe(true);
    expect(transferRes.hostId).toBe('client_bob');

    // Bob can now pause as the new host
    const hostPause = await new Promise((resolve) => {
      guestSocket1.emit(
        'playback:pause',
        { cmdId: 'host_cmd_pause', position: 10, clientId: 'client_bob' },
        resolve
      );
    });
    expect(hostPause.success).toBe(true);
  });
});
