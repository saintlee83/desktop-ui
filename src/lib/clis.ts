/** A command-line coding agent that Code's terminal mode can run in place of the chat UI. */
export interface CliInfo {
  id: string;
  name: string;
  provider: string;
  /** Typed into the login shell once it is ready. Empty: just the shell. */
  command: string;
  description: string;
}

export const CLIS: CliInfo[] = [
  { id: "claude", name: "Claude Code", provider: "Agents", command: "claude", description: "Anthropic's coding agent" },
  { id: "codex", name: "Codex", provider: "Agents", command: "codex", description: "OpenAI's coding agent" },
  { id: "gemini", name: "Gemini CLI", provider: "Agents", command: "gemini", description: "Google's coding agent" },
  { id: "amp", name: "Amp", provider: "Agents", command: "amp", description: "Sourcegraph's coding agent" },
  { id: "shell", name: "Shell", provider: "Plain", command: "", description: "Your login shell, nothing started" },
];

export const cliInfo = (id: string) => CLIS.find((c) => c.id === id) ?? CLIS[0];
