// Wire types mirrored from `src-tauri/src/protocol.rs`. Keep in sync.

export type ToolKind = "read" | "edit" | "bash" | "search" | "web";
export type Mode = "chat" | "agent" | "plan";
/**
 * Top-level app section. Chat is the default: a plain conversation that turns
 * into agent work once it is given a folder. Code is for coding in a repository.
 */
export type Section = "chat" | "code";

export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type AgentEvent =
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "toolStart"; id: string; name: string; kind: ToolKind; input: string }
  | { type: "permissionRequest"; id: string; toolId: string; reason: string }
  | {
      type: "toolEnd";
      id: string;
      status: "ok" | "error" | "denied";
      output: string;
      diff: FileDiff | null;
    }
  | { type: "done"; usage: Usage; stopReason: "endTurn" | "cancelled" }
  | { type: "error"; message: string };

export interface RunRequest {
  sessionId: string;
  prompt: string;
  model: string;
  mode: Mode;
  history: { role: "user" | "assistant"; content: string }[];
  /** The folder the agent works in, when the session has one. */
  folder: string | null;
  /** Standing instructions of the session's project. */
  instructions: string | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  description: string;
}

// ---- UI-side models ----

export type ToolStatus = "running" | "awaiting" | "ok" | "error" | "denied";

export type Part =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string; startedAt: number; endedAt?: number }
  | {
      type: "tool";
      id: string;
      name: string;
      kind: ToolKind;
      input: string;
      status: ToolStatus;
      output?: string;
      diff?: FileDiff;
      permissionId?: string;
      reason?: string;
    };

export type ToolPart = Extract<Part, { type: "tool" }>;

export interface Message {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
  createdAt: number;
  status?: "streaming" | "done" | "error" | "cancelled";
  model?: string;
  mode?: Mode;
  usage?: Usage;
  error?: string;
  attachments?: string[];
}

export interface Session {
  id: string;
  section: Section;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  /** The folder the agent works in. A chat with one is agent work: it has tools, modes and the terminal. */
  folder?: string | null;
  /** The project it is filed under, if any. */
  projectId?: string | null;
}

/** A named place for related sessions, optionally tied to a folder and to standing instructions. */
export interface Project {
  id: string;
  name: string;
  /** New sessions in the project start in this folder. */
  folder: string | null;
  /** Sent along with every run in the project. */
  instructions: string;
  createdAt: number;
}
