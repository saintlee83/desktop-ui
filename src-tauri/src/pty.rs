//! Interactive terminal sessions: the user's login shell in a pseudo-terminal,
//! streamed to an xterm.js view over a `tauri::ipc::Channel`.

use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::Mutex,
    thread,
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    Data { data: String },
    Exit { code: Option<u32> },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spawned {
    id: String,
    shell: String,
    cwd: String,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<String, Session>>,
}

fn home_dir() -> Option<String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
}

fn shell_name() -> String {
    if cfg!(windows) {
        return "cmd".into();
    }
    std::env::var("SHELL")
        .ok()
        .and_then(|s| s.rsplit('/').next().map(str::to_owned))
        .unwrap_or_else(|| "sh".into())
}

/// Decodes as much UTF-8 as possible, keeping an incomplete trailing sequence
/// (split across reads) in `pending` for the next chunk.
fn take_utf8(pending: &mut Vec<u8>) -> String {
    match std::str::from_utf8(pending) {
        Ok(s) => {
            let out = s.to_owned();
            pending.clear();
            out
        }
        Err(e) if e.error_len().is_none() => {
            let valid = e.valid_up_to();
            let out = String::from_utf8_lossy(&pending[..valid]).into_owned();
            pending.drain(..valid);
            out
        }
        Err(_) => {
            let out = String::from_utf8_lossy(pending).into_owned();
            pending.clear();
            out
        }
    }
}

fn lock(state: &PtyState) -> std::sync::MutexGuard<'_, HashMap<String, Session>> {
    state.sessions.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    on_event: Channel<PtyEvent>,
) -> Result<Spawned, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("openpty failed: {e}"))?;

    // The user's default shell, launched as a login shell so PATH etc. match their terminal.
    let mut cmd = CommandBuilder::new_default_prog();
    let cwd = cwd
        .filter(|c| !c.is_empty())
        .or_else(home_dir)
        .unwrap_or_else(|| ".".into());
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "AgentDesktop");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("failed to start shell: {e}"))?;
    drop(pair.slave); // so reads hit EOF once the shell exits

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = format!("pty_{}", Uuid::new_v4().simple());
    lock(&state).insert(
        id.clone(),
        Session { master: pair.master, writer, child },
    );

    let session_id = id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        let mut pending = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let data = take_utf8(&mut pending);
                    if !data.is_empty() && on_event.send(PtyEvent::Data { data }).is_err() {
                        break; // view is gone
                    }
                }
            }
        }
        let session = lock(&app.state::<PtyState>()).remove(&session_id);
        let code = session
            .and_then(|mut s| s.child.wait().ok())
            .map(|status| status.exit_code());
        let _ = on_event.send(PtyEvent::Exit { code });
    });

    Ok(Spawned { id, shell: shell_name(), cwd })
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = lock(&state);
    let session = sessions.get_mut(&id).ok_or("terminal session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<'_, PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = lock(&state);
    let session = sessions.get(&id).ok_or("terminal session not found")?;
    session
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    if let Some(mut session) = lock(&state).remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::take_utf8;

    #[test]
    fn keeps_split_multibyte_sequences_for_the_next_read() {
        let bytes = "héllo ✓".as_bytes();
        let (a, b) = bytes.split_at(bytes.len() - 1); // split inside "✓"
        let mut pending = a.to_vec();
        assert_eq!(take_utf8(&mut pending), "héllo ");
        assert_eq!(pending.len(), 2);
        pending.extend_from_slice(b);
        assert_eq!(take_utf8(&mut pending), "✓");
        assert!(pending.is_empty());
    }

    /// Spawns the real login shell; environment-dependent, so run explicitly:
    /// `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn login_shell_runs_commands_and_reaches_eof_on_exit() {
        use portable_pty::{native_pty_system, CommandBuilder, PtySize};
        use std::io::{Read, Write};

        let pair = native_pty_system()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let mut child = pair.slave.spawn_command(CommandBuilder::new_default_prog()).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        writer.write_all(b"echo result=$((6*7))\rexit\r").unwrap();
        let mut out = Vec::new();
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 { break; }
            out.extend_from_slice(&buf[..n]);
        }
        let text = String::from_utf8_lossy(&out);
        assert!(text.contains("result=42"), "output was: {text}");
        assert!(child.wait().unwrap().success());
    }
}
