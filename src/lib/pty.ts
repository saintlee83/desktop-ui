// Client for interactive terminal sessions (src-tauri/src/pty.rs).
// In a plain browser there is no shell, so a tiny mock keeps the UI usable.

import { Channel, invoke } from "@tauri-apps/api/core";
import { inTauri } from "./agent";

export type PtyEvent = { type: "data"; data: string } | { type: "exit"; code: number | null };
export interface Spawned {
  id: string;
  shell: string;
  cwd: string;
}

/** PTYs this window started and has not seen end, so they can all be shut down when it closes. */
const live = new Set<string>();

export async function spawn(size: { cols: number; rows: number }, onEvent: (e: PtyEvent) => void, cwd?: string): Promise<Spawned> {
  let id: string | undefined;
  const relay = (e: PtyEvent) => {
    if (e.type === "exit" && id) live.delete(id);
    onEvent(e);
  };
  let spawned: Spawned;
  if (inTauri) {
    const channel = new Channel<PtyEvent>();
    channel.onmessage = relay;
    spawned = await invoke<Spawned>("pty_spawn", { ...size, cwd: cwd ?? null, onEvent: channel });
  } else {
    spawned = await mockSpawn(relay);
  }
  id = spawned.id;
  live.add(id);
  return spawned;
}

export function write(id: string, data: string): Promise<void> {
  return inTauri ? invoke("pty_write", { id, data }) : mockWrite(id, data);
}

export function resize(id: string, cols: number, rows: number): Promise<void> {
  return inTauri ? invoke("pty_resize", { id, cols, rows }) : Promise.resolve();
}

export function kill(id: string): Promise<void> {
  live.delete(id);
  if (!inTauri) {
    mocks.delete(id);
    return Promise.resolve();
  }
  return invoke("pty_kill", { id });
}

/** Ends every shell this window started. */
export function killAll(): Promise<unknown> {
  return Promise.allSettled([...live].map(kill));
}

// ---------------- browser mock ----------------

const mocks = new Map<string, { emit: (e: PtyEvent) => void; line: string }>();
const AGENT_CLIS = ["claude", "codex", "gemini", "amp"];
const PROMPT = "\x1b[38;5;141m~\x1b[0m \x1b[2m$\x1b[0m ";

async function mockSpawn(emit: (e: PtyEvent) => void): Promise<Spawned> {
  const id = `mock_${Math.random().toString(36).slice(2, 9)}`;
  mocks.set(id, { emit, line: "" });
  setTimeout(() => {
    emit({
      type: "data",
      data:
        "\x1b[2mBrowser preview: this is a mock shell. Run `pnpm tauri dev` for a real terminal.\x1b[0m\r\n" +
        "\x1b[2mTry: help, echo, date, clear, exit\x1b[0m\r\n\r\n" +
        PROMPT,
    });
  }, 30);
  return { id, shell: "mock", cwd: "~" };
}

async function mockWrite(id: string, data: string) {
  const s = mocks.get(id);
  if (!s) return;
  for (const ch of data) {
    if (ch === "\r") {
      const cmd = s.line.trim();
      s.line = "";
      const [name, ...args] = cmd.split(/\s+/);
      let out = "";
      if (name === "exit") {
        s.emit({ type: "data", data: "\r\n" });
        s.emit({ type: "exit", code: 0 });
        mocks.delete(id);
        return;
      } else if (name === "clear") {
        s.emit({ type: "data", data: "\x1b[2J\x1b[H" + PROMPT });
        continue;
      } else if (name === "help") out = "help, echo <text>, date, clear, exit";
      else if (name === "echo") out = args.join(" ");
      else if (name === "date") out = new Date().toString();
      else if (AGENT_CLIS.includes(name)) out = `${name}: not available in the browser preview. Run \`pnpm tauri dev\` to start it in a real shell.`;
      else if (name) out = `mock: command not found: ${name}`;
      s.emit({ type: "data", data: "\r\n" + (out ? out + "\r\n" : "") + PROMPT });
    } else if (ch === "\x7f") {
      if (s.line) {
        s.line = s.line.slice(0, -1);
        s.emit({ type: "data", data: "\b \b" });
      }
    } else if (ch === "\x03") {
      s.line = "";
      s.emit({ type: "data", data: "^C\r\n" + PROMPT });
    } else if (ch >= " ") {
      s.line += ch;
      s.emit({ type: "data", data: ch });
    }
  }
}
