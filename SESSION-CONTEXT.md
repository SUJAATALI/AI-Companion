# Session Context — Always-On AI Companion (GPP Hack 2026)

Handoff notes so a teammate (or their AI session) can get full context fast.
Full living doc: https://chorus.aws.dev/doc/ozSMIIPhUniL

## What we're building
A floating **desktop overlay** that renders KAWA Live's tiered **coaching card**
(now / transition / later / covered) in real time and **speaks the "now" item**
aloud. We do NOT build the AI backend — **KAWA Live** is the backend (audio,
transcription, screen vision, coaching pipeline). Our app just consumes it.

## Key decision: consume KAWA over HTTP + WebSocket (no MCP)
- KAWA runs locally at `http://localhost:3100` (a Rust daemon / Mac app).
- **Control (HTTP):** `POST /api/live/sessions` (start), `/sessions/:id/inject`, `/sessions/:id/stop`.
- **Coaching card (poll):** `GET /api/live/sessions/:id/display-state`
  → `{ "coaching-display": { "items": [ {"tier":"now","text":"..."} ] } }`
- **Live push (WebSocket):** `ws://localhost:3100/ws` — JSON events with a `type`:
  - `live:display-tool` → the coaching card update (`args.items` = tier/text) — THE overlay feed
  - `live:node-busy` / `live:node-idle` → "thinking" indicator (Tier-1 ack)
  - `live:agent-stream` (`text-delta`) → streaming reasoning (Tier-2)
  - `live:transcript`, `live:status`
- Base template we use: **Meeting Advisor** (8-node pipeline = our Companion graph).

## KAWA local setup gotchas (important)
- Start daemon: `kawa-live --no-tunnel start` (a watchdog script is in `scripts/`).
- **Disable Post-Session Summary** (KAWA Settings → Summary) — it crashes the daemon on session end.
- **Set transcription backend to Browser Speech** (or AWS Transcribe) — on Intel Macs the local
  Parakeet/ORT model download crashes the daemon. Set via API:
  `PUT /api/live/settings/user {"backend":"browser-speech"}`.
- Don't run the daemon and the `.app` at once (both use port 3100).

## Repo layout
```
companion/
  shared/card-state.ts      # THE contract both sides code against (CardState, ConnectorEvent)
  fixtures/fake-card.json    # sample card so the overlay works with no KAWA
  scripts/kawa-watchdog.sh   # keeps the daemon alive (--no-tunnel)
  connector/                 # Dev A — Node: starts a session, subscribes /ws, emits CardState JSONL
    connector.js             #   `node connector.js`  (live)  |  `node connector.js --fake ../fixtures/fake-card.json`
    package.json             #   dep: ws
  overlay/                   # Dev B — Tauri v2 floating overlay (NO npm; cargo + static HTML/JS)
    src/                     #   index.html, styles.css, app.js  (renders CardState; window.renderCard(state) is the feed hook)
    src-tauri/               #   Cargo.toml, tauri.conf.json (transparent/borderless), src/main.rs (macOS HUD setup)
    make_icon.py             #   generates the app icon (stdlib only)
    README.md                #   how to run: `cargo install tauri-cli --version ^2 --locked` then `cargo tauri dev`
```

## Status (as of this session)
- ✅ Connector scaffolded; **fake mode works** (`node connector/connector.js --fake fixtures/fake-card.json`).
- ✅ Overlay runs (`cargo tauri dev`) — translucent tiered card renders, chip↔expand works, draggable.
- ⚠️ **Overlay window behavior:** it renders beautifully but still feels like a normal app window.
  Tried always-on-top + all-Spaces + Accessory policy via `objc2-app-kit` (see `overlay/src-tauri/src/main.rs`).
  The truly seamless HUD needs an **NSPanel (non-activating panel)** — `tauri-nspanel` crate (git-only).
  Decision: this is polish; for the demo you control the screen. Revisit only if time allows.
- ⏭️ **Not yet done:** wire the connector's live feed into `overlay` (`window.renderCard`), and the voice (TTS the "now" tier via macOS `say` → AWS Polly).

## Plan (2.5 days, 2 builders + 1 non-coding)
- Dev A: `connector/` (live HTTP+WS → CardState) + voice (`say`/Polly) + watchdog.
- Dev B: `overlay/` Tauri app — render CardState, coaching display rules (top "now" only, hide when empty).
- Teammate C (no code): demo script, slides, backup recording, timing.
- Integration target: full loop (overlay ← live feed + voice) by Day-2 lunch. Feature-freeze Day-2 PM.
- If it slips: ship overlay + voice, pitch the draft-action.

## Contacts
- KAWA Live author: **abilbray** (Ally, L6) — #kawa-live-interest. Crash fixes are on her (cross-platform WIP).
- MaiLO (related work, same ecosystem): **yidan**. Borrow its coaching UX principles (one insight at a time,
  silence is valid, warm persona), not its architecture.
