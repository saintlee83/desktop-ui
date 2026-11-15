import { useEffect, useMemo, useRef, useState } from "react";
import { AppWindow, ArrowDown, ArrowUp, Bot, Contrast, Copy, Folder, FolderMinus, FolderOpen, FolderPlus, Keyboard, Layers, ListFilter, Map as MapIcon, MessagesSquare, Moon, PanelLeft, PanelRight, Search, SearchX, Settings, Settings2, SquarePen, Sun, Cpu, TextCursorInput, Trash2, ZoomIn, ZoomOut, Maximize2, SquareTerminal, TerminalSquare } from "lucide-react";
import * as actions from "../lib/actions";
import { folderName } from "../lib/folders";
import { SECTIONS, sectionInfo } from "../lib/sections";
import { cliActive, currentFolder, isAgentic, useStore } from "../lib/store";
import { SCHEMES, schemeInfo } from "../lib/theme";
import { cx, isMac, mod, modShift, relativeTime, trapTab, usePresence, useRestoreFocus, zoomKeys } from "../lib/util";
import { Highlight, Keys } from "./ui";

interface Item {
  id: string;
  label: string;
  group: string;
  icon: typeof Search;
  /** Keyboard shortcut, shown as key caps. */
  keys?: string;
  /** Plain trailing text (provider, section, time). */
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const sessions = useStore((s) => s.sessions);
  const projects = useStore((s) => s.projects);
  const models = useStore((s) => s.models);
  const model = useStore((s) => s.model);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { mounted, closing } = usePresence(open, 140);
  useRestoreFocus(open);

  const items = useMemo<Item[]>(() => {
    const s = useStore.getState();
    const dark = document.documentElement.dataset.theme === "dark";
    const noun = s.section === "chat" ? "chat" : "session";
    const cli = cliActive(s);
    const open = !cli && s.sessions.some((x) => x.id === s.activeId);
    const folder = currentFolder(s);
    const project = s.projects.find((p) => p.id === s.projectId);
    const scheme = schemeInfo(s.settings.scheme).id;
    // Modes only apply where the agent has tools; in a plain chat choosing one asks for a folder.
    const moded = !cli && isAgentic(s);
    const projectName = (id: string | null | undefined) => s.projects.find((p) => p.id === id)?.name;
    return [
      { id: "new", label: `New ${noun}`, group: "Actions", icon: SquarePen, keys: `${mod}N`, run: s.newSession },
      { id: "new-window", label: "New window", group: "Actions", icon: AppWindow, keys: `${modShift}N`, run: actions.newWindow },
      { id: "search", label: `Search ${noun}s`, group: "Actions", icon: ListFilter, keys: `${mod}F`, run: actions.focusSearch },
      { id: "focus", label: cli ? "Focus the terminal" : "Focus the message box", group: "Actions", icon: TextCursorInput, keys: `${mod}L`, run: actions.focusComposer },
      { id: "prev", label: `Previous ${noun}`, group: "Actions", icon: ArrowUp, keys: `${modShift}[`, run: () => actions.stepSession(-1) },
      { id: "next", label: `Next ${noun}`, group: "Actions", icon: ArrowDown, keys: `${modShift}]`, run: () => actions.stepSession(1) },
      ...(open
        ? [
            { id: "copy-last", label: "Copy last response", group: "Actions", icon: Copy, keys: `${modShift}C`, run: () => void actions.copyLastResponse() },
            { id: "delete", label: `Delete this ${noun}`, group: "Actions", icon: Trash2, keys: isMac ? "⇧⌘⌫" : "Ctrl+Shift+⌫", run: actions.deleteActiveSession },
          ]
        : []),
      { id: "sidebar", label: "Toggle sidebar", group: "Actions", icon: PanelLeft, keys: `${mod}B`, run: s.toggleSidebar },
      { id: "panel", label: "Toggle side panel", group: "Actions", icon: PanelRight, keys: `${mod}J`, run: () => s.togglePanel() },
      { id: "theme", label: dark ? "Switch to light theme" : "Switch to dark theme", group: "Actions", icon: dark ? Sun : Moon, keys: `${modShift}L`, run: actions.toggleTheme },
      { id: "settings", label: "Open settings", group: "Actions", icon: Settings, keys: `${mod},`, run: () => s.setSettingsOpen(true) },
      { id: "shortcuts", label: "Keyboard shortcuts", group: "Actions", icon: Keyboard, keys: `${mod}/`, run: () => s.openSettings("shortcuts") },
      { id: "terminal", label: "Toggle terminal", group: "Actions", icon: SquareTerminal, keys: "Ctrl+`", run: () => s.toggleTerminal() },
      { id: "terminal-new", label: "New terminal", group: "Actions", icon: TerminalSquare, keys: "Ctrl+Shift+`", run: () => { s.enterAgent(); s.newTerminal(); } },
      ...(cli
        ? []
        : [
            { id: "folder", label: folder ? `Change folder (${folderName(folder)})…` : "Add folder…", group: "Actions", icon: FolderOpen, keys: `${mod}O`, run: () => void actions.addFolder() },
            ...(folder ? [{ id: "folder-remove", label: "Remove folder", group: "Actions", icon: FolderMinus, run: () => s.setFolder(null) }] : []),
          ]),
      { id: "zoom-in", label: "Zoom in", group: "Actions", icon: ZoomIn, keys: zoomKeys.in, run: () => s.zoomBy(1) },
      { id: "zoom-out", label: "Zoom out", group: "Actions", icon: ZoomOut, keys: zoomKeys.out, run: () => s.zoomBy(-1) },
      { id: "zoom-reset", label: "Reset zoom", group: "Actions", icon: Maximize2, keys: zoomKeys.reset, run: s.resetZoom },
      ...SECTIONS.map((x) => ({ id: `go-${x.id}`, label: `Go to ${x.label}`, group: "Sections", icon: x.icon, keys: `${mod}${x.key}`, run: () => s.setSection(x.id) })),
      { id: "project-new", label: "New project…", group: "Projects", icon: FolderPlus, run: () => s.openProjectDialog() },
      ...(project
        ? [
            { id: "project-edit", label: `Edit project “${project.name}”…`, group: "Projects", icon: Settings2, run: () => s.openProjectDialog(project.id) },
            { id: "project-all", label: `Show all ${noun}s`, group: "Projects", icon: Layers, run: () => s.setProject(null) },
          ]
        : []),
      ...s.projects
        .filter((p) => p.id !== s.projectId)
        .map((p) => ({ id: `project-${p.id}`, label: `Go to project: ${p.name}`, group: "Projects", icon: Folder, hint: p.folder ? folderName(p.folder) : undefined, run: () => s.setProject(p.id) })),
      { id: "mode-agent", label: "Mode: Agent", group: "Modes", icon: Bot, keys: s.mode === "plan" && moded ? `${modShift}M` : undefined, hint: s.mode === "agent" && moded ? "current" : undefined, run: () => actions.chooseMode("agent") },
      { id: "mode-plan", label: "Mode: Plan", group: "Modes", icon: MapIcon, keys: s.mode === "agent" && moded ? `${modShift}M` : undefined, hint: s.mode === "plan" && moded ? "current" : undefined, run: () => actions.chooseMode("plan") },
      cli
        ? { id: "mode-gui", label: "Back to the chat", group: "Modes", icon: MessagesSquare, keys: `${modShift}T`, run: actions.toggleCli }
        : { id: "mode-terminal", label: "Mode: Terminal (CLI agent in Code)", group: "Modes", icon: SquareTerminal, keys: `${modShift}T`, run: actions.toggleCli },
      ...models.map((m) => ({ id: `model-${m.id}`, label: `Model: ${m.name}`, group: "Models", icon: Cpu, hint: m.id === model ? `${m.provider} · current` : m.provider, run: () => s.setModel(m.id) })),
      ...SCHEMES.map((x) => ({ id: `scheme-${x.id}`, label: `Color scheme: ${x.name}`, group: "Color schemes", icon: Contrast, hint: x.id === scheme ? "current" : x.hint, run: () => s.updateSettings({ scheme: x.id }) })),
      ...[...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((x) => ({
          id: `s-${x.id}`,
          label: x.title,
          group: "Recent",
          icon: sectionInfo(x.section).icon,
          hint: [projectName(x.projectId), sectionInfo(x.section).label, relativeTime(x.updatedAt)].filter(Boolean).join(" · "),
          run: () => s.selectSession(x.id),
        })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, projects, models, model, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const words = q.split(/\s+/);
    return items.filter((i) => words.every((w) => `${i.label} ${i.group}`.toLowerCase().includes(w)));
  }, [items, query]);

  // Each opening starts empty. Reset while rendering, not in an effect: an effect runs a moment
  // after the palette is on screen, and a key typed in that moment would be added to the old query.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!mounted) return null;
  const close = () => useStore.getState().setPalette(false);
  const runItem = (i: Item | undefined) => {
    if (!i) return;
    close();
    i.run();
  };
  const move = (to: number) => setIndex(filtered.length ? (to + filtered.length) % filtered.length : 0);

  let lastGroup = "";
  return (
    <div className={cx("overlay", closing && "closing")} onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={trapTab} role="dialog" aria-modal aria-label="Command palette">
        <div className="palette-input">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Type a command or search chats and sessions…"
            value={query}
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={filtered[index] ? `palette-${index}` : undefined}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                move(index + 1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                move(index - 1);
              } else if (e.key === "Home" && !query) {
                e.preventDefault();
                move(0);
              } else if (e.key === "End" && !query) {
                e.preventDefault();
                move(filtered.length - 1);
              } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                runItem(filtered[index]);
              } else if (e.key === "Escape") {
                close();
              }
            }}
          />
          <Keys combo="esc" />
        </div>
        <div className="palette-list" ref={listRef} id="palette-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 && (
            <div className="palette-empty">
              <SearchX size={18} />
              <span>
                Nothing matches <strong>“{query.trim()}”</strong>
              </span>
            </div>
          )}
          {filtered.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id} role="presentation">
                {header && <div className="menu-label">{header}</div>}
                <button
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === index}
                  tabIndex={-1}
                  data-index={i}
                  className={cx("palette-item", i === index && "on")}
                  onMouseMove={() => i !== index && setIndex(i)}
                  onClick={() => runItem(item)}
                >
                  <span className="palette-icon">
                    <item.icon size={15} />
                  </span>
                  <span className="palette-label">
                    <Highlight text={item.label} query={query} />
                  </span>
                  {item.hint && <span className="palette-hint">{item.hint}</span>}
                  {item.keys && <Keys combo={item.keys} />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span>
            <Keys combo="↑" />
            <Keys combo="↓" /> navigate
          </span>
          <span>
            <Keys combo="↵" /> select
          </span>
          <span className="spacer" />
          <span>
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
