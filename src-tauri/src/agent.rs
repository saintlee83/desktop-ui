//! Agent run orchestration: starting, streaming, cancelling, and permission gating.
//!
//! The actual "model" is `crate::mock`, which yields a scripted list of steps.
//! To plug in a real provider, replace `mock::script` with something that turns
//! provider stream chunks into `AgentEvent`s; everything else here stays the same.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::{ipc::Channel, State};
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::{
    mock::{self, Step, ToolStep},
    protocol::*,
};

#[derive(Default)]
struct Inner {
    runs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    permissions: Mutex<HashMap<String, oneshot::Sender<bool>>>,
}

#[derive(Default, Clone)]
pub struct AgentState {
    inner: Arc<Inner>,
}

#[tauri::command]
pub fn list_models() -> Vec<ModelInfo> {
    mock::models()
}

#[tauri::command]
pub async fn run_agent(
    state: State<'_, AgentState>,
    request: RunRequest,
    on_event: Channel<AgentEvent>,
) -> Result<String, String> {
    let run_id = format!("run_{}", Uuid::new_v4().simple());
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .inner
        .runs
        .lock()
        .await
        .insert(run_id.clone(), cancel.clone());

    let inner = state.inner.clone();
    let id = run_id.clone();
    tauri::async_runtime::spawn(async move {
        let run = Run::new(on_event, cancel, inner.clone());
        run.execute(request).await;
        inner.runs.lock().await.remove(&id);
    });

    Ok(run_id)
}

#[tauri::command]
pub async fn cancel_agent(state: State<'_, AgentState>, run_id: String) -> Result<(), String> {
    if let Some(flag) = state.inner.runs.lock().await.get(&run_id) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub async fn respond_permission(
    state: State<'_, AgentState>,
    id: String,
    allow: bool,
) -> Result<(), String> {
    match state.inner.permissions.lock().await.remove(&id) {
        Some(tx) => {
            let _ = tx.send(allow);
            Ok(())
        }
        None => Err(format!("permission request {id} is unknown or expired")),
    }
}

/// Why a run stopped early.
enum Halt {
    Cancelled,
    Failed(String),
}

struct Run {
    channel: Channel<AgentEvent>,
    cancel: Arc<AtomicBool>,
    inner: Arc<Inner>,
    rng: u64,
    output_chars: usize,
}

impl Run {
    fn new(channel: Channel<AgentEvent>, cancel: Arc<AtomicBool>, inner: Arc<Inner>) -> Self {
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15);
        Self {
            channel,
            cancel,
            inner,
            rng: seed | 1,
            output_chars: 0,
        }
    }

    async fn execute(mut self, req: RunRequest) {
        let result = self.play(&req).await;
        let input_chars: usize =
            req.prompt.len() + req.history.iter().map(|m| m.content.len()).sum::<usize>();
        let usage = Usage {
            input_tokens: (input_chars / 4) as u32 + 1_850, // + system prompt / tool schemas
            output_tokens: (self.output_chars / 4) as u32,
        };
        let last = match result {
            Ok(()) => AgentEvent::Done {
                usage,
                stop_reason: StopReason::EndTurn,
            },
            Err(Halt::Cancelled) => AgentEvent::Done {
                usage,
                stop_reason: StopReason::Cancelled,
            },
            Err(Halt::Failed(message)) => AgentEvent::Error { message },
        };
        let _ = self.channel.send(last);
    }

    async fn play(&mut self, req: &RunRequest) -> Result<(), Halt> {
        self.pause(350).await?; // time-to-first-token
        for step in mock::script(req) {
            match step {
                Step::Think(text) => self.stream(&text, true).await?,
                Step::Say(text) => self.stream(&text, false).await?,
                Step::Tool(tool) => {
                    if !self.tool(tool).await? {
                        self.stream(mock::DENIED_REPLY, false).await?;
                        return Ok(());
                    }
                }
            }
            self.pause(140).await?;
        }
        Ok(())
    }

    /// Runs one tool call. Returns `Ok(false)` when the user denied permission.
    async fn tool(&mut self, tool: ToolStep) -> Result<bool, Halt> {
        let id = format!("tool_{}", Uuid::new_v4().simple());
        self.emit(AgentEvent::ToolStart {
            id: id.clone(),
            name: tool.name.into(),
            kind: tool.kind,
            input: tool.input.clone(),
        })?;
        self.pause(220).await?;

        if let Some(reason) = tool.permission {
            let pid = format!("perm_{}", Uuid::new_v4().simple());
            let (tx, rx) = oneshot::channel();
            self.inner.permissions.lock().await.insert(pid.clone(), tx);
            self.emit(AgentEvent::PermissionRequest {
                id: pid.clone(),
                tool_id: id.clone(),
                reason,
            })?;
            if !self.wait_permission(&pid, rx).await? {
                self.emit(AgentEvent::ToolEnd {
                    id,
                    status: ToolStatus::Denied,
                    output: "Permission denied by user.".into(),
                    diff: None,
                })?;
                return Ok(false);
            }
        }

        let jitter = self.next() % 400;
        self.pause(tool.duration_ms + jitter).await?;
        self.output_chars += tool.output.len() / 3;
        self.emit(AgentEvent::ToolEnd {
            id,
            status: tool.status,
            output: tool.output,
            diff: tool.diff,
        })?;
        Ok(true)
    }

    async fn wait_permission(
        &self,
        pid: &str,
        mut rx: oneshot::Receiver<bool>,
    ) -> Result<bool, Halt> {
        loop {
            tokio::select! {
                answer = &mut rx => return Ok(answer.unwrap_or(false)),
                _ = tokio::time::sleep(Duration::from_millis(100)) => {
                    if self.cancelled() {
                        self.inner.permissions.lock().await.remove(pid);
                        return Err(Halt::Cancelled);
                    }
                }
            }
        }
    }

    /// Streams text in small word groups, like a token stream.
    async fn stream(&mut self, text: &str, thinking: bool) -> Result<(), Halt> {
        let words: Vec<&str> = text.split_inclusive(' ').collect();
        let mut i = 0;
        while i < words.len() {
            let n = 1 + (self.next() % 3) as usize;
            let chunk: String = words[i..(i + n).min(words.len())].concat();
            i += n;
            self.output_chars += chunk.len();
            self.emit(if thinking {
                AgentEvent::Thinking { delta: chunk }
            } else {
                AgentEvent::Text { delta: chunk }
            })?;
            let delay = if thinking { 14 } else { 22 } + self.next() % 26;
            self.pause(delay).await?;
        }
        Ok(())
    }

    fn emit(&self, event: AgentEvent) -> Result<(), Halt> {
        if self.cancelled() {
            return Err(Halt::Cancelled);
        }
        self.channel
            .send(event)
            .map_err(|e| Halt::Failed(format!("event channel closed: {e}")))
    }

    async fn pause(&self, ms: u64) -> Result<(), Halt> {
        let mut left = ms;
        while left > 0 {
            if self.cancelled() {
                return Err(Halt::Cancelled);
            }
            let step = left.min(50);
            tokio::time::sleep(Duration::from_millis(step)).await;
            left -= step;
        }
        if self.cancelled() {
            Err(Halt::Cancelled)
        } else {
            Ok(())
        }
    }

    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// xorshift64 — good enough for timing jitter, avoids a `rand` dependency.
    fn next(&mut self) -> u64 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.rng = x;
        x
    }
}
