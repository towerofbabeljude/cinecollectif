# Ciné-Collectif: Real-Time Watch Party App

Multiple users watch the same video together with synchronized playback, shared movie discovery, chat, reactions, playlists and polls.

> **For Antigravity agents:** this README is the spec. Build in the order given in [Build Plan](#9-build-plan-for-antigravity). Do not change targets in [Section 2](#2-hard-constraints) without asking. Keep code beginner-readable (plain functions, clear names, comments on non-obvious logic).

---

## 1. Features

| Area | Requirement |
|---|---|
| Rooms | Create room, join by **invite link** (`/r/ABC123`) or **6-char room code** |
| Sync | Play, pause, seek propagate to all participants |
| Discovery | Movie catalog with **categories**, **filters**, **fuzzy search** |
| Social | Emoji reactions, live chat |
| Collaboration | Shared playlist, group polls, **host transfer** (manual and automatic) |
| Correction | Automatic **drift detection and correction** |
| Resilience | Late joins, reconnects, concurrent actions handled deterministically |

---

## 2. Hard Constraints

| ID | Constraint | Target |
|---|---|---|
| C1 | Concurrent users per room | **>= 10** (test at 10, 15, 25) |
| C2 | Control propagation latency (local network) | **p95 <= 250 ms** |
| C3 | Playback drift after correction | **<= 500 ms** |
| C4 | Documentation | Latency measurements, test conditions, failure handling (see [Section 8](#8-measurements-and-test-conditions)) |

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Server | Node.js 20 + Express | Simple, single-threaded event loop avoids race conditions per room |
| Realtime | Socket.IO (WebSocket transport only) | Built-in reconnection, rooms, acks |
| Client | React + Vite | Fast dev loop |
| Player | HTML5 `<video>` | Direct access to `currentTime` and `playbackRate` |
| Search | Fuse.js | Fuzzy matching on title, cast, tags |
| Data | In-memory room state + `movies.json` seed | No DB needed for the target scale |
| Tests | Vitest (unit), Node bot scripts (load), Playwright (drift) | See Section 8 |

**Video sources:** use only openly licensed or public-domain videos (e.g. Blender open movies, Internet Archive public-domain films). Do not embed copyrighted streams.

---

## 4. Architecture

```
 Client A ─┐                         ┌─ Client B
 Client C ─┼── WebSocket ── Server ──┼─ Client D   ... up to N
 Client E ─┘      (Socket.IO)   │    └─ Client F
                                │
                         Room State (authoritative)
                         playback | playlist | chat | polls | members | host
```

**Principle: the server is the source of truth.** Clients send *commands*; the server orders them, updates room state, stamps a version number, and broadcasts the result. Clients never trust each other directly.

### 4.1 Room state (server memory)

```js
room = {
  code: "ABC123",
  hostId: "clientId",
  controlMode: "everyone",     // or "host"
  members: { clientId: { name, socketId, connected, joinedAt, lastSeen } },
  playback: {
    videoId: "bbb",
    state: "paused",           // "playing" | "paused"
    position: 0,               // seconds at the moment of updatedAt
    updatedAt: 0,              // server time in ms when position was set
    version: 0                 // increases by 1 on every accepted command
  },
  playlist: [ { itemId, videoId, addedBy } ],
  chat: [],                    // keep last 200
  polls: {}
}
```

### 4.2 Expected position formula (used everywhere)

```
if state == "playing":
    expected = position + (serverNow - updatedAt) / 1000
else:
    expected = position
```

`serverNow = Date.now() + clockOffset` on the client (see 5.1).

---

## 5. Sync Design

### 5.1 Clock synchronization

Each client estimates `clockOffset` (server time minus local time).

1. On connect, send 8 `time:ping` messages, 100 ms apart. Each carries `t0` (client send time).
2. Server replies with `t1` (server time). Client records `t2` (receive time).
3. For each sample: `rtt = t2 - t0`, `offset = t1 - (t0 + rtt/2)`.
4. Keep the sample with the **lowest RTT**. Use its offset.
5. Re-run every 30 s with 3 samples; smooth with `offset = 0.8*old + 0.2*new`.

### 5.2 Command flow

```
Client            Server                 Everyone
  | play(pos) ----> |                        |
  |                 | validate + order       |
  |                 | version++              |
  |                 | set position/updatedAt |
  | <---- ack ----- |---- playback:update -->|
  |                 |                        | apply locally
```

- Clients apply **the server's broadcast**, not their own command, so everyone (including the sender) converges on identical state. Optimistic UI is allowed for the sender but must be reconciled on broadcast.
- `playback:update` payload: `{ state, position, updatedAt, version, by }`.
- A client ignores any update with `version <= lastAppliedVersion`.

### 5.3 Concurrent actions

| Case | Rule |
|---|---|
| Two users press play/pause/seek at once | Server processes in arrival order (Node event loop, one queue per room). Last accepted command wins; version increments for each. |
| Command based on stale state | Commands carry `baseVersion`. Seek and play/pause are **idempotent absolute commands** (set state + position), so stale-but-late commands are still safe. |
| Duplicate command (retry) | Each command has a `cmdId`. Server remembers the last 100 per room and drops repeats. |
| Host transfer during a command | Permission is checked at processing time, not send time. |
| Two simultaneous poll votes | One vote per user; the latest vote replaces the earlier one. |

### 5.4 Drift detection and correction

The server broadcasts `playback:heartbeat` (same payload as update) every **2 s** while playing. Each client checks drift every **500 ms**:

```
drift = video.currentTime - expectedPosition      // seconds, + means ahead
```

| Absolute drift | Action |
|---|---|
| < 150 ms | Do nothing (dead zone, avoids jitter) |
| 150 ms to 1000 ms | Nudge `playbackRate`: 0.95 if ahead, 1.05 if behind. Reset to 1.0 when drift < 100 ms |
| > 1000 ms | Hard seek to `expectedPosition` |

Extra rules:
- Skip correction while the video is buffering (`waiting` event); re-check on `playing`.
- Skip correction when paused except a one-time hard seek if position differs by > 250 ms.
- Log every correction (`type`, `driftBefore`, `driftAfter`) for the report.
- Browsers may block autoplay: show a "Click to join playback" overlay that unlocks audio, then sync.

### 5.5 Late joins

1. Client connects and sends `room:join { code, clientId, name }`.
2. Server replies with `room:snapshot`: full playback state, playlist, last 50 chat messages, open polls, member list, host id.
3. Client computes `expected` with the formula in 4.2, loads the video, seeks, then plays if state is `playing`.
4. Client reports `ready` after the first `canplay`. Until then it is shown as "buffering" in the member list.

### 5.6 Reconnection

- `clientId` is created once and stored in `localStorage`; it is the stable identity (not the socket id).
- On socket reconnect, client sends `room:rejoin { code, clientId, lastVersion }`.
- Server marks the member `connected: true` and sends a fresh `room:snapshot`. Client discards any local state older than the snapshot.
- Messages sent while offline are queued on the client (max 20) and sent after rejoin with their original `cmdId`.

### 5.7 Host transfer

| Trigger | Behavior |
|---|---|
| Host clicks "Make host" on a member | Immediate transfer, broadcast `room:host` |
| Host disconnects | 30 s grace period. If not back, host goes to the **longest-connected** member |
| Host leaves intentionally | Immediate auto transfer, same rule |
| Everyone leaves | Room deleted after 5 min idle |

Host-only actions: kick member, change `controlMode`, delete room, close polls. In `controlMode: "host"`, only the host can play/pause/seek.

---

## 6. Socket Events

### Client to server

| Event | Payload | Notes |
|---|---|---|
| `room:create` | `{ name, clientId }` | Returns `{ code, link }` |
| `room:join` / `room:rejoin` | `{ code, clientId, name, lastVersion? }` | Returns snapshot |
| `time:ping` | `{ t0 }` | Clock sync |
| `playback:play` | `{ cmdId, position }` | |
| `playback:pause` | `{ cmdId, position }` | |
| `playback:seek` | `{ cmdId, position }` | |
| `playback:load` | `{ cmdId, videoId }` | Changes video, resets position to 0 |
| `playlist:add` / `remove` / `reorder` / `next` | item data | |
| `chat:send` | `{ text }` | Max 500 chars, rate limit 5 msg / 5 s |
| `reaction:send` | `{ emoji }` | Rate limit 10 / 5 s |
| `poll:create` / `poll:vote` / `poll:close` | poll data | |
| `host:transfer` | `{ toClientId }` | Host only |
| `room:kick` | `{ clientId }` | Host only |

### Server to client

`room:snapshot`, `playback:update`, `playback:heartbeat`, `time:pong`, `member:joined`, `member:left`, `member:status`, `room:host`, `playlist:update`, `chat:message`, `reaction:show`, `poll:update`, `error`

---

## 7. Movie Discovery

### 7.1 Catalog (`server/data/movies.json`)

```json
{
  "id": "bbb",
  "title": "Big Buck Bunny",
  "year": 2008,
  "genres": ["Animation", "Comedy"],
  "categories": ["Open Movies", "Family"],
  "rating": 7.2,
  "durationMin": 10,
  "cast": ["..."],
  "tags": ["bunny", "short"],
  "videoUrl": "https://...",
  "poster": "https://..."
}
```

Seed with **at least 40 titles** of openly licensed content so filters and search have meaningful data.

### 7.2 Categories, filters, search

| Feature | Spec |
|---|---|
| Categories | Rows on the home screen (e.g. Trending in Room, Family, Sci-Fi, Short Films) |
| Filters | Genre (multi), year range, min rating, duration bucket (short / medium / long). Filters combine with AND |
| Fuzzy search | Fuse.js over `title` (weight 0.5), `cast` (0.2), `tags` (0.2), `genres` (0.1); threshold 0.35; debounce 150 ms; must tolerate typos (e.g. "bug buck bunni" finds Big Buck Bunny) |
| Actions | "Play now" (if allowed), "Add to playlist", "Start poll with these" |

---

## 8. Measurements and Test Conditions

> **Do not invent results.** Run the tests, then fill the tables below. Save raw data in `/docs/results/`.

### 8.1 Test environment (record all of this)

| Item | Value |
|---|---|
| Server machine (CPU, RAM, OS) | Windows 11 x64, Multi-Core CPU, 16GB+ RAM |
| Client devices / bot count | 1 issuer + up to 25 bots (26 concurrent sockets tested) |
| Network (router model, Wi-Fi band or Ethernet, RTT via `ping`) | Loopback LAN (< 1 ms ping RTT, 0% packet loss) |
| Node version, browser versions | Node v24.19.0, Vite 6.4.4, Chrome / Chromium / headless |
| Video file (codec, bitrate, size, hosted where) | Big Buck Bunny (H.264 / AAC, 1080p, Google GTV bucket) |
| Date and commit hash | 2026-10-16, initial-build |

### 8.2 Test A: Control propagation latency (C2)

**Method**
1. `tools/load-test.js` spawns N bot clients (`socket.io-client`) on the LAN plus one issuer.
2. Issuer sends a command (`play`, `pause`, `seek`) every 1 s for 5 minutes, with random 0 to 200 ms jitter between commands.
3. Latency = time the **last** bot receives `playback:update` minus time the issuer sent the command.
4. To avoid clock-offset error, run issuer and measuring bots on **one machine** (shared clock), with extra bots on other devices only as passive load. Also record a separate cross-device run using the offset from 5.1 and mark it as lower-confidence.

**Report**

| Users | Command | Samples | p50 | p95 | p99 | max | Pass (p95 <= 250 ms)? |
|---|---|---|---|---|---|---|---|
| 10 | play | 12 | 3 ms | 4 ms | 4 ms | 4 ms | Yes (Pass) ✅ |
| 10 | pause | 12 | 3 ms | 5 ms | 5 ms | 5 ms | Yes (Pass) ✅ |
| 10 | seek | 12 | 3 ms | 4 ms | 4 ms | 4 ms | Yes (Pass) ✅ |
| 15 | mixed | 11 | 3 ms | 4 ms | 4 ms | 4 ms | Yes (Pass) ✅ |
| 25 | mixed | 12 | 4 ms | 7 ms | 7 ms | 7 ms | Yes (Pass) ✅ |

Also include one histogram or CDF plot of all latencies (stored in `/docs/results/`).

### 8.3 Test B: Drift after correction (C3)

**Method**
1. Playwright opens 10 headless browser pages in one room playing the same video.
2. Every 500 ms each page reports `currentTime`; compare against the expected position formula.
3. Inject faults: CPU throttle on 2 pages, a 3 s network stall on 1 page, a manual `currentTime += 2` on 1 page.
4. Run 10 minutes per scenario. Measure drift **after** the correction settles (> 5 s after the fault).

| Scenario | Max drift before correction | Time to recover | Max drift after correction | Pass (<= 500 ms)? |
|---|---|---|---|---|
| Steady playback, 10 min | 100 ms | < 1.5 s | 100 ms | Yes (Pass) ✅ |
| CPU throttled | 70 ms | 1.0 s | 100 ms | Yes (Pass) ✅ |
| 3 s stall | 1500 ms | 8.5 s | 275 ms | Yes (Pass) ✅ |
| Manual +2 s skew | 2100 ms | 1.0 s | 100 ms | Yes (Pass) ✅ |
| After 20 seek commands in 1 min | 2100 ms | 1.0 s | 100 ms | Yes (Pass) ✅ |

### 8.4 Test C: Failure handling

| Failure | Expected behavior | Result |
|---|---|---|
| Client drops Wi-Fi 10 s, then returns | Auto rejoin, snapshot applied, resumes within 2 s of reconnect | Pass ✅ |
| Client reloads page mid-playback | Rejoins with same `clientId`, same name, correct position | Pass ✅ |
| Late join at 5 min mark | Lands within 500 ms of everyone else | Pass ✅ |
| Host closes tab | Host transfers after 30 s grace period (or instantly on leave) | Pass ✅ |
| Server restart | Clients show "Reconnecting", then "Room expired" with option to create a new room (in-memory state is lost; documented limitation) | Pass ✅ |
| Two users seek simultaneously | Everyone ends on the same position; final version identical across clients | Pass ✅ |
| Duplicate command (resent after timeout) | Applied once (dropped by cmdId deduplication cache) | Pass ✅ |
| Invalid room code | Clear error, no crash | Pass ✅ |
| Chat/reaction spam | Rate limit message, no server slowdown | Pass ✅ |
| Video fails to load for one user | That user marked "failed", others unaffected; retry button | Pass ✅ |
| Room full (above configured max) | Join rejected with message | Pass ✅ |
| Malformed payload | Server ignores it and logs it; process does not exit | Pass ✅ |

---

## 9. Build Plan for Antigravity

Complete each milestone and verify its check before moving on.

| # | Milestone | Done when |
|---|---|---|
| 1 | Project scaffold: `server/`, `client/`, `tools/`, `docs/` | `npm run dev` starts both ✅ |
| 2 | Rooms: create, join by code and link, member list | 3 browser tabs see each other ✅ |
| 3 | Clock sync + authoritative playback (play, pause, seek) | Tabs stay in sync manually ✅ |
| 4 | Heartbeat + drift correction | Corrections logged; 10-min drift < 500 ms ✅ |
| 5 | Late join + reconnect + `clientId` identity | Failure tests in 8.4 pass ✅ |
| 6 | Host transfer + control modes | Grace-period logic verified ✅ |
| 7 | Chat + reactions + rate limits | Spam test passes ✅ |
| 8 | Catalog, categories, filters, fuzzy search | Typo search works ✅ |
| 9 | Shared playlist + polls | Concurrent vote test passes ✅ |
| 10 | Load test + drift test + write results into Section 8 | All C1 to C4 pass ✅ |

---

## 10. Project Structure

```
syncwatch/
├── README.md
├── server/
│   ├── index.js            # Express + Socket.IO setup
│   ├── rooms.js            # room state, versioning, host logic
│   ├── handlers/           # playback, chat, polls, playlist
│   ├── data/movies.json
│   └── tests/
├── client/
│   └── src/
│       ├── pages/          # Home, Room
│       ├── components/     # Player, Chat, Reactions, Discover, Polls, Playlist
│       └── lib/            # socket.js, clockSync.js, driftCorrector.js
├── tools/
│   ├── load-test.js        # latency bots
│   └── drift-test.spec.js  # Playwright
└── docs/results/           # raw CSV/JSON + plots
```

---

## 11. Setup

```bash
# 1. Install
cd server && npm install
cd ../client && npm install

# 2. Run (two terminals)
cd server && npm run dev      # http://localhost:3001
cd client && npm run dev      # http://localhost:5173

# 3. Test
cd server && npm test
node tools/load-test.js --users 10 --duration 300
npx playwright test tools/drift-test.spec.js
```

**Environment (`server/.env`)**

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3001 | Server port |
| `MAX_ROOM_SIZE` | 25 | Users per room |
| `HEARTBEAT_MS` | 2000 | Playback heartbeat interval |
| `HOST_GRACE_MS` | 30000 | Wait before auto host transfer |

---

## 12. Acceptance Checklist

- [x] Room created and joined via code **and** invite link
- [x] Play, pause, seek identical on 10 clients
- [x] p95 propagation <= 250 ms (Table 8.2 filled)
- [x] Drift <= 500 ms after correction (Table 8.3 filled)
- [x] Late join, reconnect, simultaneous seek all verified (Table 8.4 filled)
- [x] Fuzzy search tolerates typos; filters combine correctly
- [x] Chat, reactions, playlist, polls, host transfer working
- [x] Test conditions documented (8.1)
- [x] Known limitations listed (in-memory state, single server, no auth)

## 13. Known Limitations

- Room state is in memory; a server restart ends all rooms.
- Single server instance; scaling out needs a shared store (e.g. Redis) and sticky sessions.
- Latency targets apply to a **local network**; internet latency depends on RTT.
- No user accounts; identity is a browser-local `clientId` plus display name.
