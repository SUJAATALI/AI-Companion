# Overlay (Tauri v2, no npm)

Floating always-on-top translucent coaching card. Built **cargo-only** — no npm
needed (dodges the internal-registry auth issue). UI is plain HTML/CSS/JS in `src/`.

## One-time setup
```bash
# Rust + Xcode CLT already required (you have them).
# Install the Tauri dev CLI from crates.io (first build takes a few minutes):
cargo install tauri-cli --version "^2" --locked
```

## Run (dev)
```bash
cd overlay/src-tauri
cargo tauri dev
```
A translucent, borderless, always-on-top window appears (top-left). It starts
from embedded fake card data so you can see it immediately.

## Layout
```
overlay/
  src/                 # frontend (static, no build step)
    index.html
    styles.css
    app.js             # renders CardState; window.renderCard(state) is the feed hook
  src-tauri/
    Cargo.toml
    build.rs
    tauri.conf.json    # transparent + alwaysOnTop + decorations:false + macOSPrivateApi
    src/main.rs
```

## Window config (already set in tauri.conf.json)
- `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `shadow: false`
- `macOSPrivateApi: true` (required for transparency on macOS)
- No dev server: `frontendDist` points straight at `../src`.

## Wiring the real feed (integration with connector)
`app.js` exposes `window.renderCard(state)`. Dev A's connector emits `CardState`
(see `../shared/card-state.ts`); pipe that in — simplest options:
1. Have the connector expose a local WebSocket and connect to it here, or
2. Use a Tauri command/event to forward the connector's stdout JSONL to the webview.

Until then it renders the embedded fake card.

## If transparency/click-through misbehaves on macOS
Fallback per the plan: ship the card as a KAWA pane plugin (`write_panes`). But
`macOSPrivateApi: true` + `transparent: true` should work (KAWA itself ships a
Tauri app, so the stack is proven here).
