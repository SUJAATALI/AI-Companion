#!/usr/bin/env node
/**
 * Companion Connector (Dev A)
 * ---------------------------
 * Bridges KAWA Live to a normalized CardState stream the overlay consumes.
 *
 * Modes:
 *   node connector.js                 # live: start a KAWA session + subscribe to /ws
 *   node connector.js --attach <id>   # live: attach to an existing running session
 *   node connector.js --fake <file>   # replay a fixture (no KAWA needed) — unblocks the overlay
 *
 * Output: one JSON object per line (JSONL) on stdout, matching ConnectorEvent
 * in ../shared/card-state.ts:
 *   {"type":"card","state":{...}}
 *   {"type":"status","sessionId":"...","status":"running"}
 *
 * The overlay can read this stdout stream directly, or we can swap the `emit()`
 * sink for a local WebSocket later. Keep emit() as the single output seam.
 */

import { readFileSync } from "node:fs";

const KAWA_HTTP = process.env.KAWA_HTTP || "http://localhost:3100/api/live";
const KAWA_WS = process.env.KAWA_WS || "ws://localhost:3100/ws";
const TEMPLATE_ID = process.env.KAWA_TEMPLATE || "meeting-advisor";

const args = process.argv.slice(2);
const fakeIdx = args.indexOf("--fake");
const attachIdx = args.indexOf("--attach");

/** Single output seam — swap for a WS server later if needed. */
function emit(event) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

// ---------- FAKE MODE (no KAWA) ----------
if (fakeIdx !== -1) {
  const file = args[fakeIdx + 1];
  const evt = JSON.parse(readFileSync(file, "utf8"));
  emit(evt);
  // Simulate a "thinking" blip + a follow-up update so the overlay can test transitions.
  setTimeout(() => emit({ type: "card", state: { ...evt.state, thinking: true, updatedAt: Date.now() } }), 1500);
  setTimeout(() => emit({ type: "card", state: { ...evt.state, thinking: false, updatedAt: Date.now() } }), 3000);
  console.error("[connector] fake mode: replayed", file);
  process.exit(0);
}

// ---------- LIVE MODE ----------
// Card state we maintain and re-emit on every relevant WS event.
const state = { sessionId: "", items: [], thinking: false, updatedAt: Date.now() };

function idFor(item, i) {
  return item.id || `${item.tier}-${i}-${(item.text || "").slice(0, 12)}`;
}

function pushCard() {
  state.updatedAt = Date.now();
  emit({ type: "card", state: { ...state, items: [...state.items] } });
}

async function startSession() {
  const res = await fetch(`${KAWA_HTTP}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      templateId: TEMPLATE_ID,
      backend: "browser-speech", // avoid the Intel ORT crash; change if you prefer AWS Transcribe
      title: "Companion session",
    }),
  });
  if (!res.ok) throw new Error(`start session failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.id;
}

function handleWsMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg.sessionId && state.sessionId && msg.sessionId !== state.sessionId) return; // filter other sessions

  switch (msg.type) {
    case "live:display-tool": {
      // Coaching card update: args.items = [{tier,text}, ...]
      const items = msg.args?.items;
      if (Array.isArray(items)) {
        state.items = items.map((it, i) => ({ id: idFor(it, i), tier: it.tier, text: it.text }));
        pushCard();
      }
      break;
    }
    case "live:node-busy":
      state.thinking = true;
      pushCard();
      break;
    case "live:node-idle":
      state.thinking = false;
      pushCard();
      break;
    case "live:status":
      emit({ type: "status", sessionId: msg.sessionId, status: msg.status });
      break;
    default:
      break; // ignore transcript/audio-level/etc for now
  }
}

async function main() {
  const { WebSocket } = await import("ws");

  if (attachIdx !== -1) {
    state.sessionId = args[attachIdx + 1];
    console.error("[connector] attaching to session", state.sessionId);
  } else {
    state.sessionId = await startSession();
    console.error("[connector] started session", state.sessionId);
  }
  emit({ type: "status", sessionId: state.sessionId, status: "running" });

  const ws = new WebSocket(KAWA_WS);
  ws.on("open", () => console.error("[connector] ws connected", KAWA_WS));
  ws.on("message", (data) => handleWsMessage(data.toString()));
  ws.on("close", () => console.error("[connector] ws closed"));
  ws.on("error", (e) => console.error("[connector] ws error:", e.message));
}

main().catch((e) => {
  console.error("[connector] fatal:", e.message);
  process.exit(1);
});
