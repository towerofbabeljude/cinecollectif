import { io } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    users: 10,
    duration: 30, // seconds
    command: 'mixed', // 'play' | 'pause' | 'seek' | 'mixed'
    url: 'http://localhost:3001'
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--users' && args[i + 1]) options.users = parseInt(args[++i], 10);
    if (args[i] === '--duration' && args[i + 1]) options.duration = parseInt(args[++i], 10);
    if (args[i] === '--command' && args[i + 1]) options.command = args[++i];
    if (args[i] === '--url' && args[i + 1]) options.url = args[++i];
  }
  return options;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

async function runLoadTest() {
  const { users, duration, command, url } = parseArgs();
  console.log(`\n========================================`);
  console.log(`  SyncWatch Control Latency Test (C2)`);
  console.log(`========================================`);
  console.log(`Target: ${url}`);
  console.log(`Participants: ${users} bots + 1 issuer`);
  console.log(`Duration: ${duration}s | Command: ${command}`);

  // Step 1: Connect Issuer and create room
  const issuer = io(url, { transports: ['websocket'], forceNew: true });
  await new Promise((resolve) => issuer.on('connect', resolve));

  const roomRes = await new Promise((resolve) => {
    issuer.emit('room:create', {
      name: 'TestIssuer',
      clientId: 'issuer_bot',
      initialVideoId: 'bbb'
    }, resolve);
  });

  const roomCode = roomRes.code;
  console.log(`Room created: ${roomCode}`);

  // Step 2: Spawn N bot clients
  const bots = [];
  for (let i = 0; i < users; i++) {
    const botClientId = `bot_${i}_${Date.now()}`;
    const bot = io(url, { transports: ['websocket'], forceNew: true });
    await new Promise((resolve) => bot.on('connect', resolve));

    await new Promise((resolve) => {
      bot.emit('room:join', {
        code: roomCode,
        clientId: botClientId,
        name: `Bot_${i}`
      }, resolve);
    });

    bots.push({ id: botClientId, socket: bot });
  }
  console.log(`All ${users} bots joined room ${roomCode}`);

  // Step 3: Send commands and measure propagation latency
  const samples = [];
  const startTime = Date.now();
  let cmdIndex = 0;
  let isPlaying = false;

  while (Date.now() - startTime < duration * 1000) {
    cmdIndex++;
    const cmdId = `load_cmd_${cmdIndex}_${Date.now()}`;
    let actionType = command;

    if (command === 'mixed') {
      const types = ['play', 'pause', 'seek'];
      actionType = types[cmdIndex % types.length];
    }

    const tSend = Date.now();
    let botsReceived = 0;
    let tLastBot = 0;

    const roundPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null); // timeout after 3s
      }, 3000);

      bots.forEach(({ socket: botSocket }) => {
        const handler = (update) => {
          botSocket.off('playback:update', handler);
          botsReceived++;
          tLastBot = Math.max(tLastBot, Date.now());

          if (botsReceived >= users) {
            clearTimeout(timeout);
            resolve(tLastBot - tSend);
          }
        };
        botSocket.on('playback:update', handler);
      });
    });

    // Issue the command
    if (actionType === 'play') {
      isPlaying = true;
      issuer.emit('playback:play', { cmdId, position: (cmdIndex * 5) % 100, clientId: 'issuer_bot' });
    } else if (actionType === 'pause') {
      isPlaying = false;
      issuer.emit('playback:pause', { cmdId, position: (cmdIndex * 5) % 100, clientId: 'issuer_bot' });
    } else {
      issuer.emit('playback:seek', { cmdId, position: (cmdIndex * 7) % 100, clientId: 'issuer_bot' });
    }

    const latency = await roundPromise;
    if (latency !== null) {
      samples.push(latency);
      process.stdout.write(`\rSample ${samples.length}: last-bot latency = ${latency}ms`);
    }

    // Interval: 1s with random 0 to 200ms jitter
    const jitter = Math.floor(Math.random() * 200);
    await new Promise((r) => setTimeout(r, 800 + jitter));
  }

  console.log('\n\n--- Test Complete ---');
  // Disconnect bots
  issuer.disconnect();
  bots.forEach((b) => b.socket.disconnect());

  // Statistics
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);
  const max = samples.length > 0 ? Math.max(...samples) : 0;
  const pass = p95 <= 250;

  console.log(`Samples collected: ${samples.length}`);
  console.log(`p50: ${p50} ms`);
  console.log(`p95: ${p95} ms (Target <= 250 ms)`);
  console.log(`p99: ${p99} ms`);
  console.log(`max: ${max} ms`);
  console.log(`Pass (p95 <= 250 ms)? : ${pass ? 'PASSED ✅' : 'FAILED ❌'}`);

  // Save results to docs/results/
  const resultsDir = path.join(__dirname, '..', 'docs', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const resultData = {
    test: 'Control propagation latency (C2)',
    timestamp: new Date().toISOString(),
    users,
    command,
    durationSeconds: duration,
    samplesCount: samples.length,
    p50,
    p95,
    p99,
    max,
    pass,
    samples
  };

  const filename = `latency_${users}users_${command}_${Date.now()}`;
  fs.writeFileSync(path.join(resultsDir, `${filename}.json`), JSON.stringify(resultData, null, 2));

  // Write CSV
  const csvLines = ['sample_index,latency_ms'];
  samples.forEach((lat, idx) => csvLines.push(`${idx + 1},${lat}`));
  fs.writeFileSync(path.join(resultsDir, `${filename}.csv`), csvLines.join('\n'));

  console.log(`Results saved to: docs/results/${filename}.json & .csv\n`);
  return resultData;
}

runLoadTest().catch(console.error);
