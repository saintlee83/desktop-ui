import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import * as agent from "./agent";
import { SESSION_CLI } from "./clis";
import { t } from "./i18n";
import { notify, setSecret } from "./native";
import * as pty from "./pty";
import type { SchemeId } from "./theme";
import { toast } from "./toast";
import { withViewTransition } from "./util";
import { isPrimaryWindow } from "./windows";
import type { AgentEvent, Message, Mode, ModelInfo, Part, PendingFile, PermissionMode, Project, Section, Session, Snippet, ToolPart, WorkMode } from "./types";

export type { PermissionMode, WorkMode } from "./types";
/**
 * What a session is, which decides what it can do. A chat is a plain conversation;
 * give it a folder and it becomes work: the agent gets tools, modes, the terminal
 * and the side panel. Sessions in the Code section are always agentic.
 */
export type Kind = "chat" | "work" | "code";

export type Theme = "system" | "light" | "dark";
export type PanelTab = "changes" | "terminal" | "context";
/** What the Code section's main area shows: the chat UI, or a full-window terminal running a CLI agent. */
export type CodeView = "gui" | "terminal";
/** One interactive terminal tab. The PTY itself lives in the Rust backend and dies with the app. */
export interface TerminalTab {
  id: string;
  shell?: string;
  /** The folder it was opened in (the session's, at the time). */
  cwd?: string | null;
  /** The session it belongs to (null: opened on the new-session screen). The drawer shows the open session's. */
  sessionId?: string | null;
  /** A name the user gave the tab. */
  title?: string;
}

export type SettingsTab = "account" | "general" | "providers" | "permissions" | "snippets" | "data" | "shortcuts";
export type SendKey = "enter" | "modEnter";
export type Language = "system" | "en" | "ko";

/** Local profile. There is no auth backend yet; wire a real identity provider here. */
export interface Account {
  name: string;
  email: string;
  plan: string;
}
export const DEMO_ACCOUNT: Account = { name: "Demo User", email: "demo@example.com", plan: "Pro" };

// Settings saved before a field existed lack it, so every optional one has a default where it is read.
export interface Settings {
  theme: Theme;
  permissionMode: PermissionMode;
  /** UI zoom factor (1 = 100%). */
  zoom?: number;
  /** Which set of neutrals the theme is drawn from (see lib/theme.ts). Missing means the default. */
  scheme?: SchemeId;
  /** Providers whose API key is in the OS keychain. The keys themselves never come back to the webview. */
  keysSet?: string[];
  /** Keys saved by versions before the keychain; moved there on the next start (see `moveLegacyKeys`). */
  legacyKeys?: Record<string, string>;
  /** Where local models are served. Not a secret, so it stays here. */
  endpoints?: { ollama?: string };
  /** A system notification when a run ends or needs approval while the app is in the background. Default on. */
  notifications?: boolean;
  /** "enter": Enter sends and Shift+Enter starts a new line. "modEnter": ⌘Enter sends and Enter starts a new line. */
  sendKey?: SendKey;
  /** The app the Changes panel opens files in; missing or null: the system's default app. */
  editor?: string | null;
  /** Terminal text size, px. */
  terminalFontSize?: number;
  /** Size of code in replies and diffs, px. */
  codeFontSize?: number;
  /** Brings the app up from anywhere: an accelerator such as "Alt+Space", or none. */
  globalShortcut?: string | null;
  /** Interface language. */
  language?: Language;
}

/** What the project dialog collects. */
export type ProjectInput = Pick<Project, "name" | "folder" | "instructions" | "permissionMode">;

export const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** Column widths in px: [min, default, max]. The panel is also capped by the window (see App). */
export const SIDEBAR_W = [208, 264, 420] as const;
export const PANEL_W = [300, 400, 760] as const;

interface State {
  sessions: Session[];
  activeId: string | null;
  section: Section;
  /** Last open session per section, restored when switching back. */
  lastActive: Partial<Record<Section, string | null>>;
  projects: Project[];
  /** The project this window is looking at: the sidebar lists its sessions and new ones are filed in it. */
  projectId: string | null;
  /**
   * Folder picked on the new-session screen, for the session about to start.
   * `undefined` means not chosen: the project's folder (or, in Code, the last one used) applies.
   */
  draftFolder: string | null | undefined;
  /** Folders used lately, newest first, offered again by the folder picker. */
  recentFolders: string[];
  /** The folder Code used last: where its next session and its terminal view start. */
  codeFolder: string | null;
  /** The project dialog: "new", the id of the project being edited, or closed. */
  projectDialog: string | null;
  /** A session to file under the project the dialog creates. */
  projectAdopt: string | null;
  codeView: CodeView;
  /** Which CLI the terminal view runs (an id from `CLIS`). */
  cli: string;
  models: ModelInfo[];
  /** The model and mode new sessions start with (each session then keeps its own). */
  model: string;
  mode: WorkMode;
  settings: Settings;
  snippets: Snippet[];
  /** A message waiting for its session's run to end, per session. This window's only. */
  queued: Record<string, { text: string; files?: PendingFile[] }>;
  account: Account | null;
  settingsTab: SettingsTab;
  /** sessionId → runId ("pending" until the backend returns an id) */
  runs: Record<string, string>;
  sidebarOpen: boolean;
  sidebarWidth: number;
  panelOpen: boolean;
  panelWidth: number;
  panelTab: PanelTab;
  paletteOpen: boolean;
  settingsOpen: boolean;
  terminalOpen: boolean;
  terminalHeight: number;
  terminals: TerminalTab[];
  activeTerminal: string | null;

  loadModels(): Promise<void>;
  newSession(): void;
  selectSession(id: string): void;
  setSection(section: Section): void;
  /** From a plain chat, which has no tools, moves to Code; a no-op where the agent already has them. */
  enterAgent(): void;
  /** Gives the open session (or the one about to start) a folder to work in, or takes it away. */
  setFolder(folder: string | null): void;
  rememberFolder(folder: string): void;
  setCodeFolder(folder: string | null): void;
  /** Narrows the window to one project, or back to everything with `null`. */
  setProject(id: string | null): void;
  openProjectDialog(target?: string, adoptSession?: string): void;
  closeProjectDialog(): void;
  /** Creates a project and opens it, or files `adoptSession` under it instead. */
  createProject(input: ProjectInput, adoptSession?: string | null): string;
  updateProject(id: string, patch: Partial<ProjectInput>): void;
  /** Removes a project. Its sessions are kept, unfiled. */
  deleteProject(id: string): void;
  /** Puts a deleted project back, with the sessions it had (undo). */
  restoreProject(project: Project, sessionIds: string[]): void;
  moveSession(id: string, projectId: string | null): void;
  /** Switches Code between the chat UI and the terminal; "terminal" also brings you to Code. */
  setCodeView(view: CodeView): void;
  setCli(id: string): void;
  deleteSession(id: string): void;
  /** Puts a deleted session back (undo). */
  restoreSession(session: Session): void;
  renameSession(id: string, title: string): void;
  /** Sends to the open session (starting one from the new-session screen); queued while it runs. */
  send(prompt: string, files?: PendingFile[]): Promise<void>;
  /** Drops the message waiting for a session's run to end. */
  unqueue(sessionId: string): void;
  stop(sessionId?: string): void;
  /** Runs the last prompt again, with another model if one is given. */
  retry(model?: string): void;
  /** Replaces one of the open session's prompts and runs from there; what came after it goes. */
  editMessage(messageId: string, text: string): void;
  /** Copies the open session up to and including a message into a new session, and opens it. */
  forkSession(messageId: string): void;
  answerPermission(toolPart: ToolPart, allow: boolean): void;
  /** Allows this call, and calls like it for the rest of the session. */
  allowAlways(toolPart: ToolPart): void;
  /** The model for the open session, or for new sessions on the new-session screen. */
  setModel(id: string): void;
  setMode(mode: WorkMode): void;
  setPinned(id: string, pinned: boolean): void;
  setArchived(id: string, archived: boolean): void;
  /** Deletes several sessions at once (undo with `restoreSessions`). */
  deleteSessions(ids: string[]): void;
  restoreSessions(sessions: Session[]): void;
  /** Marks tool calls' changes as undone (or redone) after the Changes panel reverted them. */
  markReverted(sessionId: string, toolIds: string[], reverted: boolean): void;
  saveSnippet(snippet: Snippet): void;
  deleteSnippet(id: string): void;
  /** Adds sessions, projects and snippets from a backup; returns how many sessions were new. */
  importData(data: { sessions?: Session[]; projects?: Project[]; snippets?: Snippet[] }): number;
  updateSettings(s: Partial<Settings>): void;
  zoomBy(direction: 1 | -1): void;
  resetZoom(): void;
  toggleSidebar(): void;
  setSidebarWidth(width: number): void;
  setPanelWidth(width: number): void;
  togglePanel(open?: boolean): void;
  setPanelTab(t: PanelTab): void;
  setPalette(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  toggleTerminal(open?: boolean): void;
  newTerminal(): void;
  closeTerminal(id: string): void;
  setActiveTerminal(id: string): void;
  setTerminalShell(id: string, shell: string): void;
  renameTerminal(id: string, title: string): void;
  setTerminalHeight(height: number): void;
  openSettings(tab?: SettingsTab): void;
  signIn(account: Account): void;
  signOut(): void;
  updateAccount(patch: Partial<Account>): void;
  /** This window is closing: stops what it started so nothing is left mid-run for the other windows. */
  shutdown(): Promise<void>;
}

/** Code's terminal view is on screen: the main area is a CLI instead of the chat. */
export const cliActive = (s: Pick<State, "section" | "codeView">) => s.section === "code" && s.codeView === "terminal";

/**
 * The terminal view shows the open session itself (the default CLI): it is the same
 * session as the chat in another form, so it stays open and selected, and moving to
 * another session keeps the view. The other CLIs run sessions of their own.
 */
export const sessionCli = (s: Pick<State, "section" | "codeView" | "cli">) => cliActive(s) && s.cli === SESSION_CLI;

/** The session the window shows, whether as the chat or (see `sessionCli`) as a CLI. */
export const sessionOnScreen = (s: Pick<State, "section" | "codeView" | "cli" | "activeId">) =>
  cliActive(s) && !sessionCli(s) ? null : s.activeId;

type Where = Pick<State, "sessions" | "activeId" | "section" | "projects" | "projectId" | "draftFolder" | "codeFolder">;

export const sessionKind = (session: Pick<Session, "section" | "folder">): Kind =>
  session.section === "code" ? "code" : session.folder ? "work" : "chat";

/** The folder a session started from the new-session screen would work in. */
export function homeFolder(s: Where): string | null {
  if (s.draftFolder !== undefined) return s.draftFolder;
  const project = s.projects.find((p) => p.id === s.projectId);
  return project?.folder ?? (s.section === "code" ? s.codeFolder : null);
}

/** The folder in play: the open session's, or the one the next session will get. */
export function currentFolder(s: Where): string | null {
  const session = s.sessions.find((x) => x.id === s.activeId);
  return session ? (session.folder ?? null) : homeFolder(s);
}

/** What is on screen: a plain chat, a chat working in a folder, or a coding session. */
export const kindOf = (s: Where): Kind => (s.section === "code" ? "code" : currentFolder(s) ? "work" : "chat");

/** The agent has tools here, so modes, the terminal and the side panel apply. */
export const isAgentic = (s: Where) => kindOf(s) !== "chat";

/** Whether a session shows in the sidebar of a window looking at `section` and `projectId`. */
export const inScope = (session: Session, s: Pick<State, "section" | "projectId">) =>
  session.section === s.section && (!s.projectId || session.projectId === s.projectId);

const RECENT_FOLDERS = 6;
const withRecent = (list: string[], folder: string) => [folder, ...list.filter((f) => f !== folder)].slice(0, RECENT_FOLDERS);

/** A run is writing to this session, in this window or another one. */
export const isStreaming = (session: Session | null | undefined) => session?.messages.at(-1)?.status === "streaming";

/** The tool call in a session waiting for Allow/Deny, if any. */
export const awaitingTool = (session: Session | null | undefined): ToolPart | null =>
  (session?.messages.at(-1)?.parts.find((p) => p.type === "tool" && p.status === "awaiting" && !!p.permissionId) as ToolPart | undefined) ?? null;

type Choice = Pick<State, "sessions" | "activeId" | "model" | "mode">;
/** The model of the open session, or the one a new session would get. */
export const activeModel = (s: Choice) => s.sessions.find((x) => x.id === s.activeId)?.model ?? s.model;
/** The mode of the open session, or the one a new session would get. */
export const activeMode = (s: Choice): WorkMode => s.sessions.find((x) => x.id === s.activeId)?.mode ?? s.mode;

/** The terminal tabs of the open session (or of the new-session screen). */
export const sessionTerminals = (s: Pick<State, "terminals" | "activeId">) =>
  s.terminals.filter((t) => (t.sessionId ?? null) === s.activeId);

/** What "Always allow" remembers for a call: commands one by one, other tools by kind. */
export const allowRule = (tool: Pick<ToolPart, "kind" | "input">) => (tool.kind === "bash" ? `bash:${tool.input.trim()}` : tool.kind);

/** Whether a call may go ahead without asking, by the permission setting (or the project's) and the session's rules. */
export function autoApproved(tool: ToolPart, session: Session | undefined, s: Pick<State, "projects" | "settings">) {
  const project = s.projects.find((p) => p.id === session?.projectId);
  const mode = project?.permissionMode ?? s.settings.permissionMode;
  if (mode === "bypass") return true;
  if (mode === "acceptEdits" && tool.kind === "edit") return true;
  return !!session?.allow?.includes(allowRule(tool));
}

/** Whether someone is looking at this window right now. */
const watching = () => document.visibilityState === "visible" && document.hasFocus();

/** What the main area shows. Navigation animates only when this changes. */
function screen(s: Pick<State, "sessions" | "activeId" | "section" | "codeView">) {
  return cliActive(s) ? "cli" : s.sessions.some((x) => x.id === s.activeId) ? "thread" : "home";
}

const uid = () => crypto.randomUUID();

export function titleFrom(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return t("New session");
  const chars = Array.from(clean);
  return chars.length <= 48 ? clean : chars.slice(0, 47).join("") + "…";
}

export function messageText(m: Message) {
  return m.parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Pure reducer: folds one streamed event into the assistant message. */
export function applyEvent(msg: Message, ev: AgentEvent): Message {
  const now = Date.now();
  let parts = msg.parts.slice();
  const last = parts[parts.length - 1];
  const closeThinking = () => {
    const l = parts[parts.length - 1];
    if (l?.type === "thinking" && !l.endedAt) parts[parts.length - 1] = { ...l, endedAt: now };
  };
  const updateTool = (id: string, fn: (t: ToolPart) => ToolPart) => {
    parts = parts.map((p) => (p.type === "tool" && p.id === id ? fn(p) : p));
  };

  switch (ev.type) {
    case "thinking":
      if (last?.type === "thinking" && !last.endedAt) {
        parts[parts.length - 1] = { ...last, text: last.text + ev.delta };
      } else {
        parts.push({ type: "thinking", text: ev.delta, startedAt: now });
      }
      return { ...msg, parts };
    case "text":
      closeThinking();
      if (last?.type === "text") parts[parts.length - 1] = { ...last, text: last.text + ev.delta };
      else parts.push({ type: "text", text: ev.delta });
      return { ...msg, parts };
    case "toolStart":
      closeThinking();
      parts.push({ type: "tool", id: ev.id, name: ev.name, kind: ev.kind, input: ev.input, status: "running" });
      return { ...msg, parts };
    case "permissionRequest":
      updateTool(ev.toolId, (t) => ({ ...t, status: "awaiting", permissionId: ev.id, reason: ev.reason }));
      return { ...msg, parts };
    case "toolOutput":
      updateTool(ev.id, (t) => ({ ...t, output: (t.output ?? "") + ev.delta }));
      return { ...msg, parts };
    case "toolEnd":
      updateTool(ev.id, (t) => ({
        ...t,
        status: ev.status,
        output: ev.output,
        diff: ev.diff ?? undefined,
        permissionId: undefined,
      }));
      return { ...msg, parts };
    case "done":
      closeThinking();
      parts = parts.map((p) =>
        p.type === "tool" && (p.status === "running" || p.status === "awaiting")
          ? { ...p, status: "error", output: p.output ?? "Interrupted", permissionId: undefined }
          : p,
      );
      return { ...msg, parts, usage: ev.usage, status: ev.stopReason === "cancelled" ? "cancelled" : "done" };
    case "error":
      closeThinking();
      return { ...msg, parts, status: "error", error: ev.message };
  }
}

/** Marks anything still mid-stream as cancelled, for sessions whose run no longer exists. */
function settle(session: Session): Session {
  if (!session.messages.some((m) => m.status === "streaming")) return session;
  const zero = { inputTokens: 0, outputTokens: 0 };
  return {
    ...session,
    messages: session.messages.map((m) =>
      m.status === "streaming" ? applyEvent(m, { type: "done", stopReason: "cancelled", usage: m.usage ?? zero }) : m,
    ),
  };
}

export const STORAGE_KEY = "agent-desktop";
/** The workspace name earlier versions showed for every agent session, before sessions had folders. */
const LEGACY_WORKSPACE = "desktop-ui";
/** True while another window's save is being applied here, which must not be written back. */
let adopting = false;

// ---------------- Saving ----------------
// The state changes with every streamed token, and saving means serializing every session.
// So saves are batched: the latest state is written at most every SAVE_MS, and at once when
// the window hides or closes. A failed write (storage full) is reported instead of thrown
// into whatever changed the state, which would leave a run stuck mid-stream.

const SAVE_MS = 400;
let pendingSave: { name: string; value: StorageValue<unknown> } | null = null;
let saveTimer = 0;
let warnedFull = false;

/** Writes the pending save now, if there is one. */
export function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const save = pendingSave;
  pendingSave = null;
  if (!save) return;
  try {
    localStorage.setItem(save.name, JSON.stringify(save.value));
    warnedFull = false;
  } catch (e) {
    console.error("saving failed", e);
    if (!warnedFull) {
      warnedFull = true;
      toast(t("Couldn't save: storage is full. Export or delete old sessions in Settings › Data."), {
        label: t("Open"),
        run: () => useStore.getState().openSettings("data"),
      });
    }
  }
}

function batchedStorage<S>(): PersistStorage<S> {
  return {
    getItem: (name) => {
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
      } catch (e) {
        console.error("couldn't read the saved state", e);
        return null;
      }
    },
    setItem: (name, value) => {
      // Taking over another window's save must not echo it back. It still refreshes a save
      // that is waiting, so that one doesn't write back the state from before.
      if (adopting) {
        if (pendingSave) pendingSave = { name, value };
        return;
      }
      pendingSave = { name, value };
      if (!saveTimer) saveTimer = window.setTimeout(flushSave, SAVE_MS);
    },
    removeItem: (name) => localStorage.removeItem(name),
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const patchSession = (id: string, fn: (s: Session) => Session) =>
        set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? fn(s) : s)) }));
      const patchMessage = (sid: string, mid: string, fn: (m: Message) => Message) =>
        patchSession(sid, (s) => ({
          ...s,
          updatedAt: Date.now(),
          messages: s.messages.map((m) => (m.id === mid ? fn(m) : m)),
        }));

      /**
       * Applies a navigation. The composer glides when it actually moves (home screen ↔ thread)
       * and the window cross-fades into or out of the terminal view; anything else, such as
       * another session or another section's home screen, simply swaps.
       *
       * `change` is evaluated again when it is applied: inside a transition that is a frame
       * later, and streamed events may have landed in between.
       */
      const go = (change: (st: State) => Partial<State>) => {
        const from = screen(get());
        const to = screen({ ...get(), ...change(get()) });
        if (from === to) set(change);
        else withViewTransition(() => set(change), from === "cli" || to === "cli" ? "fade" : "dock");
      };

      /** The state change that opens `section`, restoring the session last open there. */
      const enter = (st: State, section: Section): Partial<State> => {
        if (st.section === section) return {};
        const remembered = st.lastActive[section];
        const exists = st.sessions.some((s) => s.id === remembered && inScope(s, { section, projectId: st.projectId }));
        return {
          section,
          lastActive: { ...st.lastActive, [st.section]: st.activeId },
          activeId: exists ? remembered! : null,
          draftFolder: undefined,
        };
      };

      /** A system notification about a session, when nobody is looking at the window. */
      const alert = (sid: string, body: string) => {
        if (get().settings.notifications === false || watching()) return;
        const title = get().sessions.find((s) => s.id === sid)?.title ?? "Agent Desktop";
        void notify(title, body);
      };

      /** Appends a prompt to a session and runs it. */
      const post = (sid: string, text: string, files?: PendingFile[]) => {
        const user: Message = {
          id: uid(),
          role: "user",
          parts: [{ type: "text", text }],
          createdAt: Date.now(),
          // Only what describes a file is kept with the message; its content goes with the run.
          files: files?.length ? files.map(({ content: _content, ...file }) => file) : undefined,
        };
        patchSession(sid, (s) => ({ ...s, updatedAt: Date.now(), messages: [...s.messages, user] }));
        return run(sid, text, files);
      };

      const run = async (sid: string, prompt: string, files?: PendingFile[]) => {
        const session = get().sessions.find((s) => s.id === sid);
        if (!session) return;
        const model = session.model ?? get().model;
        const mode: Mode = sessionKind(session) === "chat" ? "chat" : (session.mode ?? get().mode);
        const project = get().projects.find((p) => p.id === session.projectId);
        const history = session.messages
          .filter((m) => m.status !== "error")
          .map((m) => ({ role: m.role, content: messageText(m) }));
        const assistant: Message = {
          id: uid(),
          role: "assistant",
          parts: [],
          createdAt: Date.now(),
          status: "streaming",
          model,
          mode,
        };
        patchSession(sid, (s) => ({ ...s, unread: false, messages: [...s.messages, assistant] }));
        set((st) => ({ runs: { ...st.runs, [sid]: "pending" } }));

        let finished = false;
        const finish = (ev: AgentEvent) => {
          finished = true;
          set((st) => {
            const runs = { ...st.runs };
            delete runs[sid];
            return { runs };
          });
          const cancelled = ev.type === "done" && ev.stopReason === "cancelled";
          // A reply nobody saw is marked in the list until its session is opened.
          const seen = watching() && sessionOnScreen(get()) === sid;
          if (!seen && !cancelled) patchSession(sid, (s) => ({ ...s, unread: true }));
          if (ev.type === "error") alert(sid, t("Stopped with an error: {message}", { message: ev.message }));
          else if (!cancelled) alert(sid, t("Done"));
          // A message sent while it ran goes now, unless the run was stopped (then it waits to be sent or dropped).
          const next = get().queued[sid];
          if (next && !cancelled) {
            get().unqueue(sid);
            void post(sid, next.text, next.files);
          }
        };

        try {
          const request = {
            sessionId: sid,
            prompt,
            model,
            mode,
            history,
            folder: session.folder ?? null,
            instructions: project?.instructions || null,
            attachments: files?.map((f) => ({ name: f.name, path: f.path, content: f.content, mime: f.mime })),
          };
          const runId = await agent.startRun(request, (ev) => {
            patchMessage(sid, assistant.id, (m) => applyEvent(m, ev));
            if (ev.type === "permissionRequest") {
              const now = get().sessions.find((s) => s.id === sid);
              const tool = now?.messages.find((m) => m.id === assistant.id)?.parts.find((p): p is ToolPart => p.type === "tool" && p.id === ev.toolId);
              // Approved without asking: answered at once, so no prompt is left showing.
              if (tool && autoApproved(tool, now, get())) get().answerPermission(tool, true);
              else alert(sid, t("Waiting for approval: {tool}", { tool: tool ? `${tool.name} ${tool.input ?? ""}`.trim() : t("a tool") }));
            }
            if (ev.type === "done" || ev.type === "error") finish(ev);
          });
          if (!finished) set((st) => ({ runs: { ...st.runs, [sid]: runId } }));
        } catch (e) {
          patchMessage(sid, assistant.id, (m) => ({ ...m, status: "error", error: String(e) }));
          finish({ type: "error", message: String(e) });
        }
      };

      /** The open session, unless it is busy (running here or elsewhere). */
      const idleActive = () => {
        const sid = get().activeId;
        const session = get().sessions.find((s) => s.id === sid);
        return session && !get().runs[session.id] && !isStreaming(session) ? session : null;
      };

      return {
        sessions: [],
        activeId: null,
        section: "chat",
        lastActive: {},
        projects: [],
        projectId: null,
        draftFolder: undefined,
        recentFolders: [],
        codeFolder: null,
        projectDialog: null,
        projectAdopt: null,
        codeView: "gui",
        cli: SESSION_CLI,
        models: [],
        model: "claude-sonnet-5-5",
        mode: "agent",
        settings: { theme: "system", permissionMode: "ask", zoom: 1, keysSet: [], endpoints: {}, notifications: true, sendKey: "enter" },
        snippets: [],
        queued: {},
        account: DEMO_ACCOUNT,
        settingsTab: "general",
        runs: {},
        sidebarOpen: true,
        sidebarWidth: SIDEBAR_W[1],
        panelOpen: false,
        panelWidth: PANEL_W[1],
        panelTab: "changes",
        paletteOpen: false,
        settingsOpen: false,
        terminalOpen: false,
        terminalHeight: 280,
        terminals: [],
        activeTerminal: null,

        async loadModels() {
          const models = await agent.listModels();
          set((st) => ({
            models,
            model: models.some((m) => m.id === st.model) ? st.model : (models[0]?.id ?? st.model),
          }));
        },

        newSession() {
          const now = get();
          if (now.activeId === null && (!cliActive(now) || sessionCli(now))) return;
          // The session's CLI starts the new session in place; another CLI makes way for the chat.
          go((st) => ({ activeId: null, draftFolder: undefined, ...(st.section === "code" && !sessionCli(st) ? { codeView: "gui" } : {}) }));
        },

        selectSession(id) {
          const now = get();
          const session = now.sessions.find((s) => s.id === id);
          if (!session || (id === now.activeId && sessionOnScreen(now) === id)) return;
          const { section } = session;
          // Opening it is seeing it.
          if (session.unread) patchSession(id, (s) => ({ ...s, unread: false }));
          go((st) => ({
            activeId: id,
            section,
            // Opening a session always shows it: the terminal view can if it is the session's CLI.
            ...(section === "code" && st.cli !== SESSION_CLI ? { codeView: "gui" } : {}),
            // Reached from outside the project being looked at (the palette), it brings the sidebar along.
            ...(st.projectId && session.projectId !== st.projectId ? { projectId: session.projectId ?? null } : {}),
          }));
        },

        setSection(section) {
          if (get().section !== section) go((st) => enter(st, section));
        },

        enterAgent() {
          if (!isAgentic(get())) get().setSection("code");
        },

        setFolder(folder) {
          set((st) => {
            const open = st.sessions.some((s) => s.id === st.activeId);
            return {
              ...(open
                ? { sessions: st.sessions.map((s) => (s.id === st.activeId ? { ...s, folder } : s)) }
                : { draftFolder: folder }),
              ...(st.section === "code" ? { codeFolder: folder } : {}),
              ...(folder ? { recentFolders: withRecent(st.recentFolders, folder) } : {}),
            };
          });
        },
        rememberFolder: (folder) => set((st) => ({ recentFolders: withRecent(st.recentFolders, folder) })),
        setCodeFolder: (codeFolder) =>
          set((st) => ({ codeFolder, ...(codeFolder ? { recentFolders: withRecent(st.recentFolders, codeFolder) } : {}) })),

        setProject(projectId) {
          if (get().projectId === projectId) return;
          go((st) => {
            // An open session stays open only if it belongs to what is now being looked at.
            const open = st.sessions.find((s) => s.id === st.activeId);
            const keep = !!open && (!projectId || open.projectId === projectId);
            return { projectId, draftFolder: undefined, activeId: keep ? st.activeId : null };
          });
        },
        openProjectDialog: (target = "new", adoptSession) => set({ projectDialog: target, projectAdopt: adoptSession ?? null }),
        closeProjectDialog: () => set({ projectDialog: null, projectAdopt: null }),

        createProject(input, adoptSession) {
          const project: Project = {
            id: uid(),
            name: input.name.trim() || t("Untitled project"),
            folder: input.folder,
            instructions: input.instructions.trim(),
            createdAt: Date.now(),
            permissionMode: input.permissionMode ?? null,
          };
          set((st) => ({ projects: [...st.projects, project] }));
          if (adoptSession) get().moveSession(adoptSession, project.id);
          else get().setProject(project.id);
          return project.id;
        },

        updateProject(id, patch) {
          set((st) => ({
            projects: st.projects.map((p) =>
              p.id !== id
                ? p
                : {
                    ...p,
                    ...patch,
                    name: patch.name === undefined ? p.name : patch.name.trim() || p.name,
                    instructions: patch.instructions === undefined ? p.instructions : patch.instructions.trim(),
                  },
            ),
          }));
        },

        deleteProject(id) {
          set((st) => ({
            projects: st.projects.filter((p) => p.id !== id),
            sessions: st.sessions.map((s) => (s.projectId === id ? { ...s, projectId: null } : s)),
            projectId: st.projectId === id ? null : st.projectId,
            draftFolder: st.projectId === id ? undefined : st.draftFolder,
          }));
        },

        restoreProject(project, sessionIds) {
          if (get().projects.some((p) => p.id === project.id)) return;
          set((st) => ({
            projects: [...st.projects, project].sort((a, b) => a.createdAt - b.createdAt),
            // Only sessions still unfiled go back: one moved elsewhere since stays where it was put.
            sessions: st.sessions.map((s) => (sessionIds.includes(s.id) && !s.projectId ? { ...s, projectId: project.id } : s)),
          }));
        },

        moveSession(id, projectId) {
          set((st) => ({
            sessions: st.sessions.map((s) => (s.id === id ? { ...s, projectId } : s)),
            // The open session takes the sidebar with it instead of vanishing from the list.
            ...(st.activeId === id && st.projectId && st.projectId !== projectId ? { projectId } : {}),
          }));
        },

        setCodeView(codeView) {
          if (codeView === "terminal") go((st) => ({ ...enter(st, "code"), codeView }));
          else if (get().codeView !== codeView) go(() => ({ codeView }));
        },
        setCli: (cli) => set({ cli }),

        deleteSession(id) {
          get().deleteSessions([id]);
        },

        deleteSessions(ids) {
          for (const id of ids) {
            get().stop(id);
            get().unqueue(id);
          }
          // Their terminals go with them.
          for (const t of get().terminals) if (t.sessionId && ids.includes(t.sessionId)) get().closeTerminal(t.id);
          go((st) => ({ sessions: st.sessions.filter((s) => !ids.includes(s.id)), activeId: st.activeId && ids.includes(st.activeId) ? null : st.activeId }));
        },

        restoreSession(session) {
          get().restoreSessions([session]);
        },

        restoreSessions(sessions) {
          const fresh = sessions.filter((x) => !get().sessions.some((s) => s.id === x.id));
          // Their runs were cancelled on delete, so nothing is still streaming.
          if (fresh.length) set((st) => ({ sessions: [...fresh.map(settle), ...st.sessions] }));
        },

        renameSession(id, title) {
          patchSession(id, (s) => ({ ...s, title: title.trim() || s.title }));
        },

        async send(prompt, files) {
          const text = prompt.trim();
          if (!text) return;
          let sid = get().activeId;
          const open = get().sessions.find((s) => s.id === sid);
          if (sid && open) {
            // One run per session: a message sent while this window runs it waits its turn;
            // one running in another window can only be watched.
            if (get().runs[sid]) {
              set((st) => ({ queued: { ...st.queued, [sid!]: { text, files } } }));
              return;
            }
            if (isStreaming(open)) return;
          } else {
            const now = Date.now();
            const session: Session = {
              id: uid(),
              section: get().section,
              title: titleFrom(text),
              createdAt: now,
              updatedAt: now,
              messages: [],
              folder: homeFolder(get()),
              projectId: get().projectId,
              model: get().model,
              mode: get().mode,
            };
            sid = session.id;
            set((st) => ({
              sessions: [session, ...st.sessions],
              activeId: session.id,
              draftFolder: undefined,
              // Terminals opened on the new-session screen belong to the session it started.
              terminals: st.terminals.map((t) => (t.sessionId == null ? { ...t, sessionId: session.id } : t)),
            }));
          }
          await post(sid, text, files);
        },

        unqueue(sessionId) {
          if (!get().queued[sessionId]) return;
          set((st) => {
            const queued = { ...st.queued };
            delete queued[sessionId];
            return { queued };
          });
        },

        stop(sessionId) {
          const sid = sessionId ?? get().activeId;
          if (!sid) return;
          const runId = get().runs[sid];
          if (runId && runId !== "pending") agent.cancelRun(runId).catch(console.error);
        },

        retry(model) {
          const session = idleActive();
          if (!session) return;
          const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
          if (!lastUser) return;
          const idx = session.messages.lastIndexOf(lastUser);
          patchSession(session.id, (s) => ({ ...s, ...(model ? { model } : {}), messages: s.messages.slice(0, idx + 1) }));
          void run(session.id, messageText(lastUser));
        },

        editMessage(messageId, text) {
          const session = idleActive();
          const clean = text.trim();
          if (!session || !clean) return;
          const idx = session.messages.findIndex((m) => m.id === messageId && m.role === "user");
          if (idx < 0) return;
          const old = session.messages[idx];
          patchSession(session.id, (s) => ({
            ...s,
            updatedAt: Date.now(),
            messages: [...s.messages.slice(0, idx), { ...old, parts: [{ type: "text", text: clean }], createdAt: Date.now() }],
          }));
          void run(session.id, clean);
        },

        forkSession(messageId) {
          const session = get().sessions.find((s) => s.id === get().activeId);
          if (!session) return;
          const idx = session.messages.findIndex((m) => m.id === messageId);
          if (idx < 0) return;
          const now = Date.now();
          const branch: Session = settle({
            ...session,
            id: uid(),
            title: t("{title} (branch)", { title: session.title }),
            createdAt: now,
            updatedAt: now,
            messages: session.messages.slice(0, idx + 1),
            pinned: false,
            archived: false,
            unread: false,
          });
          set((st) => ({ sessions: [branch, ...st.sessions] }));
          get().selectSession(branch.id);
          toast(t("Branched into “{title}”", { title: branch.title }));
        },

        answerPermission(tool, allow) {
          if (!tool.permissionId) return;
          const pid = tool.permissionId;
          // Optimistically clear the prompt so double-clicks don't resend. The call is found by
          // its id, wherever it is: a prompt can be answered from a window not showing it.
          set((st) => ({
            sessions: st.sessions.map((s) =>
              s.messages.at(-1)?.parts.some((p) => p.type === "tool" && p.id === tool.id)
                ? {
                    ...s,
                    messages: s.messages.map((m, i) =>
                      i < s.messages.length - 1
                        ? m
                        : {
                            ...m,
                            parts: m.parts.map((p) =>
                              p.type === "tool" && p.id === tool.id ? { ...p, permissionId: undefined, status: allow ? "running" : p.status } : p,
                            ),
                          },
                    ),
                  }
                : s,
            ),
          }));
          agent.respondPermission(pid, allow).catch(console.error);
        },

        allowAlways(tool) {
          const session = get().sessions.find((s) => s.messages.at(-1)?.parts.some((p) => p.type === "tool" && p.id === tool.id));
          if (session) {
            const rule = allowRule(tool);
            patchSession(session.id, (s) => ({ ...s, allow: [...new Set([...(s.allow ?? []), rule])] }));
          }
          get().answerPermission(tool, true);
        },

        setModel(model) {
          const sid = get().activeId;
          if (sid && get().sessions.some((s) => s.id === sid)) patchSession(sid, (s) => ({ ...s, model }));
          else set({ model });
        },
        setMode(mode) {
          const sid = get().activeId;
          if (sid && get().sessions.some((s) => s.id === sid)) patchSession(sid, (s) => ({ ...s, mode }));
          else set({ mode });
        },

        setPinned: (id, pinned) => patchSession(id, (s) => ({ ...s, pinned })),
        setArchived(id, archived) {
          patchSession(id, (s) => ({ ...s, archived, pinned: archived ? false : s.pinned }));
          // Archiving the open session closes it, like deleting does.
          if (archived && get().activeId === id) get().newSession();
        },

        markReverted(sessionId, toolIds, reverted) {
          patchSession(sessionId, (s) => ({
            ...s,
            messages: s.messages.map((m) => ({
              ...m,
              parts: m.parts.map((p) => (p.type === "tool" && toolIds.includes(p.id) ? { ...p, reverted } : p)),
            })),
          }));
        },

        saveSnippet(snippet) {
          set((st) => ({
            snippets: st.snippets.some((x) => x.id === snippet.id)
              ? st.snippets.map((x) => (x.id === snippet.id ? snippet : x))
              : [...st.snippets, snippet],
          }));
        },
        deleteSnippet: (id) => set((st) => ({ snippets: st.snippets.filter((x) => x.id !== id) })),

        importData(data) {
          const have = new Set(get().sessions.map((s) => s.id));
          const sessions = (data.sessions ?? []).filter((s) => s && typeof s.id === "string" && Array.isArray(s.messages) && !have.has(s.id)).map(settle);
          const projects = (data.projects ?? []).filter((p) => p && typeof p.id === "string" && !get().projects.some((x) => x.id === p.id));
          const snippets = (data.snippets ?? []).filter((x) => x && typeof x.id === "string" && !get().snippets.some((y) => y.id === x.id));
          set((st) => ({
            sessions: [...st.sessions, ...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
            projects: [...st.projects, ...projects],
            snippets: [...st.snippets, ...snippets],
          }));
          return sessions.length;
        },

        updateSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
        zoomBy(direction) {
          const z = get().settings.zoom ?? 1;
          const next =
            direction > 0
              ? ZOOM_STEPS.find((step) => step > z + 0.001)
              : [...ZOOM_STEPS].reverse().find((step) => step < z - 0.001);
          if (next) get().updateSettings({ zoom: next });
        },
        resetZoom: () => get().updateSettings({ zoom: 1 }),
        toggleSidebar: () => set((st) => ({ sidebarOpen: !st.sidebarOpen })),
        setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
        setPanelWidth: (panelWidth) => set({ panelWidth }),
        togglePanel: (open) => set((st) => ({ panelOpen: open ?? !st.panelOpen })),
        setPanelTab: (panelTab) => set({ panelTab, panelOpen: true }),
        setPalette: (paletteOpen) => set({ paletteOpen }),
        setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

        toggleTerminal(open) {
          // Code's terminal view is already a terminal; the drawer stays out of its way.
          if (cliActive(get())) return;
          const shown = get().terminalOpen && isAgentic(get()) && sessionTerminals(get()).length > 0;
          const next = open ?? !shown;
          // The terminal comes with the agent; opening it from a plain chat moves to Code.
          if (next) get().enterAgent();
          set({ terminalOpen: next });
          if (next && sessionTerminals(get()).length === 0) get().newTerminal();
        },
        newTerminal() {
          if (cliActive(get())) return;
          const tab: TerminalTab = { id: uid(), cwd: currentFolder(get()), sessionId: get().activeId };
          set((st) => ({ terminals: [...st.terminals, tab], activeTerminal: tab.id, terminalOpen: true }));
        },
        closeTerminal(id) {
          set((st) => {
            const tab = st.terminals.find((t) => t.id === id);
            if (!tab) return {};
            const siblings = st.terminals.filter((t) => (t.sessionId ?? null) === (tab.sessionId ?? null));
            const i = siblings.indexOf(tab);
            const terminals = st.terminals.filter((t) => t.id !== id);
            const left = siblings.filter((t) => t.id !== id);
            const activeTerminal = st.activeTerminal === id ? (left[Math.min(i, left.length - 1)]?.id ?? null) : st.activeTerminal;
            // The drawer closes with the open session's last tab.
            const lastHere = (tab.sessionId ?? null) === st.activeId && left.length === 0;
            return { terminals, activeTerminal, terminalOpen: st.terminalOpen && !lastHere };
          });
        },
        setActiveTerminal: (activeTerminal) => set({ activeTerminal }),
        setTerminalShell: (id, shell) =>
          set((st) => ({ terminals: st.terminals.map((t) => (t.id === id ? { ...t, shell } : t)) })),
        renameTerminal: (id, title) =>
          set((st) => ({ terminals: st.terminals.map((t) => (t.id === id ? { ...t, title: title.trim() || undefined } : t)) })),
        setTerminalHeight: (terminalHeight) => set({ terminalHeight }),
        openSettings: (tab) => set((st) => ({ settingsOpen: true, settingsTab: tab ?? st.settingsTab })),
        signIn: (account) => set({ account }),
        signOut: () => set({ account: null }),
        updateAccount: (patch) => set((st) => (st.account ? { account: { ...st.account, ...patch } } : {})),

        async shutdown() {
          const { runs } = get();
          const cancels = Object.values(runs).map((runId) => (runId === "pending" ? null : agent.cancelRun(runId)));
          set((st) => ({ sessions: st.sessions.map((s) => (runs[s.id] ? settle(s) : s)), runs: {} }));
          flushSave();
          await Promise.allSettled([...cancels, pty.killAll()]);
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 5,
      storage: batchedStorage(),
      migrate: (persisted, version) => {
        const p = persisted as Omit<Partial<State>, "mode"> & { mode?: Mode };
        // v1 had no sections: every session was agent work.
        const sectionOf = (s: Session) => ((s as { section?: string }).section ?? "work");
        if (version < 2 && p.mode === "chat") p.mode = "agent";
        if (version < 3) {
          // v2 had a third section, Work. It is now a chat with a folder, so Work sessions move to
          // Chat and keep their tools by getting the workspace every agent session was shown with.
          p.sessions = (p.sessions ?? []).map((s) => {
            const was = sectionOf(s);
            return was === "chat" ? s : { ...s, section: was === "code" ? "code" : "chat", folder: s.folder ?? LEGACY_WORKSPACE };
          });
          const last = (p.lastActive ?? {}) as Record<string, string | null | undefined>;
          p.lastActive = { chat: last.chat ?? last.work ?? null, code: last.code ?? null };
          if ((p.section as string | undefined) !== "code") p.section = "chat";
          delete (p as { agentSection?: unknown }).agentSection;
        }
        // v3's terminal view always started another CLI; now it shows the session itself.
        if (version < 4) p.cli = SESSION_CLI;
        // v4 kept API keys in the saved settings. They go to the keychain on the next start
        // (`moveLegacyKeys`); the Ollama endpoint is no secret and stays.
        if (version < 5 && p.settings) {
          const { apiKeys, ...settings } = p.settings as Settings & { apiKeys?: Record<string, string> };
          const { ollama, ...keys } = apiKeys ?? {};
          const secret = Object.fromEntries(Object.entries(keys).filter(([, v]) => typeof v === "string" && v.trim()));
          p.settings = {
            ...settings,
            endpoints: ollama ? { ollama } : {},
            ...(Object.keys(secret).length ? { legacyKeys: secret } : {}),
          };
        }
        return p as State;
      },
      partialize: (s) => ({
        sessions: s.sessions,
        activeId: s.activeId,
        section: s.section,
        lastActive: s.lastActive,
        projects: s.projects,
        projectId: s.projectId,
        recentFolders: s.recentFolders,
        codeFolder: s.codeFolder,
        codeView: s.codeView,
        cli: s.cli,
        model: s.model,
        mode: s.mode,
        settings: s.settings,
        snippets: s.snippets,
        account: s.account,
        sidebarOpen: s.sidebarOpen,
        sidebarWidth: s.sidebarWidth,
        panelOpen: s.panelOpen,
        panelWidth: s.panelWidth,
        panelTab: s.panelTab,
        terminalHeight: s.terminalHeight,
      }),
    },
  ),
);

export const useActiveSession = () =>
  useStore((s) => s.sessions.find((x) => x.id === s.activeId) ?? null);

// ---------------- Multiple windows ----------------
// Every window keeps its own copy of the state and saves it under the same key.
// Sessions, settings and the account are shared: when one window saves, the
// others take them over. What is open and how the window is laid out stays local.

/** Session ids this window is running, kept per window so a reload knows which runs died with it. */
const RUNS_KEY = "agent-desktop:runs";

function ownRunsBeforeReload(): string[] | null {
  try {
    const raw = sessionStorage.getItem(RUNS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function rememberOwnRuns(runs: Record<string, string>) {
  try {
    sessionStorage.setItem(RUNS_KEY, JSON.stringify(Object.keys(runs)));
  } catch {
    // Storage unavailable: a reload then leaves this window's runs to the next app start.
  }
}

/**
 * Runs don't survive their window, so on load anything this window left
 * mid-stream is marked cancelled: after a reload, the runs it had going; on a
 * fresh app start (the first window), all of them. A window opened later
 * leaves other windows' live runs alone.
 */
function settleDeadRuns() {
  const own = ownRunsBeforeReload();
  const dead = (id: string) => (own ? own.includes(id) : isPrimaryWindow);
  useStore.setState((st) => ({ sessions: st.sessions.map((s) => (dead(s.id) ? settle(s) : s)) }));
  rememberOwnRuns({});
}
/** Moves API keys saved before the keychain into it, then out of the saved settings. */
async function moveLegacyKeys() {
  const legacy = useStore.getState().settings.legacyKeys;
  if (!legacy || !isPrimaryWindow) return;
  const moved: string[] = [];
  for (const [name, value] of Object.entries(legacy)) {
    try {
      await setSecret(name, value);
      moved.push(name);
    } catch (e) {
      console.error(`couldn't move the ${name} key to the keychain`, e);
      return; // they stay where they were, and the next start tries again
    }
  }
  const { settings, updateSettings } = useStore.getState();
  updateSettings({ legacyKeys: undefined, keysSet: [...new Set([...(settings.keysSet ?? []), ...moved])] });
}

function afterHydration() {
  settleDeadRuns();
  void moveLegacyKeys();
}
if (useStore.persist.hasHydrated()) afterHydration();
else useStore.persist.onFinishHydration(afterHydration);
useStore.subscribe((s, prev) => {
  if (s.runs !== prev.runs) rememberOwnRuns(s.runs);
});

/** Finished messages never change, so keep the objects already rendered and only swap what moved. */
function reuse(next: Session, prev: Session | undefined): Session {
  if (!prev) return next;
  const last = (s: Session) => s.messages.at(-1);
  if (
    prev.updatedAt === next.updatedAt &&
    prev.title === next.title &&
    (prev.folder ?? null) === (next.folder ?? null) &&
    (prev.projectId ?? null) === (next.projectId ?? null) &&
    prev.messages.length === next.messages.length &&
    last(prev)?.status === last(next)?.status
  ) {
    return prev;
  }
  return {
    ...next,
    messages: next.messages.map((m, i) => {
      const old = prev.messages[i];
      return old && old.id === m.id && old.status === m.status && m.status !== "streaming" ? old : m;
    }),
  };
}

/** Takes over what another window just saved, except the sessions this window is itself running. */
function adopt(raw: string) {
  let saved: Partial<Pick<State, "sessions" | "settings" | "account" | "projects" | "recentFolders" | "snippets">> | undefined;
  try {
    saved = (JSON.parse(raw) as { state?: typeof saved }).state;
  } catch {
    return;
  }
  const theirs = saved?.sessions;
  if (!saved || !Array.isArray(theirs)) return;
  adopting = true;
  try {
    useStore.setState((st) => {
      const mine = new Map(st.sessions.map((s) => [s.id, s]));
      const running = st.sessions.filter((s) => st.runs[s.id]);
      const sessions = [
        // A session started here moments ago may not have reached the other window yet.
        ...running.filter((s) => !theirs.some((x) => x.id === s.id)),
        ...theirs.map((s) => (st.runs[s.id] ? mine.get(s.id)! : reuse(s, mine.get(s.id)))),
      ];
      const projects = Array.isArray(saved.projects) ? saved.projects : st.projects;
      return {
        sessions,
        projects,
        recentFolders: saved.recentFolders ?? st.recentFolders,
        snippets: Array.isArray(saved.snippets) ? saved.snippets : st.snippets,
        settings: saved.settings ?? st.settings,
        account: saved.account === undefined ? st.account : saved.account,
        // The open session or project may have been deleted in the other window.
        activeId: sessions.some((s) => s.id === st.activeId) ? st.activeId : null,
        projectId: projects.some((p) => p.id === st.projectId) ? st.projectId : null,
      };
    });
  } finally {
    adopting = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.storageArea === localStorage && e.key === STORAGE_KEY && e.newValue) adopt(e.newValue);
  });
}
