# Session Context — Always-On AI Companion (GPP Hack 2026)

Handoff notes so a teammate (or their AI session) can get full context fast.
Full living doc: https://chorus.aws.dev/doc/ozSMIIPhUniL

## What we're building
A floating **desktop overlay** that renders KAWA Live's tiered **coaching card**
(now / transition / later / covered) in real time and **speaks the "now" item**
aloud. We do NOT build the AI backend — **KAWA Live** is the backend (audio,
transcription, screen vision, coaching pipeline). Our app just consumes it.

## Architecture (as built — self-contained overlay)
- KAWA runs locally at `http://localhost:3100` (Rust daemon).
- The **overlay's Rust backend polls KAWA's REST API** directly (no CORS, no
  separate process): finds the running session, polls
  `GET /api/live/sessions/:id/display-state`, emits `card` events to the webview,
  and speaks new "now" items via macOS `say`.
- The webview (`overlay/src/app.js`) renders the `CardState` and listens for `card` events.
- On macOS the window is a **non-activating NSPanel** (via `tauri-nspanel`) → floats
  over other apps AND their fullscreen Spaces, no Dock icon, never steals focus.
- No shoji, no separate connector needed to run it. (The `connector/` still exists as a
  standalone CLI/JSONL option but the overlay doesn't require it.)

Key KAWA endpoints (for reference):
- `POST /api/live/sessions` (start), `/sessions/:id/inject`, `/sessions/:id/stop`
- `GET /api/live/sessions/:id/display-state` → coaching card `{ items: [{tier,text}] }`
- `PATCH /api/live/settings/user` → change settings (e.g. transcription backend)
- WebSocket `ws://localhost:3100/ws` (event `live:display-tool` = card) — available alternative to polling.

## ⚠️ macOS setup — READ THIS (the big gotcha we lost hours to)
**Root cause of all our "crashes":** KAWA's toolbox build is **x86_64-only**. On
**Apple Silicon (M1–M5)** it runs under **Rosetta**, and its local Parakeet
speech model (ONNX/ORT, `osx-x86_64`) **crashes the daemon** under emulation.
Confirmed by Ally: the build pipeline defaults to Linux/x86_64; ARM mac-fleet
support is new and not yet shipped. So on any Apple Silicon Mac, **native
Parakeet will crash.** (It only works natively on a real **Intel** Mac.)

**The fix — use a backend that doesn't use the local ORT model:**
- **Browser Speech** (recommended for the demo) — speech-to-text runs in Chrome,
  no ORT, no creds, works on any arch. Set it via API (it may not appear in the
  Settings dropdown on older builds — use **PATCH**, not PUT):
  ```bash
  curl -s -X PATCH http://localhost:3100/api/live/settings/user \
    -H 'content-type: application/json' -d '{"backend":"browser-speech"}'
  ```
- **AWS Transcribe** also works on any arch (cloud, no local ORT) — just needs
  valid AWS creds (`ada`/`mwinit`). Not needed if Browser Speech works.
- **Parakeet (kawa-stt)** = the only Intel-bound backend. Avoid on Apple Silicon.

Other setup notes:
- Start daemon headless: `kawa-live --no-tunnel start` (watchdog in `scripts/`).
- Disable **Post-Session Summary** (Settings → Summary) — was a separate crash on session end.
- Don't run the daemon and the `.app` at once (both use port 3100).
- Run KAWA in **Chrome** (Browser Speech uses Chrome's Web Speech API).

## Run it (full demo loop)
```bash
# 1. KAWA daemon + Browser Speech backend
kawa-live --no-tunnel start
curl -s -X PATCH http://localhost:3100/api/live/settings/user \
  -H 'content-type: application/json' -d '{"backend":"browser-speech"}'
open -a "Google Chrome" http://localhost:3100     # start a Meeting Advisor session, allow mic, talk

# 2. Overlay (self-contained: polls KAWA, renders, speaks)
cd overlay/src-tauri && cargo tauri dev
```

## Repo layout
```
companion/
  shared/card-state.ts     # CardState / ConnectorEvent contract
  fixtures/fake-card.json   # sample card for standalone UI dev
  scripts/kawa-watchdog.sh  # keeps the daemon alive (--no-tunnel)
  connector/                # optional standalone Node CLI (zero-dep fetch polling; JSONL/voice/shoji modes)
  overlay/                  # the app — Tauri v2, NO npm (cargo + static HTML/JS)
    src/                    #   index.html, styles.css, app.js (renders CardState, drag, listens for `card` events)
    src-tauri/src/main.rs   #   NSPanel HUD setup + KAWA REST poller + `say` voice
    src-tauri/Cargo.toml     #   tauri-nspanel (macOS), ureq (json), serde
    src-tauri/capabilities/  #   default.json — allows JS start-dragging
    README.md
```

## Status
- ✅ Overlay floats over everything incl. fullscreen (non-activating NSPanel), draggable, click-to-expand.
- ✅ Overlay polls KAWA live, renders the tiered coaching card, speaks the "now" item.
- ✅ Transcription working via **Browser Speech** (Parakeet unusable on Apple Silicon — see above).
- ✅ Root cause of the crash saga understood + confirmed with Ally (x86_64-only build on arm64).
- ⏭️ Optional polish: draft-action ("do it for me"), MaiLO-style coaching rules, distribution packaging.

## Overlay macOS fix (how the float-over-everything works)
`overlay/src-tauri/src/main.rs`: register `tauri_nspanel`, `set_activation_policy(Accessory)`,
convert the window with `to_panel()`, then `set_level(25)` + `set_style_mask(1<<7 nonactivating)`
+ `set_collection_behaviour(FullScreenAuxiliary | CanJoinAllSpaces | Stationary)` + `order_front_regardless()`.
Dragging is JS-driven (`startDragging()` with a 4px threshold) because a non-activating panel
ignores `data-tauri-drag-region`. Requires `withGlobalTauri: true` + the capabilities file.

## Contacts
- KAWA Live author: **abilbray** (Ally, L6) — #kawa-live-interest. Confirmed the x86_64-only /
  ARM-distribution gap; native arm64 Parakeet pending a mac-fleet ARM build.
- MaiLO (related work, same ecosystem): **yidan**. Borrow its coaching UX principles
  (one insight at a time, silence is valid, warm persona), not its architecture.
