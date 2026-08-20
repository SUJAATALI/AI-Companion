#!/usr/bin/env bash
# KAWA Live watchdog — keeps the daemon alive and pinned to a safe backend.
# The x86_64/Rosetta daemon on Apple Silicon can crash under session load;
# this restarts it and re-applies Browser Speech (so it never reverts to the
# crash-prone Parakeet backend on restart).

set -u
INTERVAL="${1:-4}"
KAWA_HTTP="http://localhost:3100"

echo "[watchdog] running (check every ${INTERVAL}s). Ctrl+C to stop."

set_browser_speech() {
  # wait briefly for health, then pin browser-speech
  for i in $(seq 1 10); do
    curl -s "${KAWA_HTTP}/api/live/status" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -s -X PATCH "${KAWA_HTTP}/api/live/settings/user" \
    -H 'content-type: application/json' \
    -d '{"backend":"browser-speech"}' >/dev/null 2>&1
}

while true; do
  # Real HTTP health check — `kawa-live status` can report a stale pid as
  # "running" after a silent crash, so curl the actual endpoint instead.
  if ! curl -s -m 3 "${KAWA_HTTP}/api/live/status" >/dev/null 2>&1; then
    echo "[watchdog] $(date '+%H:%M:%S') daemon unhealthy -> restarting (--no-tunnel, browser-speech)"
    kawa-live start >/dev/null 2>&1 || true          # clears any stale pid file
    kawa-live --no-tunnel start >/dev/null 2>&1 || echo "[watchdog] start failed, will retry"
    set_browser_speech
  fi
  sleep "$INTERVAL"
done
