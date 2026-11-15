//! Wire types shared with the frontend (`src/lib/types.ts`).
//! Keep the two files in sync when changing anything here.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolKind {
    Read,
    Edit,
    Bash,
    Search,
    Web,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolStatus {
    Ok,
    #[allow(dead_code)] // produced by real providers
    Error,
    Denied,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StopReason {
    EndTurn,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    /// Unified diff body (hunks only).
    pub patch: String,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

/// Events streamed to the UI over a `tauri::ipc::Channel` during one agent run.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AgentEvent {
    Thinking {
        delta: String,
    },
    Text {
        delta: String,
    },
    ToolStart {
        id: String,
        name: String,
        kind: ToolKind,
        input: String,
    },
    PermissionRequest {
        id: String,
        tool_id: String,
        reason: String,
    },
    ToolEnd {
        id: String,
        status: ToolStatus,
        output: String,
        diff: Option<FileDiff>,
    },
    Done {
        usage: Usage,
        stop_reason: StopReason,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Chat,
    Agent,
    Plan,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMessage {
    #[allow(dead_code)]
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    #[allow(dead_code)]
    pub session_id: String,
    pub prompt: String,
    pub model: String,
    pub mode: Mode,
    #[serde(default)]
    pub history: Vec<HistoryMessage>,
    /// The folder the agent works in, when the session has one.
    #[serde(default)]
    #[allow(dead_code)]
    pub folder: Option<String>,
    /// Standing instructions of the session's project, meant for the system prompt.
    #[serde(default)]
    #[allow(dead_code)]
    pub instructions: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub provider: &'static str,
    pub context_window: u32,
    pub description: &'static str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Guards the wire format expected by `src/lib/types.ts`.
    #[test]
    fn events_serialize_as_camel_case_tagged_unions() {
        let ev = AgentEvent::PermissionRequest {
            id: "p".into(),
            tool_id: "t".into(),
            reason: "r".into(),
        };
        assert_eq!(
            serde_json::to_value(ev).unwrap(),
            json!({ "type": "permissionRequest", "id": "p", "toolId": "t", "reason": "r" })
        );

        let ev = AgentEvent::Done {
            usage: Usage { input_tokens: 1, output_tokens: 2 },
            stop_reason: StopReason::EndTurn,
        };
        assert_eq!(
            serde_json::to_value(ev).unwrap(),
            json!({ "type": "done", "usage": { "inputTokens": 1, "outputTokens": 2 }, "stopReason": "endTurn" })
        );

        let ev = AgentEvent::ToolEnd {
            id: "t".into(),
            status: ToolStatus::Ok,
            output: "o".into(),
            diff: None,
        };
        assert_eq!(
            serde_json::to_value(ev).unwrap(),
            json!({ "type": "toolEnd", "id": "t", "status": "ok", "output": "o", "diff": null })
        );
    }

    #[test]
    fn run_request_deserializes_from_frontend_shape() {
        let req: RunRequest = serde_json::from_value(json!({
            "sessionId": "s", "prompt": "hi", "model": "m", "mode": "plan",
            "history": [{ "role": "user", "content": "x" }]
        }))
        .unwrap();
        assert_eq!(req.mode, Mode::Plan);
        assert_eq!(req.history.len(), 1);
        assert_eq!((req.folder, req.instructions), (None, None));

        let req: RunRequest = serde_json::from_value(json!({
            "sessionId": "s", "prompt": "hi", "model": "m", "mode": "agent", "history": [],
            "folder": "/work/site", "instructions": null
        }))
        .unwrap();
        assert_eq!(req.folder.as_deref(), Some("/work/site"));
        assert_eq!(req.instructions, None);
    }
}
