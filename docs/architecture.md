# Tank Trouble Online — Architecture

## Overview

Online multiplayer Tank Trouble with server-authoritative physics. Designed for low latency real-time gameplay.

## Project Structure

```
TankTrouble/
├── shared/          # Rust crate — core physics (Rapier2D), protocol, map
│   └── Compiles to: native (server) + WASM (client prediction)
├── server/          # Rust binary — WebSocket game server
│   └── Deploy to: Fly.io (free tier, 3x 256MB VMs)
├── client/          # TypeScript + Vite — Canvas renderer, input, UI
│   └── Deploy to: Vercel or Cloudflare Pages (free)
└── docs/            # This file + protocol spec
```

## Deployment Plan

| Component | Platform | Cost | Why |
|-----------|----------|------|-----|
| Client (static) | Vercel / CF Pages | Free | Static assets, global CDN |
| Game Server | Fly.io | Free (3 VMs) | Native WebSocket, persistent process, low latency |

### Alternative: Cloudflare Durable Objects ($5/month)
If budget allows, Durable Objects are ideal — each game room is a DO instance with native WebSocket support and global edge deployment. Use the WebSocket Hibernation API to minimize costs.

## Network Architecture

```
Client A ──WebSocket──┐
                      ├── Game Server (authoritative physics) ──Fly.io──
Client B ──WebSocket──┘
```

### Server-Authoritative Model
- **Server** runs Rapier2D physics at 60 Hz (the single source of truth)
- **Clients** send inputs (key states) every frame
- **Server** broadcasts state snapshots at 20-30 Hz + events immediately
- **Clients** render with interpolation between snapshots

### Client Prediction (future)
- Client runs WASM copy of the same physics engine
- Applies local input immediately (responsive feel)
- Reconciles with server snapshots (rollback if mismatch)
- Other players' positions are interpolated

## Protocol

See `shared/src/protocol.rs` for message definitions.

### Client → Server
- `Join { name }` — join the game
- `Input(TankInput)` — key states per tick
- `Ping { timestamp }` — latency measurement

### Server → Client
- `Welcome { player_id, map }` — on connection
- `Snapshot(GameSnapshot)` — periodic full state (20-30 Hz)
- `Events(Vec<GameEvent>)` — immediate events (bullet fired, tank destroyed)
- `Pong { timestamp }` — latency response

### Binary Protocol (future optimization)
For production, replace JSON with a binary format:
- Tank state: 16 bytes (x: f32, y: f32, angle: f32, flags: u32)
- Bullet state: 20 bytes (x: f32, y: f32, vx: f32, vy: f32, id: u32)
- Full snapshot for 4 players + 20 bullets: ~464 bytes vs ~2KB+ JSON

## Physics Engine

**Rapier2D** (Rust, compiled to WASM for client):
- Deterministic simulation
- Continuous Collision Detection (CCD) — bullets don't tunnel through walls
- Efficient broad-phase (sweep and prune)

Key physics parameters (in `shared/src/physics.rs`):
- Tank speed: 150 units/s
- Bullet speed: 350 units/s
- Max bounces: 50
- Max bullets per tank: 5
- Simulation timestep: 1/60s

## Matchmaking (future)

Simple queue-based matchmaker:
1. Player connects → enters queue
2. When 2-4 players in queue → create game room
3. Game room runs until round ends → option to rematch or requeue

For Fly.io, matchmaker can be a separate process or a simple HTTP endpoint.
For Durable Objects, matchmaker is a separate DO that assigns players to room DOs.

## Development Phases

### Phase 1 (current): Local Prototype
- [x] TypeScript physics engine (mirrors Rust logic)
- [x] Canvas renderer
- [x] 2-player local multiplayer (same keyboard)
- [x] Map, walls, collision, bullets, bouncing

### Phase 2: Rust Server
- [ ] WebSocket server with tokio-tungstenite
- [ ] Server-side Rapier2D physics loop
- [ ] Room management (create/join/leave)
- [ ] Basic matchmaking

### Phase 3: Online Play
- [ ] Connect client to server via WebSocket
- [ ] Replace local physics with server state
- [ ] Client-side prediction with WASM physics
- [ ] Interpolation + reconciliation
- [ ] Deploy: client to Vercel, server to Fly.io

### Phase 4: Polish
- [ ] Better maps (procedural or map editor)
- [ ] Score tracking
- [ ] Sound effects
- [ ] Mobile touch controls
- [ ] Spectator mode
