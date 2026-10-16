import { clockSync } from './clockSync.js';

export class DriftCorrector {
  constructor(videoElement, onLogCorrection) {
    this.video = videoElement;
    this.onLogCorrection = onLogCorrection || (() => {});
    this.playbackState = null; // { state, position, updatedAt, version }
    this.isBuffering = false;
    this.checkInterval = null;
    this.logs = [];
    this.stats = {
      driftMs: 0,
      expectedSec: 0,
      actualSec: 0,
      rate: 1.0,
      status: 'idle' // 'synced' | 'nudging_ahead' | 'nudging_behind' | 'seeking' | 'buffering'
    };
    this.listeners = new Set();
    this.attachVideoListeners();
    this.startLoop();
  }

  attachVideoListeners() {
    if (!this.video) return;

    this.onWaiting = () => {
      this.isBuffering = true;
      this.updateStats({ status: 'buffering' });
    };

    this.onPlaying = () => {
      this.isBuffering = false;
      this.checkAndCorrect();
    };

    this.video.addEventListener('waiting', this.onWaiting);
    this.video.addEventListener('playing', this.onPlaying);
  }

  setPlaybackState(state) {
    this.playbackState = state;
    // Immediate pause correction rule: hard seek if paused and differs by > 250ms
    if (state.state === 'paused' && this.video) {
      const diff = Math.abs(this.video.currentTime - state.position);
      if (diff > 0.25) {
        this.video.currentTime = state.position;
        this.logCorrection('pause_seek', diff * 1000, 0);
      }
    }
  }

  getExpectedPosition() {
    if (!this.playbackState) return 0;
    const { state, position, updatedAt } = this.playbackState;
    if (state === 'playing') {
      const serverNow = clockSync.getServerNow();
      const elapsed = Math.max(0, (serverNow - updatedAt) / 1000);
      return position + elapsed;
    }
    return position;
  }

  startLoop() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    // Check drift every 500 ms as specified in Section 5.4
    this.checkInterval = setInterval(() => {
      this.checkAndCorrect();
    }, 500);
  }

  checkAndCorrect() {
    if (!this.video || !this.playbackState) return;
    if (this.isBuffering) return;

    const actual = this.video.currentTime;
    const expected = this.getExpectedPosition();
    const driftSec = actual - expected; // + means ahead, - means behind
    const absDriftMs = Math.abs(driftSec) * 1000;

    let newRate = this.video.playbackRate;
    let newStatus = 'synced';

    if (this.playbackState.state === 'playing') {
      if (absDriftMs < 150) {
        // Dead zone (< 150ms): reset to 1.0 if within 100ms
        if (absDriftMs < 100 && this.video.playbackRate !== 1.0) {
          this.video.playbackRate = 1.0;
          newRate = 1.0;
          this.logCorrection('rate_reset', absDriftMs, 0);
        }
        newStatus = 'synced';
      } else if (absDriftMs >= 150 && absDriftMs <= 1000) {
        // Nudge playback rate: 0.95 if ahead, 1.05 if behind
        if (driftSec > 0) {
          newRate = 0.95;
          newStatus = 'nudging_ahead';
        } else {
          newRate = 1.05;
          newStatus = 'nudging_behind';
        }

        if (this.video.playbackRate !== newRate) {
          this.video.playbackRate = newRate;
          this.logCorrection(`nudge_${newRate}x`, absDriftMs, absDriftMs);
        }
      } else {
        // Hard seek if > 1000 ms
        const before = absDriftMs;
        this.video.currentTime = Math.max(0, expected);
        this.video.playbackRate = 1.0;
        newRate = 1.0;
        newStatus = 'seeking';
        const after = Math.abs(this.video.currentTime - expected) * 1000;
        this.logCorrection('hard_seek', before, after);
      }
    } else {
      // Paused state
      if (absDriftMs > 250) {
        this.video.currentTime = Math.max(0, expected);
        this.logCorrection('paused_seek', absDriftMs, 0);
      }
      if (this.video.playbackRate !== 1.0) {
        this.video.playbackRate = 1.0;
      }
      newStatus = 'paused';
    }

    this.updateStats({
      driftMs: Math.round(driftSec * 1000),
      expectedSec: expected,
      actualSec: actual,
      rate: this.video.playbackRate,
      status: newStatus
    });
  }

  logCorrection(type, driftBefore, driftAfter) {
    const entry = {
      type,
      driftBefore: Math.round(driftBefore),
      driftAfter: Math.round(driftAfter),
      timestamp: Date.now()
    };
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs.shift();
    this.onLogCorrection(entry);
  }

  updateStats(updated) {
    this.stats = { ...this.stats, ...updated };
    for (const listener of this.listeners) {
      listener(this.stats);
    }
  }

  onStatsChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.video) {
      this.video.removeEventListener('waiting', this.onWaiting);
      this.video.removeEventListener('playing', this.onPlaying);
    }
    this.listeners.clear();
  }
}
