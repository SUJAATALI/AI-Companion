#!/usr/bin/env node
/**
 * Companion Connector (Dev A) — zero-dependency.
 * ----------------------------------------------
 * Bridges KAWA Live to a normalized CardState and renders it as a floating
 * overlay via **shoji** (Ally's agent overlay system). Uses Node's built-in
 * fetch (Node 18+) — NO npm packages required.
 *
 * Modes:
 *   node connector.js                 # live: start a KAWA session, poll display-state
 *   node connector.js --attach <id>   # live: attach to an existing running session
 *   node connector.js --fake <file>   # replay a fixture (no KAWA needed)
 *
 * Flags:
 *   --shoji            render the card as a shoji `panel` overlay (show/update)
 *   --speak            speak each new "now" item aloud (macOS `say`)
 *   --template <id>    KAWA template to start (default: meeting-advisor)
 *   --interval <ms>    poll interval (default: 800)
 *
 * Requirements for --shoji:
 *   - shoji built + on PATH (or set SHOJI_BIN=/path/to/shoji)
 *   - shoji daemon running:  shoji daemon &
 *
 * Output: also emits ConnectorEvent JSONL on stdout (see ../shared/card-state.ts)
 * so a custom overlay can consume it instead of / in addition to shoji.
 */

import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";

const HTTP = process.env.KAWA_HTTP || "http://localhost:3100/api/live";
const SHOJI_BIN = process.env.SHOJI_BIN || "shoji";
const OVERLAY_ID = "companion";
const args = process.argv.slice(2);

function flag(name) { return args.includes(name); }
function opt(name, def) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : def; }

const USE_SHOJI = flag("--shoji");
const SPEAK = flag("--speak");
const TEMPLATE = opt("--template", "meeting-advisor");
const INTERVAL = parseInt(opt("--interval", "800"), 10);

function emit(event) { process.stdout.write(JSON.stringify(event) + "\n"); }

// ---- voice (macOS `say`) ----
const spoken = new Set();
function speakNow(items) {
  if (!SPEAK) return;
  for (const it of items) {
    if (it.tier === "now" && !spoken.has(it.id)) {
      spoken.add(it.id);
      execFile("say", [it.text], () => {});
    }
  }
}

// ---- shoji overlay ----
const TIER_META = {
  now:        { label: "NOW",        color: "green",  pulse: true },
  transition: { label: "NEXT PAUSE", color: "yellow", pulse: false },
  later:      { label: "LATER",      color: "blue",   pulse: false },
  covered:    { label: "COVERED",    color: "gray",   pulse: false },
};
const TIER_ORDER = ["now", "transition", "later", "covered"];

function toShojiPanel(state) {
  const items = [];
  for (const tier of TIER_ORDER) {
    for (const it of state.items.filter((i) => i.tier === tier)) {
      const m = TIER_META[tier];
      items.push({ label: m.label, color: m.color, value: it.text, pulse: m.pulse });
    }
  }
  return {
    title: "Companion",
    icon: "🐾",
    badge: state.thinking ? "thinking…" : undefined,
    items,
  };
}

let shojiShown = false;
function pushShoji(state) {
  if (!USE_SHOJI) return;
  const data = JSON.stringify(toShojiPanel(state));
  if (!shojiShown) {
    shojiShown = true;
    execFile(SHOJI_BIN, ["show", "panel", "--id", OVERLAY_ID, "--position", "top-right", "--draggable", "--data", data],
      (err) => { if (err) console.error("[connector] shoji show error:", err.message); });
  } else {
    execFile(SHOJI_BIN, ["update", OVERLAY_ID, "--data", data],
      (err) => { if (err) console.error("[connector] shoji update error:", err.message); });
  }
}

// KAWA's /display-state: find the items array wherever it lives.
function extractItems(displayState) {
  if (!displayState || typeof displayState !== "object") return [];
  for (const v of Object.values(displayState)) {
    if (v && Array.isArray(v.items)) {
      return v.items
        .filter((it) => it && it.tier && it.text)
        .map((it, i) => ({ id: it.id || `${it.tier}-${i}-${String(it.text).slice(0, 16)}`, tier: it.tier, text: it.text }));
    }
  }
  return [];
}

function render(state) {
  emit({ type: "card", state });
  pushShoji(state);
  speakNow(state.items);
}

// ---------- FAKE MODE ----------
if (flag("--fake")) {
  const evt = JSON.parse(readFileSync(opt("--fake"), "utf8"));
  render(evt.state);
  console.error("[connector] fake mode: replayed", opt("--fake"));
  // keep process alive briefly so async shoji/say calls fire
  setTimeout(() => process.exit(0), 500);
}

// ---------- LIVE MODE (HTTP polling) ----------
async function startSession() {
  const res = await fetch(`${HTTP}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ templateId: TEMPLATE, backend: "browser-speech", title: "Companion session" }),
  });
  if (!res.ok) throw new Error(`start session failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

async function fetchDisplayState(id) {
  const res = await fetch(`${HTTP}/sessions/${id}/display-state`);
  if (!res.ok) throw new Error(`display-state ${res.status}`);
  return res.json();
}

async function mainLive() {
  const attach = opt("--attach");
  const sessionId = attach || (await startSession());
  console.error(`[connector] ${attach ? "attached to" : "started"} ${sessionId} (poll ${INTERVAL}ms${USE_SHOJI ? ", shoji" : ""}${SPEAK ? ", speak" : ""})`);
  emit({ type: "status", sessionId, status: "running" });

  let last = "";
  setInterval(async () => {
    try {
      const items = extractItems(await fetchDisplayState(sessionId));
      const sig = JSON.stringify(items);
      if (sig !== last) {
        last = sig;
        render({ sessionId, items, thinking: false, updatedAt: Date.now() });
      }
    } catch (e) {
      console.error("[connector] poll error:", e.message);
    }
  }, INTERVAL);
}

if (!flag("--fake")) {
  mainLive().catch((e) => { console.error("[connector] fatal:", e.message); process.exit(1); });
}
