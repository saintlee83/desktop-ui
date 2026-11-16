/** What Code's terminal view can run in place of the chat UI. */
export interface CliInfo {
  id: string;
  name: string;
  provider: string;
  /** Typed into the login shell once it is ready. Empty: just the shell (or, for the session, no shell at all). */
  command: string;
  description: string;
}

/**
 * The open session itself, as a CLI: the same conversation the chat shows, carried on
 * from the terminal. The default, so switching views keeps you in the same session.
 */
export const SESSION_CLI = "session";

export const CLIS: CliInfo[] = [
  { id: SESSION_CLI, name: "Agent Desktop", provider: "This session", command: "", description: "This session as a CLI: same conversation, same agent" },
  { id: "claude", name: "Claude Code", provider: "Other CLIs, in their own sessions", command: "claude", description: "Anthropic's coding agent" },
  { id: "codex", name: "Codex", provider: "Other CLIs, in their own sessions", command: "codex", description: "OpenAI's coding agent" },
  { id: "gemini", name: "Gemini CLI", provider: "Other CLIs, in their own sessions", command: "gemini", description: "Google's coding agent" },
  { id: "amp", name: "Amp", provider: "Other CLIs, in their own sessions", command: "amp", description: "Sourcegraph's coding agent" },
  { id: "shell", name: "Shell", provider: "Plain", command: "", description: "Your login shell, nothing started" },
];

export const cliInfo = (id: string) => CLIS.find((c) => c.id === id) ?? CLIS[0];
