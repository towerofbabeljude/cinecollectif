# 🎬 Ciné-Collectif — Real-Time Watch Party

A full-stack, real-time watch-party application where multiple users watch videos together with **frame-accurate synchronized playback**, live chat, emoji reactions, shared playlists, group polls, and host controls — all powered by Socket.IO WebSockets.

---

## 🎥 Working Demo

> **[▶ Watch the Demo Video](https://your-demo-video-link-here)**

> [!IMPORTANT]
> Because serverless platforms do not natively sustain persistent WebSocket connections, the app is **fully optimized for local evaluation**. Follow the steps below to spin up both servers and experience the complete feature set.

---

## ✨ Key Features

| Category | Features |
|---|---|
| **Synchronized Playback** | Server-authoritative play / pause / seek with NTP-style clock sync and automatic drift correction (≤ 500 ms) |
| **Room Management** | Create / join rooms via 6-character code or shareable link, up to 25 concurrent users per room |
| **Live Chat** | Real-time messaging with rate limiting (5 msg / 5 s) |
| **Emoji Reactions** | Floating emoji overlay broadcast to all participants |
| **Shared Playlist** | Queue, reorder, remove videos; auto-advance to next track |
| **Group Polls** | Create multi-option polls, one-vote-per-user, host or creator can close |
| **Host Controls** | Manual host transfer, kick members, toggle "Host-Only" vs "Everyone" control mode |
| **Video Sources** | Movie catalog, YouTube embeds, direct URL streams, or file uploads (up to 1 GB) |
| **Reconnection** | Automatic room rejoin on network drop with version-based state reconciliation |
| **Drift Correction** | 500 ms check loop with rate-nudge (±5%) for small drift, hard seek for > 1 s drift |

---

## 🏗️ Architecture

```
┌────────────────────────────┐       WebSocket (port 3001)       ┌─────────────────────────┐
│  React + Vite Frontend     │ ◄──────────────────────────────► │  Express + Socket.IO    │
│  http://localhost:5173     │                                   │  http://localhost:3001   │
│                            │      REST: /api/movies            │                         │
│  • Player + DriftCorrector │      REST: /api/upload            │  • RoomManager          │
│  • ClockSync (NTP)         │      REST: /api/health            │  • PlaybackHandler      │
│  • Chat, Polls, Playlist   │                                   │  • ChatHandler          │
│  • Discover (Catalog)      │                                   │  • PlaylistHandler      │
│                            │                                   │  • PollHandler          │
└────────────────────────────┘                                   └─────────────────────────┘
```

---

## 🚀 How to Run Locally

### Prerequisites

- **Node.js** ≥ 18 (LTS recommended)
- **npm** ≥ 9

### 1. Clone the repository

```bash
git clone https://github.com/towerofbabeljude/cinecollectif.git
cd cinecollectif
```

### 2. Install all dependencies

From the project root, install dependencies for the root workspace, server, and client in one command:

```bash
npm install
npm run install:all
```

### 3. Configure the environment

The server ships with sensible defaults. If you want to customize, create `server/.env`:

```env
PORT=3001
MAX_ROOM_SIZE=25
HEARTBEAT_MS=2000
HOST_GRACE_MS=30000
```

> No `.env` file is required — the app runs out of the box with the defaults above.

### 4. Start the development servers

```bash
npm run dev
```

This launches **both** servers concurrently:

| Service | URL | Purpose |
|---|---|---|
| Frontend (Vite) | `http://localhost:5173` | React UI with hot reload |
| Backend (Express + Socket.IO) | `http://localhost:3001` | REST API + WebSocket server |

### 5. Open the app

Navigate to **http://localhost:5173** in your browser.

---

## 🧪 Testing Real-Time Sync (Reviewer Guide)

The fastest way to verify synchronized playback and multi-user interaction:

### Two-Tab Test

1. Open **Tab A** at `http://localhost:5173`
2. Enter a display name and click **Create Room**
3. Copy the **room code** shown in the header (e.g. `ABCD12`)
4. Open **Tab B** at `http://localhost:5173` (use a **private / incognito** window so it gets a separate `clientId`)
5. Enter a different display name, paste the room code, and click **Join Room**

### What to verify

| Action (Tab A) | Expected result (Tab B) |
|---|---|
| Click **Play** | Video starts playing simultaneously |
| Click **Pause** | Video pauses at the same position |
| **Seek** the scrubber to a new position | Tab B jumps to the same position within ~500 ms |
| Send a **chat message** | Message appears instantly in Tab B's chat panel |
| Click an **emoji reaction** (🔥 ❤️ 😂) | Floating emoji animates across Tab B's player |
| Add a video to the **playlist queue** | Queue updates in real-time on both tabs |
| Create a **poll** | Poll appears on Tab B; vote and see live results |
| Click **Transfer Host** → select Tab B's user | Tab B gains host controls; Tab A loses them |
| Toggle **Host-Only mode** | Tab B (non-host) sees playback controls disabled |

### Multi-Browser Test (10+ users)

For concurrency testing beyond two tabs, run the included load test:

```bash
npm run test:load
```

This spawns 10 simulated Socket.IO clients that create a room, join, and exchange playback commands. Results are printed to the console with p50/p95/p99 latency measurements.

### Drift Measurement Test

```bash
npm run test:drift
```

Runs automated drift-detection cycles and reports correction accuracy.

---

## 🧪 Unit & Integration Tests

```bash
npm run test:server
```

Runs the full Vitest suite (`11 tests`) covering:
- Room creation, joining, and member management
- Playback state synchronization (play / pause / seek / load)
- Chat rate limiting
- Playlist operations
- Poll voting and closing
- Host transfer and control mode changes

---

## 📁 Project Structure

```
cinecollectif/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/        # Player, Chat, Playlist, Polls, MembersList, Discover
│   │   ├── lib/               # socket.js, clockSync.js, driftCorrector.js
│   │   ├── pages/             # Home.jsx, Room.jsx
│   │   ├── App.jsx            # Router and layout
│   │   ├── main.jsx           # Entry point
│   │   └── index.css          # Design system
│   ├── index.html
│   └── vite.config.js
├── server/                    # Express + Socket.IO backend
│   ├── handlers/              # playbackHandler, chatHandler, playlistHandler, pollHandler
│   ├── data/                  # movies.json (seed catalog)
│   ├── tests/                 # Vitest unit + E2E tests
│   ├── rooms.js               # RoomManager (authoritative state)
│   └── index.js               # Server entry point
├── tools/                     # load-test.js, drift-test.js, generate-plot.js
├── docs/                      # Test result artifacts
└── package.json               # Root workspace (concurrently, install:all, test scripts)
```

---

## ⚙️ Socket.IO Transport Configuration

Both client and server are configured with **`transports: ['websocket']`** (WebSocket-only). This eliminates the initial HTTP long-polling handshake that Socket.IO performs by default, reducing connection establishment time on localhost from ~200 ms to < 10 ms.

```js
// client/src/lib/socket.js
export const socket = io('http://localhost:3001', {
  transports: ['websocket'],  // Skip HTTP polling handshake
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity
});
```

```js
// server/index.js
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket'],  // Accept WebSocket upgrades only
  pingTimeout: 20000,
  pingInterval: 10000
});
```

---

## 📊 Performance Targets

| Metric | Target | Measured |
|---|---|---|
| Playback control propagation (p95, local) | ≤ 250 ms | ~18 ms |
| Playback drift after correction | ≤ 500 ms | ~120 ms |
| Concurrent users per room | ≥ 10 | 25 (configurable) |
| Clock sync accuracy (NTP-style) | — | ±5 ms on LAN |
| Connection establishment (WebSocket) | — | < 10 ms |

---

## 📝 License

MIT

---

<p align="center">
  Built with ❤️ using React, Socket.IO, Express, and Vite
</p>
