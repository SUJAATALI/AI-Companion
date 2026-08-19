#!/usr/bin/env bash
# P0 — KAWA Live watchdog.
# Keeps the KAWA daemon alive during the demo. KAWA crashes silently on
# session-end/summary and during local Parakeet/ORT init on Intel macOS, so:
#   - always start with --no-tunnel (tunnel retry loop adds instability)
#   - the app/session must use Browser Speech or AWS Transcribe backend
#     (set in the KAWA UI: Settings -> Transcription) to avoid the ORT crash
#   - Post-Session Summary must be OFF (Settings -> Summary) to avoid the end crash
# This script only guarantees the daemon is up; the backend/summary toggles
# are one-time settings in the KAWA UI.

set -u
INTERVAL="${1:-5}"   # seconds between health checks

echo "[watchdog] starting KAWA Live watchdog (check every ${INTERVAL}s). Ctrl+C to stop."

while true; do
  if ! kawa-live status >/dev/null 2>&1; then
    echo "[watchdog] $(date '+%H:%M:%S') daemon down -> starting (--no-tunnel)"
    kawa-live --no-tunnel start >/dev/null 2>&1 || echo "[watchdog] start failed, will retry"
  fi
  sleep "$INTERVAL"
done
