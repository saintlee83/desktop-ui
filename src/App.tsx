import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import * as actions from "./lib/actions";
import { PANEL_W, SIDEBAR_W, cliActive, isAgentic, useStore } from "./lib/store";
import { inTauri } from "./lib/agent";
import { SECTIONS } from "./lib/sections";
import { useApplyTheme } from "./lib/theme";
import type { ToolPart } from "./lib/types";
import { cssZoom, cx, isMac } from "./lib/util";
import { onWindowClose } from "./lib/windows";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { Home, Thread } from "./components/Thread";
import { Composer } from "./components/Composer";
import { RightPanel } from "./components/RightPanel";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsDialog } from "./components/SettingsDialog";
import { ProjectDialog } from "./components/ProjectDialog";
import { TerminalDrawer } from "./components/TerminalDrawer";
import { CliView } from "./components/CliView";
import { Tooltips } from "./components/Tooltip";
import { Toaster } from "./components/Toaster";
import { ColResizer } from "./components/ui";

/** Applies the zoom setting: native webview zoom in Tauri, CSS zoom in a plain browser. */
function useZoom() {
  const zoom = useStore((s) => s.settings.zoom ?? 1);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--zoom", String(zoom));
    const cssZoom = () => {
      root.style.zoom = String(zoom);
    };
    if (inTauri) {
      getCurrentWebview()
        .setZoom(zoom)
        .catch((e) => {
          console.error("setZoom failed, falling back to CSS zoom", e);
          cssZoom();
        });
    } else {
      cssZoom();
    }
  }, [zoom]);
}

/** Brief "110%" pill whenever the zoom level changes (not on first render). */
function ZoomIndicator() {
  const zoom = useStore((s) => s.settings.zoom ?? 1);
  const prev = useRef(zoom);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (prev.current === zoom) return;
    prev.current = zoom;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1100);
    return () => clearTimeout(t);
  }, [zoom]);
  return (
    <div className={cx("zoom-toast", show && "show")} role="status" aria-live="polite">
      {Math.round(zoom * 100)}%
    </div>
  );
}

/** The tool call waiting on Allow/Deny in the open session, if any. */
function pendingPermission(): ToolPart | null {
  const s = useStore.getState();
  const session = s.sessions.find((x) => x.id === s.activeId);
  for (const m of session?.messages ?? []) {
    for (const p of m.parts) if (p.type === "tool" && p.status === "awaiting" && p.permissionId) return p;
  }
  return null;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const inTerminal = !!target?.closest?.(".xterm");

      // Ctrl+` toggles the terminal, Ctrl+Shift+` opens a new one (VS Code convention, all platforms).
      if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "`" || e.key === "~" || e.code === "Backquote")) {
        e.preventDefault();
        if (e.shiftKey) {
          s.enterAgent();
          s.newTerminal();
        } else s.toggleTerminal();
        return;
      }
      // Inside a terminal, Esc belongs to programs like vim and Ctrl+letter to the shell (Ctrl+N, Ctrl+K, …).
      // Off macOS that leaves the app only the Ctrl+Shift combinations there.
      if (inTerminal && (e.key === "Escape" || (!isMac && !e.shiftKey))) return;

      // A dialog over the window takes the keys that would otherwise act on the session behind it.
      const modal = s.paletteOpen || s.settingsOpen || !!s.projectDialog;
      if (e.key === "Escape" && s.activeId && s.runs[s.activeId] && !modal) {
        // Esc first closes whatever is open (a menu, a rename, a search) before it stops the agent.
        const busy = document.querySelector("[data-esc-layer]") || target?.matches?.(".rename-input, .sidebar-search input");
        if (!busy) s.stop();
        return;
      }
      if (!mod) return;
      const k = e.key.toLowerCase();

      // Permission prompt: ⌘↵ allows, ⌘⌫ denies (unless that would eat text being edited).
      if ((e.key === "Enter" || e.key === "Backspace") && !e.shiftKey && !e.altKey && !inTerminal && !modal) {
        const tool = pendingPermission();
        const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value !== "" : false;
        if (tool && !(e.key === "Backspace" && editing)) {
          e.preventDefault();
          e.stopPropagation();
          s.answerPermission(tool, e.key === "Enter");
          return;
        }
      }

      // Zoom: ⌘/Ctrl with = or + (Shift allowed, since + is Shift+= on most layouts), −, 0.
      if (!e.altKey) {
        const zoom =
          k === "=" || k === "+" || e.code === "NumpadAdd"
            ? () => s.zoomBy(1)
            : k === "-" || k === "_" || e.code === "NumpadSubtract"
              ? () => s.zoomBy(-1)
              : (k === "0" || e.code === "Numpad0") && !e.shiftKey
                ? () => s.resetZoom()
                : null;
        if (zoom) {
          e.preventDefault();
          zoom();
          return;
        }
      }

      if (e.altKey) return;
      // Brackets by position, so ⇧⌘[ works whatever character Shift turns the key into.
      const key = e.code === "BracketLeft" ? "[" : e.code === "BracketRight" ? "]" : k;

      // These work everywhere, also over the palette and settings.
      const global: Record<string, () => void> = e.shiftKey
        ? { n: actions.newWindow, l: actions.toggleTheme }
        : { k: () => s.setPalette(!s.paletteOpen), ",": () => s.setSettingsOpen(true) };
      // These act on the window behind a dialog, so they wait until it is closed.
      const local: Record<string, () => void> = e.shiftKey
        ? {
            m: actions.toggleMode,
            t: actions.toggleCli,
            "[": () => actions.stepSession(-1),
            "]": () => actions.stepSession(1),
            backspace: actions.deleteActiveSession,
            // In a terminal ⇧⌘C is the terminal's own copy.
            ...(inTerminal ? {} : { c: () => void actions.copyLastResponse() }),
          }
        : {
            n: () => s.newSession(),
            b: () => s.toggleSidebar(),
            j: () => s.togglePanel(),
            o: () => void actions.addFolder(),
            f: actions.focusSearch,
            l: actions.focusComposer,
            // ⌘1 / ⌘2 jump to a section.
            ...Object.fromEntries(SECTIONS.map((sec) => [sec.key, () => s.setSection(sec.id)])),
          };
      // ⌘/ lists the shortcuts; on layouts where "/" needs Shift it still counts.
      const run = k === "/" ? () => s.openSettings("shortcuts") : (global[key] ?? (modal ? undefined : local[key]));
      if (run) {
        e.preventDefault();
        run();
      }
    };
    // Capture phase so shortcuts still work while focus is inside the terminal.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

export default function App() {
  const loadModels = useStore((s) => s.loadModels);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const panelWidth = useStore((s) => s.panelWidth);
  const { setSidebarWidth, setPanelWidth } = useStore.getState();
  const app = useRef<HTMLDivElement>(null);
  // The side panel (changes / commands / context) comes with the agent's tools: Code, or a chat with a folder.
  const panelOpen = useStore((s) => s.panelOpen && isAgentic(s) && !cliActive(s));
  const hasSession = useStore((s) => s.sessions.some((x) => x.id === s.activeId));
  const cli = useStore(cliActive);
  useApplyTheme();
  useZoom();
  useShortcuts();

  useEffect(() => {
    loadModels().catch(console.error);
  }, [loadModels]);

  // A closing window stops its runs and shells, so other windows aren't left showing them as live.
  useEffect(() => onWindowClose(() => useStore.getState().shutdown()), []);

  const setVar = (name: string) => (px: number) => app.current?.style.setProperty(name, `${px}px`);
  const widths = { "--sidebar-w-user": `${sidebarWidth}px`, "--panel-w-user": `${panelWidth}px` } as CSSProperties;

  return (
    <div
      ref={app}
      className={cx("app", isMac && "platform-mac", sidebarOpen && "sidebar-open", panelOpen && "panel-open")}
      style={widths}
    >
      <TitleBar />
      <div className="body">
        <Sidebar />
        {sidebarOpen && (
          <ColResizer
            edge="right"
            label="Resize sidebar"
            width={sidebarWidth}
            min={SIDEBAR_W[0]}
            max={() => SIDEBAR_W[2]}
            apply={setVar("--sidebar-w-user")}
            commit={setSidebarWidth}
            reset={() => setSidebarWidth(SIDEBAR_W[1])}
          />
        )}
        {panelOpen && (
          <ColResizer
            edge="left"
            label="Resize side panel"
            width={panelWidth}
            min={PANEL_W[0]}
            // Leave the conversation at least 420px.
            max={() => Math.min(PANEL_W[2], window.innerWidth / cssZoom() - (sidebarOpen ? sidebarWidth : 0) - 420)}
            apply={setVar("--panel-w-user")}
            commit={setPanelWidth}
            reset={() => setPanelWidth(PANEL_W[1])}
          />
        )}
        <main className="main">
          {/* Hidden, not unmounted, behind Code's terminal view: the draft and scroll position survive. */}
          <div className="main-content" hidden={cli}>
            {hasSession ? (
              <>
                <Thread />
                <Composer />
              </>
            ) : (
              <Home />
            )}
          </div>
          <CliView />
          <TerminalDrawer />
        </main>
        <RightPanel />
      </div>
      <CommandPalette />
      <SettingsDialog />
      <ProjectDialog />
      <ZoomIndicator />
      <Toaster />
      <Tooltips />
    </div>
  );
}
