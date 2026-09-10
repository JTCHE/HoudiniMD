//! The app keeps running when its window closes.
//!
//! The localhost server is what answers F1 inside Houdini, so the window is a
//! view onto a process that must outlive it. Closing the window hides it; the
//! tray icon brings it back, and its menu is the one way to quit.
//! See spec: Closing HoudiniMD Should send to Notification Tray.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Window, WindowEvent};

/// Started by Houdini, not by the reader: serve F1, keep the window hidden.
pub const BACKGROUND: &str = "--background";

pub fn in_background() -> bool {
    std::env::args().any(|argument| argument == BACKGROUND)
}

pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// A second launch lands here instead of starting a second process. A launch
/// from Houdini only wants the server, which is already up.
pub fn second_launch(app: &AppHandle, argv: Vec<String>) {
    if !argv.iter().any(|argument| argument == BACKGROUND) {
        show(app);
    }
}

pub fn build(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open HoudiniMD", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit HoudiniMD", true, None::<&str>)?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("HoudiniMD")
        .menu(&Menu::with_items(app, &[&open, &quit])?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// The close button hides the window. The process, and F1 with it, stays.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
}
