// Wire types mirrored from `src-tauri/src/protocol.rs`. Keep in sync.

export type ToolKind = "read" | "edit" | "bash" | "search" | "web";
export type Mode = "chat" | "agent" | "plan";
/** Top-level app section: plain conversations, agentic work in a workspace, or coding in a repository. */
export type Section = "chat" | "work" | "code";
/** Sections where the agent has tools: they get Agent/Plan modes, the terminal and the side panel. */
export type AgentSection = Exclude<Section, "chat">;
export const isAgentSection = (section: Section): section is AgentSection => section !== "chat";

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
}
