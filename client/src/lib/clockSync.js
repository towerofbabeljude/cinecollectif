import { socket } from './socket.js';

class ClockSync {
  constructor() {
    this.offset = 0; // serverTime - localTime
    this.rtt = 0;
    this.synced = false;
    this.listeners = new Set();
    this.periodicTimer = null;

    this.init();
  }

  init() {
    socket.on('connect', () => {
      this.runInitialSync();
      this.startPeriodicSync();
    });

    socket.on('disconnect', () => {
      if (this.periodicTimer) clearInterval(this.periodicTimer);
    });

    if (socket.connected) {
      this.runInitialSync();
      this.startPeriodicSync();
    }
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      cb({ offset: this.offset, rtt: this.rtt, synced: this.synced });
    }
  }

  // Ping helper returning a promise
  pingSample() {
    return new Promise((resolve) => {
      const t0 = performance.timeOrigin + performance.now();
      
      const onPong = (data) => {
        if (data.t0 === t0) {
          socket.off('time:pong', onPong);
          const t2 = performance.timeOrigin + performance.now();
          const rtt = t2 - t0;
          const offset = data.t1 - (t0 + rtt / 2);
          resolve({ rtt, offset });
        }
      };

      socket.on('time:pong', onPong);
      socket.emit('time:ping', { t0 });

      // Fallback timeout in case packet dropped
      setTimeout(() => {
        socket.off('time:pong', onPong);
        resolve(null);
      }, 1000);
    });
  }

  // Initial sync: 8 samples, 100ms apart, keep lowest RTT
  async runInitialSync() {
    const samples = [];
    for (let i = 0; i < 8; i++) {
      const sample = await this.pingSample();
      if (sample) samples.push(sample);
      if (i < 7) await new Promise((r) => setTimeout(r, 100));
    }

    if (samples.length > 0) {
      samples.sort((a, b) => a.rtt - b.rtt);
      const best = samples[0];
      this.offset = best.offset;
      this.rtt = best.rtt;
      this.synced = true;
      this.notify();
    }
  }

  // Periodic sync every 30s with 3 samples smoothed with 0.8 * old + 0.2 * new
  startPeriodicSync() {
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.periodicTimer = setInterval(async () => {
      if (!socket.connected) return;
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const sample = await this.pingSample();
        if (sample) samples.push(sample);
        if (i < 2) await new Promise((r) => setTimeout(r, 100));
      }

      if (samples.length > 0) {
        samples.sort((a, b) => a.rtt - b.rtt);
        const best = samples[0];
        this.rtt = 0.8 * this.rtt + 0.2 * best.rtt;
        this.offset = 0.8 * this.offset + 0.2 * best.offset;
        this.notify();
      }
    }, 30000);
  }

  // Returns accurate server time in ms
  getServerNow() {
    return (performance.timeOrigin + performance.now()) + this.offset;
  }
}

export const clockSync = new ClockSync();
