# Always-On AI Companion (GPP Hack 2026)

A floating desktop overlay that renders KAWA Live's tiered coaching card in
real time and speaks the top ("now") suggestion aloud. KAWA Live is the
backend (audio, transcription, screen vision, coaching pipeline); this repo is
only the **Companion** that consumes it over HTTP + WebSocket.

Full plan/findings: https://chorus.aws.dev/doc/ozSMIIPhUniL

## Architecture (black-box KAWA)
```
KAWA Live daemon (localhost:3100)   <-- installed dependency, we don't modify it
  ├─ HTTP  /api/live/...   (start session, inject, display-state)
  └─ WS    /ws             (live:display-tool, live:node-busy/idle, ...)
        │
        ▼
  connector/ (Dev A)  --> normalized CardState (see shared/card-state.ts)
        │
        ▼
  overlay/ (Dev B)   --> Tauri floating always-on-top card + voice
```

## Prereqs
1. Install KAWA Live: `toolbox install kawa-live`
2. In the KAWA UI (localhost:3100) → Settings:
   - **Transcription → Backend = Browser Speech** (avoids the Intel ORT crash)
   - **Summary → Post-Session Summary = OFF** (avoids the session-end crash)

## Run
```bash
# keep KAWA alive (P0)
bash scripts/kawa-watchdog.sh

# connector — LIVE (starts a Meeting Advisor session + subscribes to /ws)
cd connector && npm install && npm start

# connector — FAKE (no KAWA needed; unblocks the overlay on Day 1)
cd connector && npm install && npm run fake
```
The connector prints `ConnectorEvent` JSONL on stdout (see `shared/card-state.ts`).

## 2.5-day split
- **Dev A — glue + voice:** `scripts/`, `connector/`, voice (macOS `say` → Polly).
- **Dev B — overlay UI:** `overlay/` (Tauri) — renders `CardState`, chip ↔ expanded card, coaching display rules. Start against `fixtures/fake-card.json`.
- **Teammate C — demo/pitch:** script, slides, backup recording, timing.

### Guardrails
- Both devs code against `shared/card-state.ts` + `fixtures/fake-card.json` from hour 1.
- Full loop (overlay ← real connector feed + voice) working by **Day 2 lunch**.
- **Feature-freeze Day 2 PM** — rehearsal + bug-fix only after that.
- If it slips: ship **overlay + voice**, pitch the draft-action.
