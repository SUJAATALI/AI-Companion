#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Companion Overlay — Tauri v2 shell. UI lives in ../src.
// On macOS we promote the window to a floating HUD panel (above other apps,
// on all Spaces, no Dock icon, doesn't activate as an app).

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
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
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationPolicy, NSWindow, NSWindowCollectionBehavior,
        NSWindowLevel,
    };
    use objc2_foundation::MainThreadMarker;

    let ptr = match win.ns_window() {
        Ok(p) if !p.is_null() => p,
        _ => return,
    };
    // SAFETY: ptr is a valid NSWindow* provided by tauri on the main thread.
    let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };

    unsafe {
        // Float above normal windows (25 ≈ NSStatusWindowLevel).
        let level: NSWindowLevel = 25;
        ns_window.setLevel(level);

        // Appear on every Space and layer over fullscreen apps.
        let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary;
        ns_window.setCollectionBehavior(behavior);

        // Show without forcing this process to become the active app.
        ns_window.orderFrontRegardless();
    }

    // Remove the Dock icon / Cmd+Tab entry — pure floating utility.
    if let Some(mtm) = MainThreadMarker::new() {
        let ns_app = NSApplication::sharedApplication(mtm);
        unsafe {
            ns_app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
        }
    }
}
