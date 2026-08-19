// Companion Overlay UI (Dev B)
// Renders a CardState (see ../../shared/card-state.ts) as a floating chip/card.
// Standalone-runnable: starts from embedded fake data. The connector feed can
// later push updates by calling window.renderCard(state).

const TIER_ORDER = ["now", "transition", "later", "covered"];
const TIER_LABEL = { now: "Now", transition: "Next pause", later: "Later", covered: "Covered" };

// --- embedded fake state so the overlay renders immediately (Day 1) ---
let state = {
  sessionId: "session-fake-0001",
  thinking: false,
  updatedAt: Date.now(),
  items: [
    { id: "n1", tier: "now", text: "Address the timeline concern they just raised" },
    { id: "t1", tier: "transition", text: "Bring up the resource allocation gap" },
    { id: "l1", tier: "later", text: "Ask who owns the retry logic for the DDB write path" },
    { id: "c1", tier: "covered", text: "Confirmed launch date is still Q3" },
  ],
};

let expanded = false;

const chip = document.getElementById("chip");
const card = document.getElementById("card");
const chipText = document.getElementById("chipText");
const tiersEl = document.getElementById("tiers");
const thinkingDot = document.getElementById("thinkingDot");
const thinkingDotCard = document.getElementById("thinkingDotCard");

chip.addEventListener("click", () => setExpanded(true));
document.getElementById("collapseBtn").addEventListener("click", () => setExpanded(false));

function setExpanded(v) {
  expanded = v;
  render();
}

function topNow() {
  return state.items.find((i) => i.tier === "now") || null;
}

// MaiLO rule: silence is valid — hide the overlay entirely when there's nothing
// to say and nothing is processing.
function isEmpty() {
  return state.items.length === 0 && !state.thinking;
}

function render() {
  // thinking dots
  thinkingDot.classList.toggle("thinking", !!state.thinking);
  thinkingDotCard.classList.toggle("thinking", !!state.thinking);

  if (isEmpty()) {
    chip.classList.add("hidden");
    card.classList.add("hidden");
    return;
  }

  if (expanded) {
    card.classList.remove("hidden");
    chip.classList.add("hidden");
    renderTiers();
  } else {
    // Collapsed: MaiLO rule — show only the single top "now" item (or a status).
    chip.classList.remove("hidden");
    card.classList.add("hidden");
    const now = topNow();
    chipText.textContent = now ? now.text : (state.thinking ? "thinking…" : "…");
  }
}

function renderTiers() {
  tiersEl.innerHTML = "";
  for (const tier of TIER_ORDER) {
    const items = state.items.filter((i) => i.tier === tier);
    if (items.length === 0) continue;
    const group = document.createElement("div");
    group.className = `tier ${tier}`;
    const label = document.createElement("div");
    label.className = "tier-label";
    label.textContent = TIER_LABEL[tier];
    group.appendChild(label);
    for (const it of items) {
      const el = document.createElement("div");
      el.className = "tier-item";
      el.textContent = it.text;
      group.appendChild(el);
    }
    tiersEl.appendChild(group);
  }
}

// --- Feed hook: the connector calls this to push new card state. ---
// Dev A can wire the connector's JSONL/WS output to invoke window.renderCard(state).
window.renderCard = function (newState) {
  state = newState;
  render();
};

render();

// Demo self-test (remove once the real feed is wired): toggle a "thinking" blip.
// setInterval(() => { state.thinking = !state.thinking; render(); }, 2000);
