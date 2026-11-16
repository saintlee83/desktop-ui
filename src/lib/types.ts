// Wire types mirrored from `src-tauri/src/protocol.rs`. Keep in sync.

export type ToolKind = "read" | "edit" | "bash" | "search" | "web";
export type Mode = "chat" | "agent" | "plan";
/** Modes the agent works in once it has tools (a plain chat always runs in "chat" mode). */
export type WorkMode = Exclude<Mode, "chat">;
/** When the agent must ask before acting: always, not for edits, or never. */
export type PermissionMode = "ask" | "acceptEdits" | "bypass";
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
  /** Output of a running tool so far, in pieces; `toolEnd` still carries all of it. */
  | { type: "toolOutput"; id: string; delta: string }
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
  /** Files sent along with the prompt: a path on disk, or the content itself (text, or a data URL for an image). */
  attachments?: AttachmentIn[];
}

export interface AttachmentIn {
  name: string;
  path?: string;
  content?: string;
  mime?: string;
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
      /** Its change was undone from the Changes panel. */
      reverted?: boolean;
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
  /** Names of attached files, as messages from before `files` kept them. */
  attachments?: string[];
  files?: Attachment[];
}

/** A file attached to a message, as kept with it: what it was, not its content. */
export interface Attachment {
  name: string;
  /** Where it is on disk, when it came from there. */
  path?: string;
  size?: number;
  mime?: string;
  /** A small preview of an image, as a data URL. */
  thumb?: string;
}

/** A file about to be sent: what is kept, plus the content for files that have no path. */
export interface PendingFile extends Attachment {
  content?: string;
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
  /** Model and mode it runs with; missing: whatever the window has chosen (sessions from before they were per session). */
  model?: string;
  mode?: WorkMode;
  /** Kept at the top of the list. */
  pinned?: boolean;
  /** Out of the list, under "Archived". */
  archived?: boolean;
  /** Finished while nobody was looking at it. */
  unread?: boolean;
  /** Tool calls approved for the rest of the session with "Always allow": a tool kind, or "bash:<command>". */
  allow?: string[];
}

/** Text saved for reuse, inserted with /name in the composer. */
export interface Snippet {
  id: string;
  name: string;
  text: string;
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
  /** Overrides the permission setting for the project's sessions; missing or null: the setting applies. */
  permissionMode?: PermissionMode | null;
}
