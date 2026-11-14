mod agent;
mod mock;
mod protocol;
mod pty;

/// Opens another app window: the main window's configuration under a fresh
/// label, the size of the window that asked and offset from it so the two
/// don't sit exactly on top of each other.
#[tauri::command]
async fn new_window(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or("no window is configured")?;
    // Labels matching `window-*` get the same permissions as `main` (capabilities/default.json).
    config.label = format!("window-{}", uuid::Uuid::new_v4().simple());
    if let (Ok(position), Ok(size), Ok(scale)) = (
        window.outer_position(),
        window.inner_size(),
        window.scale_factor(),
    ) {
        let position = position.to_logical::<f64>(scale);
        let size = size.to_logical::<f64>(scale);
        config.center = false;
        config.x = Some(position.x + 28.0);
        config.y = Some(position.y + 28.0);
        config.width = size.width;
        config.height = size.height;
    }
    tauri::WebviewWindowBuilder::from_config(&app, &config)
        .and_then(|builder| builder.build())
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(agent::AgentState::default())
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            new_window,
            agent::list_models,
            agent::run_agent,
            agent::cancel_agent,
            agent::respond_permission,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
