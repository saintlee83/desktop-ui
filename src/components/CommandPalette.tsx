import { useEffect, useMemo, useRef, useState } from "react";
import { AppWindow, Archive, ArrowDown, ArrowUp, Bot, Contrast, Copy, Download, Folder, FolderMinus, FolderOpen, FolderPlus, Keyboard, Layers, ListFilter, Map as MapIcon, MessagesSquare, Moon, PanelLeft, PanelRight, Pin, PinOff, Search, SearchX, Settings, Settings2, SquarePen, Sun, Cpu, TextCursorInput, Trash2, ZoomIn, ZoomOut, Maximize2, SquareTerminal, TerminalSquare } from "lucide-react";
import * as actions from "../lib/actions";
import { folderName } from "../lib/folders";
import { currentLang, tn, useT } from "../lib/i18n";
import { SECTIONS, sectionInfo } from "../lib/sections";
import { activeMode, activeModel, cliActive, currentFolder, isAgentic, sessionCli, sessionOnScreen, useStore } from "../lib/store";
import { exportSession } from "../lib/data";
import { SCHEMES, schemeInfo } from "../lib/theme";
import { composing, cx, isMac, mod, modShift, relativeTime, trapTab, usePresence, useRestoreFocus, zoomKeys } from "../lib/util";
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
  const t = useT();
  // Items are built in the current language, so a language change builds them again.
  const lang = currentLang();
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
    const chat = s.section === "chat";
    // Groups are named in the language shown: the filter matches what the user reads.
    const actionsGroup = t("Actions");
    const projectsGroup = t("Projects");
    const modesGroup = t("Modes");
    const cli = cliActive(s);
    // The terminal view showing the session itself works on it like the chat does.
    const sessionView = sessionCli(s);
    const openSession = s.sessions.find((x) => x.id === sessionOnScreen(s));
    const open = !!openSession;
    const mode = activeMode(s);
    const current = activeModel(s);
    const folder = currentFolder(s);
    const project = s.projects.find((p) => p.id === s.projectId);
    const scheme = schemeInfo(s.settings.scheme).id;
    // Modes only apply where the agent has tools; in a plain chat choosing one asks for a folder.
    const moded = (!cli || sessionView) && isAgentic(s);
    const projectName = (id: string | null | undefined) => s.projects.find((p) => p.id === id)?.name;
    return [
      { id: "new", label: chat ? t("New chat") : t("New session"), group: actionsGroup, icon: SquarePen, keys: `${mod}N`, run: s.newSession },
      { id: "new-window", label: t("New window"), group: actionsGroup, icon: AppWindow, keys: `${modShift}N`, run: actions.newWindow },
      { id: "search", label: chat ? t("Search chats") : t("Search sessions"), group: actionsGroup, icon: ListFilter, keys: `${mod}F`, run: actions.focusSearch },
      { id: "focus", label: cli ? t("Focus the terminal") : t("Focus the message box"), group: actionsGroup, icon: TextCursorInput, keys: `${mod}L`, run: actions.focusComposer },
      { id: "prev", label: chat ? t("Previous chat") : t("Previous session"), group: actionsGroup, icon: ArrowUp, keys: `${modShift}[`, run: () => actions.stepSession(-1) },
      { id: "next", label: chat ? t("Next chat") : t("Next session"), group: actionsGroup, icon: ArrowDown, keys: `${modShift}]`, run: () => actions.stepSession(1) },
      ...(open
        ? [
            { id: "copy-last", label: t("Copy last response"), group: actionsGroup, icon: Copy, keys: `${modShift}C`, run: () => void actions.copyLastResponse() },
            { id: "delete", label: chat ? t("Delete this chat") : t("Delete this session"), group: actionsGroup, icon: Trash2, keys: isMac ? "⇧⌘⌫" : "Ctrl+Shift+⌫", run: actions.deleteActiveSession },
            { id: "export", label: chat ? t("Export this chat as Markdown…") : t("Export this session as Markdown…"), group: actionsGroup, icon: Download, run: () => void exportSession(openSession!) },
            openSession!.pinned
              ? { id: "unpin", label: chat ? t("Unpin this chat") : t("Unpin this session"), group: actionsGroup, icon: PinOff, run: () => s.setPinned(openSession!.id, false) }
              : { id: "pin", label: chat ? t("Pin this chat") : t("Pin this session"), group: actionsGroup, icon: Pin, run: () => s.setPinned(openSession!.id, true) },
            { id: "archive", label: chat ? t("Archive this chat") : t("Archive this session"), group: actionsGroup, icon: Archive, run: () => s.setArchived(openSession!.id, true) },
          ]
        : []),
      { id: "sidebar", label: t("Toggle sidebar"), group: actionsGroup, icon: PanelLeft, keys: `${mod}B`, run: s.toggleSidebar },
      { id: "panel", label: t("Toggle side panel"), group: actionsGroup, icon: PanelRight, keys: `${mod}J`, run: () => s.togglePanel() },
      { id: "theme", label: dark ? t("Switch to light theme") : t("Switch to dark theme"), group: actionsGroup, icon: dark ? Sun : Moon, keys: `${modShift}L`, run: actions.toggleTheme },
      { id: "settings", label: t("Open settings"), group: actionsGroup, icon: Settings, keys: `${mod},`, run: () => s.setSettingsOpen(true) },
      { id: "shortcuts", label: t("Keyboard shortcuts"), group: actionsGroup, icon: Keyboard, keys: `${mod}/`, run: () => s.openSettings("shortcuts") },
      { id: "terminal", label: t("Toggle terminal"), group: actionsGroup, icon: SquareTerminal, keys: "Ctrl+`", run: () => s.toggleTerminal() },
      { id: "terminal-new", label: t("New terminal"), group: actionsGroup, icon: TerminalSquare, keys: "Ctrl+Shift+`", run: () => { s.enterAgent(); s.newTerminal(); } },
      ...(cli && !sessionView
        ? []
        : [
            { id: "folder", label: folder ? t("Change folder ({folder})…", { folder: folderName(folder) }) : t("Add folder…"), group: actionsGroup, icon: FolderOpen, keys: `${mod}O`, run: () => void actions.addFolder() },
            ...(folder ? [{ id: "folder-remove", label: t("Remove folder"), group: actionsGroup, icon: FolderMinus, run: () => s.setFolder(null) }] : []),
          ]),
      { id: "zoom-in", label: t("Zoom in"), group: actionsGroup, icon: ZoomIn, keys: zoomKeys.in, run: () => s.zoomBy(1) },
      { id: "zoom-out", label: t("Zoom out"), group: actionsGroup, icon: ZoomOut, keys: zoomKeys.out, run: () => s.zoomBy(-1) },
      { id: "zoom-reset", label: t("Reset zoom"), group: actionsGroup, icon: Maximize2, keys: zoomKeys.reset, run: s.resetZoom },
      ...SECTIONS.map((x) => ({ id: `go-${x.id}`, label: t("Go to {section}", { section: t(x.label) }), group: t("Sections"), icon: x.icon, keys: `${mod}${x.key}`, run: () => s.setSection(x.id) })),
      { id: "project-new", label: t("New project…"), group: projectsGroup, icon: FolderPlus, run: () => s.openProjectDialog() },
      ...(project
        ? [
            { id: "project-edit", label: t("Edit project “{name}”…", { name: project.name }), group: projectsGroup, icon: Settings2, run: () => s.openProjectDialog(project.id) },
            { id: "project-all", label: chat ? t("Show all chats") : t("Show all sessions"), group: projectsGroup, icon: Layers, run: () => s.setProject(null) },
          ]
        : []),
      ...s.projects
        .filter((p) => p.id !== s.projectId)
        .map((p) => ({ id: `project-${p.id}`, label: t("Go to project: {name}", { name: p.name }), group: projectsGroup, icon: Folder, hint: p.folder ? folderName(p.folder) : undefined, run: () => s.setProject(p.id) })),
      { id: "mode-agent", label: t("Mode: Agent"), group: modesGroup, icon: Bot, keys: mode === "plan" && moded ? `${modShift}M` : undefined, hint: mode === "agent" && moded ? t("current") : undefined, run: () => actions.chooseMode("agent") },
      { id: "mode-plan", label: t("Mode: Plan"), group: modesGroup, icon: MapIcon, keys: mode === "agent" && moded ? `${modShift}M` : undefined, hint: mode === "plan" && moded ? t("current") : undefined, run: () => actions.chooseMode("plan") },
      cli
        ? { id: "mode-gui", label: t("Back to the chat"), group: modesGroup, icon: MessagesSquare, keys: `${modShift}T`, run: actions.toggleCli }
        : { id: "mode-terminal", label: t("Mode: Terminal (Code as a CLI)"), group: modesGroup, icon: SquareTerminal, keys: `${modShift}T`, run: actions.toggleCli },
      ...models.map((m) => ({ id: `model-${m.id}`, label: t("Model: {name}", { name: m.name }), group: t("Models"), icon: Cpu, hint: m.id === current ? t("{provider} · current", { provider: m.provider }) : m.provider, run: () => s.setModel(m.id) })),
      ...SCHEMES.map((x) => ({ id: `scheme-${x.id}`, label: t("Color scheme: {name}", { name: t(x.name) }), group: t("Color schemes"), icon: Contrast, hint: x.id === scheme ? t("current") : t(x.hint), run: () => s.updateSettings({ scheme: x.id }) })),
      ...[...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((x) => ({
          id: `s-${x.id}`,
          label: x.title,
          group: t("Recent"),
          icon: sectionInfo(x.section).icon,
          hint: [projectName(x.projectId), t(sectionInfo(x.section).label), relativeTime(x.updatedAt)].filter(Boolean).join(" · "),
          run: () => s.selectSession(x.id),
        })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, projects, models, model, open, lang]);

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
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={trapTab} role="dialog" aria-modal aria-label={t("Command palette")}>
        <div className="palette-input">
          <Search size={16} />
          <input
            autoFocus
            placeholder={t("Type a command or search chats and sessions…")}
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
              } else if (e.key === "Enter" && !composing(e)) {
                e.preventDefault();
                runItem(filtered[index]);
              } else if (e.key === "Escape") {
                close();
              }
            }}
          />
          <Keys combo="esc" />
        </div>
        <div className="palette-list" ref={listRef} id="palette-list" role="listbox" aria-label={t("Commands")}>
          {filtered.length === 0 && (
            <div className="palette-empty">
              <SearchX size={18} />
              <span>
                {/* The query sits where the language puts it, in bold. */}
                {t("Nothing matches {query}")
                  .split(/(\{query\})/)
                  .map((part, i) => (part === "{query}" ? <strong key={i}>“{query.trim()}”</strong> : part))}
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
            <Keys combo="↓" /> {t("navigate")}
          </span>
          <span>
            <Keys combo="↵" /> {t("select")}
          </span>
          <span className="spacer" />
          <span>
            {tn(filtered.length, "{n} result", "{n} results")}
          </span>
        </div>
      </div>
    </div>
  );
}
