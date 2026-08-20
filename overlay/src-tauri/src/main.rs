#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Companion Overlay — self-contained Tauri v2 app.
// - Rust polls KAWA Live's REST API for the coaching card (no CORS, no separate
//   process), emits `card` events to the webview, and speaks new "now" items.
// - On macOS the window is a non-activating NSPanel (floats over other apps +
//   their fullscreen Spaces, no Dock icon, never steals focus).

use std::time::Duration;
use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, WebviewWindowExt};

#[derive(serde::Serialize, Clone)]
struct CardItem {
    id: String,
    tier: String,
    text: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CardState {
    session_id: String,
    items: Vec<CardItem>,
    thinking: bool,
}

fn main() {
    let builder = tauri::Builder::default();

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .invoke_handler(tauri::generate_handler![ask])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(win) = app.get_webview_window("overlay") {
                #[cfg(target_os = "macos")]
                make_hud(&win);
                let _ = win.show();
            }

            spawn_kawa_poller(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Companion overlay");
}

// ---- KAWA poller: REST → CardState → webview event + voice ----
fn spawn_kawa_poller(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let base =
            std::env::var("KAWA_HTTP").unwrap_or_else(|_| "http://localhost:3100/api/live".into());
        let agent = ureq::builder().timeout(Duration::from_secs(5)).build();
        let mut last = String::new();

        loop {
            // Attach-only: render whatever session is running (start it fresh in Chrome).
            if let Some(state) = poll_once(&agent, &base) {
                let sig = serde_json::to_string(&state.items).unwrap_or_default();
                if sig != last {
                    last = sig;
                    let _ = app.emit("card", &state);
                }
            }
            std::thread::sleep(Duration::from_millis(800));
        }
    });
}

// Resolve which template to auto-start: env override → a template named
// "Companion" (our assistant pipeline) → fall back to meeting-advisor.
#[allow(dead_code)]
fn companion_template(agent: &ureq::Agent, base: &str) -> String {
    if let Ok(t) = std::env::var("KAWA_TEMPLATE") {
        if !t.is_empty() {
            return t;
        }
    }
    let found = (|| -> Option<String> {
        let v: serde_json::Value = agent
            .get(&format!("{base}/templates?q=Companion"))
            .call()
            .ok()?
            .into_json()
            .ok()?;
        for t in v["templates"].as_array()? {
            if t.get("name").and_then(|n| n.as_str()) == Some("Companion") {
                return t.get("id").and_then(|i| i.as_str()).map(|s| s.to_string());
            }
        }
        None
    })();
    found.unwrap_or_else(|| "meeting-advisor".to_string())
}

// Start a Companion (browser-speech) session if none is running.
#[allow(dead_code)]
fn ensure_session(agent: &ureq::Agent, base: &str) -> Result<(), String> {
    let template = companion_template(agent, base);
    agent
        .post(&format!("{base}/sessions"))
        .send_json(serde_json::json!({
            "templateId": template,
            "backend": "browser-speech",
            "title": "Companion (ambient)"
        }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn current_session(agent: &ureq::Agent, base: &str) -> Option<String> {
    let v: serde_json::Value = agent
        .get(&format!("{base}/sessions?status=running"))
        .call()
        .ok()?
        .into_json()
        .ok()?;
    v["sessions"]
        .as_array()?
        .first()?
        .get("id")?
        .as_str()
        .map(|s| s.to_string())
}

// Pull a display string out of a card item (string, or object with text/topic/etc.)
fn item_text(it: &serde_json::Value) -> Option<String> {
    if let Some(s) = it.as_str() {
        return Some(s.to_string());
    }
    for k in ["text", "topic", "content", "label"] {
        if let Some(s) = it.get(k).and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

fn extract_items(ds: &serde_json::Value) -> Vec<CardItem> {
    let mut out = vec![];
    // Real KAWA shape: display-state.card.state.{now,transition,later,covered} = [items]
    if let Some(state) = ds.get("card").and_then(|c| c.get("state")).and_then(|s| s.as_object()) {
        for tier in ["now", "transition", "later", "covered"] {
            if let Some(arr) = state.get(tier).and_then(|a| a.as_array()) {
                for (i, it) in arr.iter().enumerate() {
                    if let Some(text) = item_text(it) {
                        let id = it
                            .get("id")
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| format!("{tier}-{i}"));
                        out.push(CardItem { id, tier: tier.to_string(), text });
                    }
                }
            }
        }
        return out;
    }
    // Fallback: simpler {..:{items:[{tier,text}]}} shape.
    if let Some(obj) = ds.as_object() {
        for v in obj.values() {
            if let Some(items) = v.get("items").and_then(|i| i.as_array()) {
                for (i, it) in items.iter().enumerate() {
                    let tier = it.get("tier").and_then(|t| t.as_str());
                    if let (Some(tier), Some(text)) = (tier, item_text(it)) {
                        let id = it
                            .get("id")
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| format!("{tier}-{i}"));
                        out.push(CardItem { id, tier: tier.to_string(), text });
                    }
                }
                return out;
            }
        }
    }
    out
}

fn poll_once(agent: &ureq::Agent, base: &str) -> Option<CardState> {
    let sid = current_session(agent, base)?;
    let ds: serde_json::Value = agent
        .get(&format!("{base}/sessions/{sid}/display-state"))
        .call()
        .ok()?
        .into_json()
        .ok()?;
    Some(CardState { session_id: sid, items: extract_items(&ds), thinking: false })
}

#[cfg(target_os = "macos")]
fn make_hud(win: &tauri::WebviewWindow) {
    let panel = match win.to_panel() {
        Ok(p) => p,
        Err(_) => return,
    };
    panel.set_level(25); // NSStatusWindowLevel — sits over fullscreen content
    panel.set_style_mask(1 << 7); // NonactivatingPanel — never steals focus
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary,
    );
    panel.order_front_regardless();
}

// ---- Action: ask the companion — KAWA-native (assistant agent, context-aware) ----
#[tauri::command]
fn ask(text: String) -> Result<String, String> {
    let base =
        std::env::var("KAWA_HTTP").unwrap_or_else(|_| "http://localhost:3100/api/live".into());
    let agent = ureq::builder().timeout(Duration::from_secs(30)).build();
    let sid = current_session(&agent, &base).ok_or("no running session")?;

    let before = read_output(&agent, &base, &sid, "assistant").unwrap_or_default();
    agent
        .post(&format!("{base}/sessions/{sid}/inject"))
        .send_json(serde_json::json!({ "nodeId": "user-chat", "content": text }))
        .map_err(|e| e.to_string())?;

    // Poll the assistant agent's output for a new answer (agent latency varies).
    for _ in 0..25 {
        std::thread::sleep(Duration::from_secs(1));
        if let Some(ans) = read_output(&agent, &base, &sid, "assistant") {
            let a = ans.trim().to_string();
            if !a.is_empty() && a != before.trim() {
                return Ok(a);
            }
        }
    }
    Err("no answer yet — try again".into())
}

fn read_output(agent: &ureq::Agent, base: &str, sid: &str, node: &str) -> Option<String> {
    let v: serde_json::Value = agent
        .get(&format!("{base}/sessions/{sid}/outputs/{node}"))
        .call()
        .ok()?
        .into_json()
        .ok()?;
    v.get("content")?.as_str().map(|s| s.to_string())
}
