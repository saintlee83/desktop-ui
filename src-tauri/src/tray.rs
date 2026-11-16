//! The menu bar (tray) icon: shows how many agents are working or waiting for approval,
//! and offers a way back to the app or straight into a new chat.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewWindow,
};

const TRAY: &str = "main";

/// The window to bring up: the main one, or any other still open.
fn some_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main").or_else(|| app.webview_windows().into_values().next())
}

fn show(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "show", "Show Agent Desktop", true, None::<&str>)?;
    let new_chat = MenuItem::with_id(app, "new-chat", "New Chat", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Agent Desktop", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(app, &[&open, &new_chat, &PredefinedMenuItem::separator(app)?, &quit])?;
    let mut tray = TrayIconBuilder::with_id(TRAY)
        .tooltip("Agent Desktop")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = some_window(app) {
                    show(&w);
                }
            }
            "new-chat" => {
                if let Some(w) = some_window(app) {
                    show(&w);
                    let _ = app.emit_to(w.label(), "tray-new-chat", ());
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// What the tray says about the agents: `running` sessions working, `waiting` for approval.
fn status_text(running: u32, waiting: u32) -> (String, Option<String>) {
    match (running, waiting) {
        (0, 0) => ("Agent Desktop".into(), None),
        (r, 0) => (format!("Agent Desktop: {r} running"), Some(format!("{r} running"))),
        (_, w) => (format!("Agent Desktop: {w} waiting for approval"), Some(format!("{w} to approve"))),
    }
}

#[tauri::command]
pub fn tray_status(app: AppHandle, running: u32, waiting: u32) {
    let Some(tray) = app.tray_by_id(TRAY) else { return };
    let (tooltip, title) = status_text(running, waiting);
    let _ = tray.set_tooltip(Some(tooltip));
    // Text beside the icon in the menu bar (macOS and Linux).
    let _ = tray.set_title(title);
}

#[cfg(test)]
mod tests {
    use super::status_text;

    #[test]
    fn waiting_for_approval_wins_over_running() {
        assert_eq!(status_text(0, 0).1, None);
        assert_eq!(status_text(2, 0).1.as_deref(), Some("2 running"));
        assert_eq!(status_text(2, 1).1.as_deref(), Some("1 to approve"));
    }
}
