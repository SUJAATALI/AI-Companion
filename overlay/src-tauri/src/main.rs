#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Companion Overlay — Tauri v2 shell. UI lives in ../src.
// On macOS we convert the window into a non-activating NSPanel so it can float
// over EVERYTHING, including another app's full-screen Space (a plain NSWindow
// cannot — macOS only honors `fullScreenAuxiliary` for a non-activating panel).

use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, WebviewWindowExt};

fn main() {
    let builder = tauri::Builder::default();

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .setup(|app| {
            // Accessory policy: no Dock icon / Cmd+Tab entry, AND required for a
            // window to display over another app's full-screen space.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(win) = app.get_webview_window("overlay") {
                let _ = win.show();
                #[cfg(target_os = "macos")]
                make_hud(&win);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Companion overlay");
}

#[cfg(target_os = "macos")]
fn make_hud(win: &tauri::WebviewWindow) {
    // Reclass the Tauri NSWindow into an NSPanel. Everything below only works
    // because it's now a panel, not a plain window.
    let panel = match win.to_panel() {
        Ok(p) => p,
        Err(_) => return,
    };

    // NSStatusWindowLevel (25) — sits over another app's fullscreen Space. The
    // crate's own example uses NSFloatWindowLevel (4); status is one notch higher
    // and the guide's recommended level for reliably clearing fullscreen content.
    panel.set_level(25);

    // NonactivatingPanel (1 << 7): clicking the overlay never steals "active app"
    // focus from the fullscreen app underneath, so it won't force an exit-fullscreen.
    const NS_NONACTIVATING_PANEL: i32 = 1 << 7;
    panel.set_style_mask(NS_NONACTIVATING_PANEL);

    // The magic combo — honored now that it's a panel:
    //   FullScreenAuxiliary → render inside another app's fullscreen Space
    //   CanJoinAllSpaces    → show on whatever Space is active
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary,
    );

    // NOTE: a non-activating panel ignores `data-tauri-drag-region` AND
    // `moveableByWindowBackground` (the webview captures the mouse). Dragging is
    // instead driven from JS via Tauri's startDragging() — see overlay/src/app.js.

    // Show without activating.
    panel.order_front_regardless();
}
