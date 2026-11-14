//! A scripted stand-in for a real model provider, so the UI can be developed
//! and demoed without API keys. It shapes its reply by `Mode`:
//! - chat:  thinking + a markdown answer
//! - plan:  read-only exploration + a plan
//! - agent: explore, edit (permission-gated), run tests (permission-gated), summarize

use crate::protocol::*;

pub enum Step {
    Think(String),
    Say(String),
    Tool(ToolStep),
}

pub struct ToolStep {
    pub name: &'static str,
    pub kind: ToolKind,
    pub input: String,
    pub output: String,
    pub status: ToolStatus,
    pub diff: Option<FileDiff>,
    /// `Some(reason)` means the user must approve before this runs.
    pub permission: Option<String>,
    pub duration_ms: u64,
}

pub const DENIED_REPLY: &str = "\n\nUnderstood — I've stopped and left your files untouched. \
Tell me how you'd like to proceed, or switch to **Plan** mode if you'd rather review the approach first.";

pub fn models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "claude-opus-5-5",
            name: "Claude Opus 5.5",
            provider: "Anthropic",
            context_window: 200_000,
            description: "Most capable, for complex agentic work",
        },
        ModelInfo {
            id: "claude-sonnet-5-5",
            name: "Claude Sonnet 5.5",
            provider: "Anthropic",
            context_window: 200_000,
            description: "Fast and smart for everyday coding",
        },
        ModelInfo {
            id: "claude-haiku-5-5",
            name: "Claude Haiku 5.5",
            provider: "Anthropic",
            context_window: 200_000,
            description: "Fastest, for quick edits and questions",
        },
        ModelInfo {
            id: "gpt-5",
            name: "GPT-5",
            provider: "OpenAI",
            context_window: 400_000,
            description: "OpenAI flagship reasoning model",
        },
        ModelInfo {
            id: "gemini-2.5-pro",
            name: "Gemini 2.5 Pro",
            provider: "Google",
            context_window: 1_000_000,
            description: "Long context, multimodal",
        },
        ModelInfo {
            id: "local/qwen-coder",
            name: "Qwen Coder (local)",
            provider: "Ollama",
            context_window: 32_000,
            description: "Runs on this machine, offline",
        },
    ]
}

fn model_name(id: &str) -> &'static str {
    models()
        .into_iter()
        .find(|m| m.id == id)
        .map(|m| m.name)
        .unwrap_or("the selected model")
}

fn summarize(prompt: &str) -> String {
    let p = prompt.trim().replace('\n', " ");
    if p.chars().count() > 80 {
        format!("{}…", p.chars().take(80).collect::<String>())
    } else {
        p
    }
}

pub fn script(req: &RunRequest) -> Vec<Step> {
    match req.mode {
        Mode::Chat => chat(req),
        Mode::Plan => plan(req),
        Mode::Agent => agent(req),
    }
}

fn chat(req: &RunRequest) -> Vec<Step> {
    let topic = summarize(&req.prompt);
    vec![
        Step::Think(format!(
            "The user asked: \"{topic}\". This is a conversational request, so no tools are needed. \
             I'll give a structured answer and show off the renderer: a short list, a table, and a code sample."
        )),
        Step::Say(format!(
            "Here's a response from **{model}** (mock provider).\n\n\
You asked about: _{topic}_\n\n\
### Key points\n\n\
1. Responses stream token-by-token over a Tauri `Channel`.\n\
2. Markdown, tables, and fenced code are rendered with syntax highlighting.\n\
3. Switch to **Work** to see tool calls, diffs, and permission prompts.\n\n\
| Layer | Tech | Responsibility |\n\
|---|---|---|\n\
| Shell | Tauri 2 (Rust) | windowing, IPC, agent runtime |\n\
| UI | React + TypeScript | sessions, thread, composer |\n\
| State | Zustand | persisted sessions & settings |\n\n\
```rust\n\
#[tauri::command]\n\
pub async fn run_agent(request: RunRequest, on_event: Channel<AgentEvent>) -> Result<String, String> {{\n\
    // stream events to the UI as they are produced\n\
}}\n\
```\n\n\
Anything else you'd like to dig into?",
            model = model_name(&req.model),
        )),
    ]
}

fn plan(req: &RunRequest) -> Vec<Step> {
    let topic = summarize(&req.prompt);
    vec![
        Step::Think(format!(
            "Plan mode: I must not modify anything. Task: \"{topic}\". I'll explore the relevant code read-only, then propose concrete steps."
        )),
        Step::Say("I'll look around the codebase first (read-only).\n\n".into()),
        search_tool(),
        read_tool(),
        Step::Say(
            "Here's the plan I'd follow:\n\n\
### Plan\n\n\
1. **Fix `normalizeTitle`** in `src/lib/session.ts` — trim whitespace and collapse internal runs of spaces before truncating.\n\
2. **Guard empty titles** — fall back to `\"Untitled session\"` when the result is empty.\n\
3. **Add tests** in `src/lib/session.test.ts` covering leading/trailing whitespace, newlines, and emoji truncation.\n\
4. **Run** `pnpm test` and `pnpm typecheck`.\n\n\
> Nothing has been changed. Switch to **Agent** mode and say _\"go ahead\"_ to execute this plan."
                .into(),
        ),
    ]
}

fn agent(req: &RunRequest) -> Vec<Step> {
    let topic = summarize(&req.prompt);
    vec![
        Step::Think(format!(
            "The task is: \"{topic}\". Before editing anything I need to find where session titles are produced \
             and understand the current behaviour. A grep for the title helper is the quickest way in."
        )),
        Step::Say("I'll start by exploring the codebase to find the relevant code.\n\n".into()),
        search_tool(),
        read_tool(),
        Step::Think(
            "Found it: `normalizeTitle` slices the raw prompt without trimming, so a prompt that starts with a newline \
             produces a blank-looking title, and long whitespace runs waste the 48 character budget. \
             Fix: collapse whitespace, trim, then truncate on a code-point boundary, with an empty fallback."
                .into(),
        ),
        Step::Say(
            "Found the cause: `normalizeTitle` truncates the raw prompt without normalizing whitespace. Let me fix it.\n\n"
                .into(),
        ),
        Step::Tool(ToolStep {
            name: "Edit",
            kind: ToolKind::Edit,
            input: "src/lib/session.ts".into(),
            output: "Applied 1 edit to src/lib/session.ts".into(),
            status: ToolStatus::Ok,
            diff: Some(FileDiff {
                path: "src/lib/session.ts".into(),
                additions: 6,
                deletions: 2,
                patch: "@@ -12,8 +12,12 @@ export interface Session {\n \n const MAX_TITLE = 48;\n \n-export function normalizeTitle(prompt: string): string {\n-  return prompt.slice(0, MAX_TITLE);\n+export function normalizeTitle(prompt: string): string {\n+  const clean = prompt.replace(/\\s+/g, \" \").trim();\n+  if (!clean) return \"Untitled session\";\n+  const chars = Array.from(clean);\n+  if (chars.length <= MAX_TITLE) return clean;\n+  return chars.slice(0, MAX_TITLE - 1).join(\"\") + \"…\";\n }\n \n export function createSession(prompt: string): Session {\n".into(),
            }),
            permission: Some("Edit src/lib/session.ts (+6 −2)".into()),
            duration_ms: 500,
        }),
        Step::Say("Now let me run the tests to verify the fix.\n\n".into()),
        Step::Tool(ToolStep {
            name: "Bash",
            kind: ToolKind::Bash,
            input: "pnpm test --run src/lib/session.test.ts".into(),
            output: " RUN  v3.2.4 /Users/you/project\n\n ✓ src/lib/session.test.ts (6 tests) 4ms\n   ✓ normalizeTitle > trims surrounding whitespace\n   ✓ normalizeTitle > collapses internal whitespace\n   ✓ normalizeTitle > truncates on code-point boundary\n   ✓ normalizeTitle > falls back for empty prompts\n   ✓ createSession > uses normalized title\n   ✓ createSession > sets timestamps\n\n Test Files  1 passed (1)\n      Tests  6 passed (6)\n   Duration  312ms".into(),
            status: ToolStatus::Ok,
            diff: None,
            permission: Some("Run shell command".into()),
            duration_ms: 1400,
        }),
        Step::Say(format!(
            "All tests pass. Here's a summary of what I did:\n\n\
### Summary\n\n\
- **Root cause:** `normalizeTitle` sliced the raw prompt, so leading newlines and repeated spaces leaked into titles.\n\
- **Fix:** collapse whitespace → trim → truncate on a code-point boundary (safe for emoji), with an `\"Untitled session\"` fallback.\n\
- **Verified:** 6/6 tests passing in `src/lib/session.test.ts`.\n\n\
```ts\n\
normalizeTitle(\"\\n\\n  fix   the  bug \") // → \"fix the bug\"\n\
```\n\n\
_Ran with {model} via the mock provider — no files on disk were changed._",
            model = model_name(&req.model),
        )),
    ]
}

fn search_tool() -> Step {
    Step::Tool(ToolStep {
        name: "Grep",
        kind: ToolKind::Search,
        input: "\"normalizeTitle\" in src/".into(),
        output: "src/lib/session.ts:15:export function normalizeTitle(prompt: string): string {\nsrc/lib/session.ts:22:    title: normalizeTitle(prompt),\nsrc/components/Sidebar.tsx:41:  const label = normalizeTitle(session.firstPrompt);".into(),
        status: ToolStatus::Ok,
        diff: None,
        permission: None,
        duration_ms: 300,
    })
}

fn read_tool() -> Step {
    Step::Tool(ToolStep {
        name: "Read",
        kind: ToolKind::Read,
        input: "src/lib/session.ts".into(),
        output: "  1  import { nanoid } from \"nanoid\";\n  2\n  3  export interface Session {\n  4    id: string;\n  5    title: string;\n  6    createdAt: number;\n  7  }\n  …\n 13  const MAX_TITLE = 48;\n 14\n 15  export function normalizeTitle(prompt: string): string {\n 16    return prompt.slice(0, MAX_TITLE);\n 17  }\n 18\n 19  export function createSession(prompt: string): Session {\n 20    return {\n 21      id: nanoid(),\n 22      title: normalizeTitle(prompt),\n 23      createdAt: Date.now(),\n 24    };\n 25  }".into(),
        status: ToolStatus::Ok,
        diff: None,
        permission: None,
        duration_ms: 250,
    })
}
