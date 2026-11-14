import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as agent from "./agent";
import * as pty from "./pty";
import { withViewTransition } from "./util";
import { isPrimaryWindow } from "./windows";
import { isAgentSection } from "./types";
import type { AgentEvent, AgentSection, Message, Mode, ModelInfo, Part, Section, Session, ToolPart } from "./types";

/** Modes available in the agent sections, Work and Code (Chat always runs in "chat" mode). */
export type WorkMode = Exclude<Mode, "chat">;

export type Theme = "system" | "light" | "dark";
export type PermissionMode = "ask" | "acceptEdits" | "bypass";
export type PanelTab = "changes" | "terminal" | "context";
/** What the Code section's main area shows: the chat UI, or a full-window terminal running a CLI agent. */
export type CodeView = "gui" | "terminal";
/** One interactive terminal tab. The PTY itself lives in the Rust backend and dies with the app. */
export interface TerminalTab {
  id: string;
  shell?: string;
}

export type SettingsTab = "account" | "general" | "providers" | "permissions" | "shortcuts";

/** Local profile. There is no auth backend yet; wire a real identity provider here. */
export interface Account {
  name: string;
  email: string;
  plan: string;
}
export const DEMO_ACCOUNT: Account = { name: "Demo User", email: "demo@example.com", plan: "Pro" };

interface Settings {
  theme: Theme;
  permissionMode: PermissionMode;
  apiKeys: Record<string, string>;
  /** UI zoom factor (1 = 100%). May be missing in settings saved before zoom existed. */
  zoom?: number;
}

export const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** Column widths in px: [min, default, max]. The panel is also capped by the window (see App). */
export const SIDEBAR_W = [208, 264, 420] as const;
export const PANEL_W = [300, 400, 760] as const;

interface State {
  sessions: Session[];
  activeId: string | null;
  section: Section;
  /** The agent section used most recently: where the terminal and modes take you from Chat. */
  agentSection: AgentSection;
  /** Last open session per section, restored when switching back. */
  lastActive: Partial<Record<Section, string | null>>;
  codeView: CodeView;
  /** Which CLI the terminal view runs (an id from `CLIS`). */
  cli: string;
  models: ModelInfo[];
  model: string;
  mode: WorkMode;
  settings: Settings;
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
  /** From Chat, moves to the last-used agent section; a no-op when already in one. */
  enterAgentSection(): void;
  /** Switches Code between the chat UI and the terminal; "terminal" also brings you to Code. */
  setCodeView(view: CodeView): void;
  setCli(id: string): void;
  deleteSession(id: string): void;
  /** Puts a deleted session back (undo). */
  restoreSession(session: Session): void;
  renameSession(id: string, title: string): void;
  send(prompt: string, attachments?: string[]): Promise<void>;
  stop(sessionId?: string): void;
  retry(): void;
  answerPermission(toolPart: ToolPart, allow: boolean): void;
  setModel(id: string): void;
  setMode(mode: WorkMode): void;
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

/** A run is writing to this session, in this window or another one. */
export const isStreaming = (session: Session | null | undefined) => session?.messages.at(-1)?.status === "streaming";

/** What the main area shows. Navigation animates only when this changes. */
function screen(s: Pick<State, "sessions" | "activeId" | "section" | "codeView">) {
  return cliActive(s) ? "cli" : s.sessions.some((x) => x.id === s.activeId) ? "thread" : "home";
}

const uid = () => crypto.randomUUID();

export function titleFrom(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return "New session";
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

const STORAGE_KEY = "agent-desktop";
/** True while another window's save is being applied here, which must not be written back. */
let adopting = false;

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
        const exists = st.sessions.some((s) => s.id === remembered && s.section === section);
        return {
          section,
          agentSection: isAgentSection(section) ? section : st.agentSection,
          lastActive: { ...st.lastActive, [st.section]: st.activeId },
          activeId: exists ? remembered! : null,
        };
      };

      const shouldAutoApprove = (tool: ToolPart | undefined) => {
        const mode = get().settings.permissionMode;
        if (mode === "bypass") return true;
        if (mode === "acceptEdits") return tool?.kind === "edit";
        return false;
      };

      const run = async (sid: string, prompt: string) => {
        const { model } = get();
        const session = get().sessions.find((s) => s.id === sid);
        if (!session) return;
        const mode: Mode = session.section === "chat" ? "chat" : get().mode;
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
        patchSession(sid, (s) => ({ ...s, messages: [...s.messages, assistant] }));
        set((st) => ({ runs: { ...st.runs, [sid]: "pending" } }));

        let finished = false;
        const finish = () => {
          finished = true;
          set((st) => {
            const runs = { ...st.runs };
            delete runs[sid];
            return { runs };
          });
        };

        try {
          const runId = await agent.startRun({ sessionId: sid, prompt, model, mode, history }, (ev) => {
            patchMessage(sid, assistant.id, (m) => applyEvent(m, ev));
            if (ev.type === "permissionRequest") {
              const msg = get().sessions.find((s) => s.id === sid)?.messages.find((m) => m.id === assistant.id);
              const tool = msg?.parts.find((p): p is ToolPart => p.type === "tool" && p.id === ev.toolId);
              if (shouldAutoApprove(tool)) agent.respondPermission(ev.id, true).catch(console.error);
            }
            if (ev.type === "done" || ev.type === "error") finish();
          });
          if (!finished) set((st) => ({ runs: { ...st.runs, [sid]: runId } }));
        } catch (e) {
          patchMessage(sid, assistant.id, (m) => ({ ...m, status: "error", error: String(e) }));
          finish();
        }
      };

      return {
        sessions: [],
        activeId: null,
        section: "work",
        agentSection: "work",
        lastActive: {},
        codeView: "gui",
        cli: "claude",
        models: [],
        model: "claude-sonnet-5-5",
        mode: "agent",
        settings: { theme: "system", permissionMode: "ask", apiKeys: {}, zoom: 1 },
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
          if (now.activeId === null && !cliActive(now)) return;
          go((st) => ({ activeId: null, ...(st.section === "code" ? { codeView: "gui" } : {}) }));
        },

        selectSession(id) {
          const now = get();
          const session = now.sessions.find((s) => s.id === id);
          if (!session || (id === now.activeId && !cliActive(now))) return;
          const { section } = session;
          go(() => ({
            activeId: id,
            section,
            ...(isAgentSection(section) ? { agentSection: section } : {}),
            // Opening a session always shows it, even if Code was in its terminal view.
            ...(section === "code" ? { codeView: "gui" } : {}),
          }));
        },

        setSection(section) {
          if (get().section !== section) go((st) => enter(st, section));
        },

        enterAgentSection() {
          if (!isAgentSection(get().section)) get().setSection(get().agentSection);
        },

        setCodeView(codeView) {
          if (codeView === "terminal") go((st) => ({ ...enter(st, "code"), codeView }));
          else if (get().codeView !== codeView) go(() => ({ codeView }));
        },
        setCli: (cli) => set({ cli }),

        deleteSession(id) {
          get().stop(id);
          go((st) => ({ sessions: st.sessions.filter((s) => s.id !== id), activeId: st.activeId === id ? null : st.activeId }));
        },

        restoreSession(session) {
          if (get().sessions.some((s) => s.id === session.id)) return;
          // Its run was cancelled on delete, so nothing is still streaming.
          set((st) => ({ sessions: [settle(session), ...st.sessions] }));
        },

        renameSession(id, title) {
          patchSession(id, (s) => ({ ...s, title: title.trim() || s.title }));
        },

        async send(prompt, attachments) {
          const text = prompt.trim();
          if (!text) return;
          let sid = get().activeId;
          // One run per session, whichever window started it.
          if (sid && (get().runs[sid] || isStreaming(get().sessions.find((s) => s.id === sid)))) return;
          const user: Message = {
            id: uid(),
            role: "user",
            parts: [{ type: "text", text }],
            createdAt: Date.now(),
            attachments: attachments?.length ? attachments : undefined,
          };
          if (!sid) {
            const now = Date.now();
            const session: Session = {
              id: uid(),
              section: get().section,
              title: titleFrom(text),
              createdAt: now,
              updatedAt: now,
              messages: [user],
            };
            sid = session.id;
            set((st) => ({ sessions: [session, ...st.sessions], activeId: session.id }));
          } else {
            patchSession(sid, (s) => ({ ...s, updatedAt: Date.now(), messages: [...s.messages, user] }));
          }
          await run(sid, text);
        },

        stop(sessionId) {
          const sid = sessionId ?? get().activeId;
          if (!sid) return;
          const runId = get().runs[sid];
          if (runId && runId !== "pending") agent.cancelRun(runId).catch(console.error);
        },

        retry() {
          const sid = get().activeId;
          if (!sid || get().runs[sid]) return;
          const session = get().sessions.find((s) => s.id === sid);
          if (!session || isStreaming(session)) return;
          const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
          if (!lastUser) return;
          const idx = session.messages.lastIndexOf(lastUser);
          patchSession(sid, (s) => ({ ...s, messages: s.messages.slice(0, idx + 1) }));
          void run(sid, messageText(lastUser));
        },

        answerPermission(tool, allow) {
          if (!tool.permissionId) return;
          const pid = tool.permissionId;
          // Optimistically clear the prompt so double-clicks don't resend.
          const sid = get().activeId;
          if (sid) {
            set((st) => ({
              sessions: st.sessions.map((s) =>
                s.id !== sid
                  ? s
                  : {
                      ...s,
                      messages: s.messages.map((m) => ({
                        ...m,
                        parts: m.parts.map((p) =>
                          p.type === "tool" && p.id === tool.id
                            ? { ...p, permissionId: undefined, status: allow ? "running" : p.status }
                            : p,
                        ),
                      })),
                    },
              ),
            }));
          }
          agent.respondPermission(pid, allow).catch(console.error);
        },

        setModel: (model) => set({ model }),
        setMode: (mode) => set({ mode }),
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
          const next = open ?? !(get().terminalOpen && isAgentSection(get().section));
          // The terminal belongs to the agent sections; opening it from Chat switches to one.
          if (next) get().enterAgentSection();
          set({ terminalOpen: next });
          if (next && get().terminals.length === 0) get().newTerminal();
        },
        newTerminal() {
          if (cliActive(get())) return;
          const tab: TerminalTab = { id: uid() };
          set((st) => ({ terminals: [...st.terminals, tab], activeTerminal: tab.id, terminalOpen: true }));
        },
        closeTerminal(id) {
          set((st) => {
            const i = st.terminals.findIndex((t) => t.id === id);
            if (i < 0) return {};
            const terminals = st.terminals.filter((t) => t.id !== id);
            const activeTerminal =
              st.activeTerminal === id ? (terminals[Math.min(i, terminals.length - 1)]?.id ?? null) : st.activeTerminal;
            return { terminals, activeTerminal, terminalOpen: terminals.length > 0 && st.terminalOpen };
          });
        },
        setActiveTerminal: (activeTerminal) => set({ activeTerminal }),
        setTerminalShell: (id, shell) =>
          set((st) => ({ terminals: st.terminals.map((t) => (t.id === id ? { ...t, shell } : t)) })),
        setTerminalHeight: (terminalHeight) => set({ terminalHeight }),
        openSettings: (tab) => set((st) => ({ settingsOpen: true, settingsTab: tab ?? st.settingsTab })),
        signIn: (account) => set({ account }),
        signOut: () => set({ account: null }),
        updateAccount: (patch) => set((st) => (st.account ? { account: { ...st.account, ...patch } } : {})),

        async shutdown() {
          const { runs } = get();
          const cancels = Object.values(runs).map((runId) => (runId === "pending" ? null : agent.cancelRun(runId)));
          set((st) => ({ sessions: st.sessions.map((s) => (runs[s.id] ? settle(s) : s)), runs: {} }));
          await Promise.allSettled([...cancels, pty.killAll()]);
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => ({
        getItem: (key) => localStorage.getItem(key),
        // Taking over another window's changes must not echo them back (see `adopt`).
        setItem: (key, value) => {
          if (!adopting) localStorage.setItem(key, value);
        },
        removeItem: (key) => localStorage.removeItem(key),
      })),
      // v1 had no sections: existing sessions become Work sessions.
      migrate: (persisted, version) => {
        const p = persisted as Omit<Partial<State>, "mode"> & { mode?: Mode };
        if (version < 2) {
          p.sessions = (p.sessions ?? []).map((s) => ({ ...s, section: s.section ?? "work" }));
          if (p.mode === "chat") p.mode = "agent";
        }
        return p as State;
      },
      partialize: (s) => ({
        sessions: s.sessions,
        activeId: s.activeId,
        section: s.section,
        agentSection: s.agentSection,
        lastActive: s.lastActive,
        codeView: s.codeView,
        cli: s.cli,
        model: s.model,
        mode: s.mode,
        settings: s.settings,
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
if (useStore.persist.hasHydrated()) settleDeadRuns();
else useStore.persist.onFinishHydration(settleDeadRuns);
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
  let saved: Partial<Pick<State, "sessions" | "settings" | "account">> | undefined;
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
      return {
        sessions,
        settings: saved.settings ?? st.settings,
        account: saved.account === undefined ? st.account : saved.account,
        // The open session may have been deleted in the other window.
        activeId: sessions.some((s) => s.id === st.activeId) ? st.activeId : null,
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
