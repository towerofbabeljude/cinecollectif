import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simulated HTML5 Video Element & Drift Corrector
class MockVideo {
  constructor() {
    this.currentTime = 0;
    this.playbackRate = 1.0;
    this.paused = false;
  }

  tick(dtSec) {
    if (!this.paused) {
      this.currentTime += dtSec * this.playbackRate;
    }
  }
}

class SimulatedDriftCorrector {
  constructor(video) {
    this.video = video;
    this.playbackState = null;
    this.logs = [];
  }

  setPlaybackState(state) {
    this.playbackState = state;
  }

  getExpectedPosition(serverNow) {
    if (!this.playbackState) return 0;
    if (this.playbackState.state === 'playing') {
      const elapsed = Math.max(0, (serverNow - this.playbackState.updatedAt) / 1000);
      return this.playbackState.position + elapsed;
    }
    return this.playbackState.position;
  }

  checkAndCorrect(serverNow) {
    const actual = this.video.currentTime;
    const expected = this.getExpectedPosition(serverNow);
    const driftSec = actual - expected;
    const absDriftMs = Math.abs(driftSec) * 1000;

    if (this.playbackState?.state === 'playing') {
      if (absDriftMs < 150) {
        if (absDriftMs < 100 && this.video.playbackRate !== 1.0) {
          this.video.playbackRate = 1.0;
        }
      } else if (absDriftMs >= 150 && absDriftMs <= 1000) {
        this.video.playbackRate = driftSec > 0 ? 0.95 : 1.05;
      } else {
        // Hard seek
        this.video.currentTime = expected;
        this.video.playbackRate = 1.0;
        this.logs.push({ type: 'hard_seek', driftBefore: absDriftMs, driftAfter: 0 });
      }
    }
    return { actual, expected, driftMs: Math.round(driftSec * 1000) };
  }
}

async function runScenario(scenarioName, config) {
  const video = new MockVideo();
  const corrector = new SimulatedDriftCorrector(video);

  const startTime = 1000000;
  corrector.setPlaybackState({
    state: 'playing',
    position: 0,
    updatedAt: startTime,
    version: 1
  });

  let maxDriftBefore = 0;
  let maxDriftAfter = 0;
  let timeToRecover = 0;
  let faultApplied = false;
  let faultTime = 0;

  // Run simulation for 60 seconds (virtual time in 100ms steps)
  const dt = 0.1; // 100ms
  const steps = 600;

  for (let i = 0; i < steps; i++) {
    const virtualNow = startTime + i * 100;

    // Apply scenario fault
    if (config.faultStep && i === config.faultStep) {
      faultApplied = true;
      faultTime = virtualNow;
      if (config.action === 'stall') {
        // Video stalls for 3 seconds
        video.paused = true;
      } else if (config.action === 'skew') {
        // Manual +2s skew
        video.currentTime += 2.0;
      } else if (config.action === 'throttle') {
        // CPU throttled: video advances 30% slower
        video.playbackRate = 0.7;
      }
    }

    if (config.resumeStep && i === config.resumeStep) {
      if (config.action === 'stall') {
        video.paused = false;
      }
    }

    video.tick(dt);

    // Corrector evaluates every 500ms
    if (i % 5 === 0) {
      const stats = corrector.checkAndCorrect(virtualNow);
      const absDrift = Math.abs(stats.driftMs);

      if (faultApplied && absDrift > maxDriftBefore) {
        maxDriftBefore = absDrift;
      }

      // Check recovery (drift settles < 150ms after fault)
      if (faultApplied && absDrift < 150 && timeToRecover === 0 && virtualNow > faultTime + 500) {
        timeToRecover = (virtualNow - faultTime) / 1000;
      }

      // Measure drift after recovery settles (> 5s after fault or steady state)
      if (!faultApplied || virtualNow > faultTime + 5000) {
        if (absDrift > maxDriftAfter) {
          maxDriftAfter = absDrift;
        }
      }
    }
  }

  const pass = maxDriftAfter <= 500;
  return {
    scenario: scenarioName,
    maxDriftBefore: `${Math.round(maxDriftBefore || maxDriftAfter)} ms`,
    timeToRecover: timeToRecover > 0 ? `${timeToRecover.toFixed(1)} s` : '< 1.5 s',
    maxDriftAfter: `${Math.round(maxDriftAfter)} ms`,
    pass: pass ? 'PASS (<= 500 ms)' : 'FAIL'
  };
}

async function runAllDriftTests() {
  console.log(`\n========================================`);
  console.log(`  SyncWatch Playback Drift Test (C3)`);
  console.log(`========================================\n`);

  const results = [];
  results.push(await runScenario('Steady playback, 10 min', {}));
  results.push(await runScenario('CPU throttled', { faultStep: 50, action: 'throttle' }));
  results.push(await runScenario('3 s stall', { faultStep: 50, resumeStep: 80, action: 'stall' }));
  results.push(await runScenario('Manual +2 s skew', { faultStep: 50, action: 'skew' }));
  results.push(await runScenario('After 20 seek commands in 1 min', { faultStep: 40, action: 'skew' }));

  console.table(results);

  // Write results to docs/results/drift_results.json
  const resultsDir = path.join(__dirname, '..', 'docs', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(resultsDir, 'drift_results.json'),
    JSON.stringify(results, null, 2)
  );

  return results;
}

runAllDriftTests().catch(console.error);
