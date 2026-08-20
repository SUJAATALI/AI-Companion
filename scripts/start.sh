#!/usr/bin/env bash
# One-command launcher for the Always-On AI Companion.
# Brings up KAWA (daemon + browser-speech) and the overlay so it's "just there".
#
# NOTE on Apple Silicon: KAWA's toolbox binary is x86_64-only and Parakeet
# crashes under Rosetta, so we use the Browser Speech backend (runs in Chrome).
# You still start/keep a Meeting Advisor session in the Chrome tab that opens —
# that tab is what captures your mic for Browser Speech.

set -u
KAWA_HTTP="http://localhost:3100"

echo "[start] launching KAWA daemon (--no-tunnel)…"
kawa-live --no-tunnel start >/dev/null 2>&1 || true

# wait for health
for i in $(seq 1 20); do
  curl -s "${KAWA_HTTP}/api/live/status" >/dev/null 2>&1 && break
  sleep 0.5
done

echo "[start] setting transcription backend = browser-speech…"
curl -s -X PATCH "${KAWA_HTTP}/api/live/settings/user" \
  -H 'content-type: application/json' \
  -d '{"backend":"browser-speech"}' >/dev/null

echo "[start] opening KAWA UI in Chrome (start a Meeting Advisor session there, allow mic)…"
open -a "Google Chrome" "${KAWA_HTTP}" 2>/dev/null || open "${KAWA_HTTP}"

echo "[start] launching overlay (auto-starts a session if none is running)…"
# Run the overlay; it polls KAWA, renders the card, speaks the 'now' item.
( cd "$(dirname "$0")/../overlay/src-tauri" && cargo tauri dev )
