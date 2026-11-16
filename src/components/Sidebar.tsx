import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Download,
  Folder,
  FolderMinus,
  FolderPlus,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  SearchX,
  Settings2,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { deleteManyWithUndo, deleteProjectWithUndo, deleteWithUndo } from "../lib/actions";
import { exportSession } from "../lib/data";
import { folderName } from "../lib/folders";
import { currentLang, tn, useT } from "../lib/i18n";
import { inScope, isStreaming, messageText, sessionOnScreen, useStore } from "../lib/store";
import { toast } from "../lib/toast";
import type { Project, Session } from "../lib/types";
import { composing, cx, dateGroup, isMac, mod, relativeTime } from "../lib/util";
import { Highlight, Keys, Spinner, tip } from "./ui";
import { AccountMenu } from "./AccountMenu";
import { ContextMenu, anchorBelow, type MenuAnchor, type MenuEntry } from "./ContextMenu";

type OpenMenu = { at: MenuAnchor } & ({ session: Session } | { project: Project });

/** Where the query turns up in a session's messages, as a short excerpt; null when it doesn't. */
function excerpt(session: Session, q: string): string | null {
  for (const m of session.messages) {
    const text = messageText(m);
    const at = text.toLowerCase().indexOf(q);
    if (at < 0) continue;
    const start = Math.max(0, at - 24);
    const end = Math.min(text.length, at + q.length + 40);
    return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
  }
  return null;
}

export function Sidebar() {
  const t = useT();
  const sessions = useStore((s) => s.sessions);
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const runs = useStore((s) => s.runs);
  const section = useStore((s) => s.section);
  // Behind another CLI in Code's terminal view no session is on screen, so none is marked as open.
  const openId = useStore(sessionOnScreen);
  const chat = section === "chat";
  const { newSession, selectSession, renameSession, setProject, openProjectDialog, moveSession } = useStore.getState();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  // Several sessions picked with ⌘-click or ⇧-click, to archive or delete at once.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const closeMenu = useCallback(() => setMenu(null), []);
  const list = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const cancelRename = useRef(false);
  const project = projects.find((p) => p.id === projectId) ?? null;
  const q = query.trim().toLowerCase();

  /** The sessions listed, with an excerpt where the query matched a message rather than the title. */
  const { groups, archived, excerpts } = useMemo(() => {
    const excerpts = new Map<string, string>();
    const matches = (s: Session) => {
      if (!q || s.title.toLowerCase().includes(q)) return true;
      const hit = excerpt(s, q);
      if (hit) excerpts.set(s.id, hit);
      return !!hit;
    };
    const list = sessions.filter((s) => inScope(s, { section, projectId }) && matches(s)).sort((a, b) => b.updatedAt - a.updatedAt);
    // A search looks in the archive too; otherwise it stays folded away at the bottom.
    const archived = q ? [] : list.filter((s) => s.archived);
    const shown = q ? list : list.filter((s) => !s.archived);
    const out: { label: string; items: Session[] }[] = [];
    const pinned = shown.filter((s) => s.pinned);
    if (pinned.length) out.push({ label: "Pinned", items: pinned });
    for (const s of shown) {
      if (s.pinned) continue;
      const label = dateGroup(s.updatedAt);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(s);
      else out.push({ label, items: [s] });
    }
    return { groups: out, archived, excerpts };
    // The date labels come out in the interface language, so a language change regroups.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, q, section, projectId, currentLang()]);
  /** Rows in the order they show, for ⇧-click ranges. */
  const order = useMemo(() => [...groups.flatMap((g) => g.items), ...(showArchived ? archived : [])], [groups, archived, showArchived]);
  const picked = order.filter((s) => selected.has(s.id));
  const clearSelection = () => setSelected(new Set());

  /** How many of this section's sessions each project holds ("" counts them all). */
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of sessions) {
      if (s.section !== section || s.archived) continue;
      out.set("", (out.get("") ?? 0) + 1);
      if (s.projectId) out.set(s.projectId, (out.get(s.projectId) ?? 0) + 1);
    }
    return out;
  }, [sessions, section]);
  const shownProjects = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;

  const rows = () => [...(list.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];

  /** Arrow keys walk every row of the list, projects and sessions alike. */
  const stepRow = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return false;
    e.preventDefault();
    const all = rows();
    const i = all.indexOf(e.currentTarget);
    if (e.key === "ArrowDown") all[i + 1]?.focus();
    else if (i > 0) all[i - 1].focus();
    else search.current?.focus();
    return true;
  };

  const onItemKey = (e: KeyboardEvent<HTMLDivElement>, s: Session) => {
    if (e.target !== e.currentTarget) return; // typing in the rename field
    if (stepRow(e)) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectSession(s.id);
    } else if (e.key === "F2") {
      e.preventDefault();
      setEditing(s.id);
    } else if (e.key === "Delete" || (e.key === "Backspace" && (isMac ? e.metaKey : e.ctrlKey))) {
      e.preventDefault();
      const all = rows();
      const i = all.indexOf(e.currentTarget);
      (all[i + 1] ?? all[i - 1] ?? search.current)?.focus();
      // With several picked, the key deletes them all.
      if (picked.length > 1 && selected.has(s.id)) {
        deleteManyWithUndo(picked);
        clearSelection();
      } else deleteWithUndo(s);
    } else if (e.key === "Escape" && selected.size) {
      clearSelection();
    }
  };

  /** A click opens the session; ⌘-click picks it too, ⇧-click picks everything from the last pick. */
  const onRowClick = (e: MouseEvent, s: Session) => {
    if (isMac ? e.metaKey : e.ctrlKey) {
      setSelected((sel) => {
        const next = new Set(sel);
        // The open session counts as picked once picking starts.
        if (!next.size && openId && openId !== s.id) next.add(openId);
        if (next.has(s.id)) next.delete(s.id);
        else next.add(s.id);
        return next;
      });
      anchor.current = s.id;
      return;
    }
    if (e.shiftKey) {
      const from = order.findIndex((x) => x.id === (anchor.current ?? openId));
      const to = order.findIndex((x) => x.id === s.id);
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        setSelected(new Set(order.slice(a, b + 1).map((x) => x.id)));
        return;
      }
    }
    clearSelection();
    anchor.current = s.id;
    selectSession(s.id);
  };

  const onProjectKey = (e: KeyboardEvent<HTMLElement>, p: Project | null) => {
    if (e.target !== e.currentTarget || stepRow(e)) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setProject(p?.id ?? null);
    } else if (e.key === "F2" && p) {
      e.preventDefault();
      openProjectDialog(p.id);
    }
  };

  const move = (s: Session, to: Project | null) => {
    if ((s.projectId ?? null) === (to?.id ?? null)) return;
    const from = projects.find((p) => p.id === s.projectId);
    moveSession(s.id, to?.id ?? null);
    toast(to ? t("Moved to “{name}”", { name: to.name }) : from ? t("Removed from “{name}”", { name: from.name }) : t("Removed from the project"));
  };

  const sessionMenu = (s: Session): MenuEntry[] => [
    { id: "rename", label: t("Rename"), icon: Pencil, kbd: "F2", run: () => setEditing(s.id) },
    s.pinned
      ? { id: "unpin", label: t("Unpin"), icon: PinOff, run: () => useStore.getState().setPinned(s.id, false) }
      : { id: "pin", label: t("Pin to top"), icon: Pin, run: () => useStore.getState().setPinned(s.id, true) },
    s.archived
      ? { id: "unarchive", label: t("Move out of the archive"), icon: ArchiveRestore, run: () => useStore.getState().setArchived(s.id, false) }
      : { id: "archive", label: t("Archive"), icon: Archive, run: () => archive([s]) },
    { id: "export", label: t("Export as Markdown…"), icon: Download, run: () => void exportSession(s) },
    "separator",
    { heading: t("Move to project") },
    ...projects.map((p) => ({ id: `to-${p.id}`, label: p.name, icon: Folder, checked: s.projectId === p.id, run: () => move(s, p) })),
    ...(s.projectId ? [{ id: "unfile", label: t("No project"), icon: FolderMinus, run: () => move(s, null) }] : []),
    { id: "new-project", label: t("New project…"), icon: FolderPlus, run: () => openProjectDialog("new", s.id) },
    "separator",
    { id: "delete", label: t("Delete"), icon: Trash2, danger: true, kbd: isMac ? "⌘⌫" : "Del", run: () => deleteWithUndo(s) },
  ];

  /** Archives sessions and offers to bring them back. */
  const archive = (list: Session[]) => {
    const st = useStore.getState();
    for (const x of list) st.setArchived(x.id, true);
    toast(list.length === 1 ? t("Archived “{title}”", { title: list[0].title }) : tn(list.length, "Archived {n} session", "Archived {n} sessions"), {
      label: t("Undo"),
      run: () => list.forEach((x) => useStore.getState().setArchived(x.id, false)),
    });
  };

  const projectMenu = (p: Project): MenuEntry[] => [
    {
      id: "new-in",
      label: chat ? t("New chat in project") : t("New session in project"),
      icon: SquarePen,
      run: () => {
        setProject(p.id);
        newSession();
      },
    },
    { id: "edit", label: t("Edit project…"), icon: Settings2, kbd: "F2", run: () => openProjectDialog(p.id) },
    "separator",
    { id: "delete", label: t("Delete project"), icon: Trash2, danger: true, run: () => deleteProjectWithUndo(p) },
  ];

  const atPointer = (e: MouseEvent): MenuAnchor => {
    e.preventDefault();
    return { x: e.clientX, y: e.clientY };
  };
  const fromButton = (e: MouseEvent): MenuAnchor => {
    e.stopPropagation();
    return anchorBelow(e.currentTarget);
  };

  const row = (s: Session) => {
    const isEditing = editing === s.id;
    const busy = !!runs[s.id] || isStreaming(s);
    const hit = excerpts.get(s.id);
    return (
      <div
        key={s.id}
        // "fresh": only a session created just now animates in. Re-sorting moves the other
        // rows in the DOM, which would restart an entrance animation on every one of them.
        className={cx(
          "session-item",
          s.id === openId && "active",
          selected.has(s.id) && "selected",
          isEditing && "editing",
          hit && "has-excerpt",
          s.archived && "is-archived",
          Date.now() - s.createdAt < 1500 && "fresh",
        )}
        data-row
        onClick={(e) => onRowClick(e, s)}
        onDoubleClick={() => setEditing(s.id)}
        onContextMenu={(e) => !isEditing && setMenu({ at: atPointer(e), session: s })}
        role="button"
        aria-current={s.id === openId ? "page" : undefined}
        aria-selected={selected.size ? selected.has(s.id) : undefined}
        tabIndex={0}
        onKeyDown={(e) => onItemKey(e, s)}
      >
        {isEditing ? (
          <input
            className="rename-input"
            autoFocus
            defaultValue={s.title}
            aria-label={t("Rename")}
            onFocus={(e) => e.target.select()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              if (!cancelRename.current) renameSession(s.id, e.target.value);
              cancelRename.current = false;
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (composing(e) || (e.key !== "Enter" && e.key !== "Escape")) return;
              cancelRename.current = e.key === "Escape";
              // Blur by handing focus back to the row, so arrow keys keep working.
              e.currentTarget.closest<HTMLElement>(".session-item")?.focus();
            }}
          />
        ) : (
          <>
            {/* A reply that finished while nobody looked. */}
            {s.unread && !busy && <span className="unread-dot" aria-label={t("New reply")} {...tip(t("New reply"))} />}
            {/* A chat that works in a folder is marked, so it can be told from plain conversation. */}
            {section === "chat" && s.folder && <Folder size={12} className="session-folder" {...tip(t("Works in {folder}", { folder: folderName(s.folder) }))} />}
            <span className="session-text">
              <span className="session-title">
                <Highlight text={s.title} query={query} />
              </span>
              {hit && (
                <span className="session-excerpt">
                  <Highlight text={hit} query={query} />
                </span>
              )}
            </span>
            <span className="session-meta">
              {busy ? (
                <Spinner size={12} />
              ) : s.archived && q ? (
                <Archive size={12} className="session-archived" {...tip(t("Archived"))} />
              ) : (
                <span className="session-time">{relativeTime(s.updatedAt)}</span>
              )}
              <span className="session-actions">
                <button
                  className="session-action"
                  tabIndex={-1}
                  aria-label={t("More")}
                  {...tip(t("Rename, pin, archive…"))}
                  onClick={(e) => setMenu({ at: fromButton(e), session: s })}
                >
                  <MoreHorizontal size={14} />
                </button>
                <button
                  className="session-action danger"
                  tabIndex={-1}
                  aria-label={t("Delete")}
                  {...tip(t("Delete"), isMac ? "⌘⌫" : "Del")}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteWithUndo(s);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <button className="new-session" onClick={newSession}>
        <Plus size={15} />
        <span>{chat ? t("New chat") : t("New session")}</span>
        <Keys combo={`${mod}N`} className="shortcut" />
      </button>

      <label className="sidebar-search">
        <Search size={14} />
        <input
          ref={search}
          placeholder={chat ? t("Search chats") : t("Search sessions")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (composing(e)) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              rows()[0]?.focus();
            } else if (e.key === "Enter") {
              const first = groups[0]?.items[0];
              if (first) selectSession(first.id);
            } else if (e.key === "Escape") {
              if (query) setQuery("");
              else e.currentTarget.blur();
            }
          }}
        />
        {query && (
          <button
            className="search-clear"
            aria-label={t("Clear search")}
            onClick={() => {
              setQuery("");
              search.current?.focus();
            }}
          >
            <X size={12} />
          </button>
        )}
      </label>

      <nav className="session-list" ref={list} aria-label={chat ? t("Projects and chats") : t("Projects and sessions")}>
        {(!q || shownProjects.length > 0) && (
          <section className="projects" aria-label={t("Projects")}>
            <h3 className="group-label projects-label">
              {t("Projects")}
              <button className="session-action" aria-label={t("New project")} {...tip(t("New project"))} onClick={() => openProjectDialog()}>
                <Plus size={13} />
              </button>
            </h3>
            {projects.length === 0 ? (
              <button className="project-item is-new" data-row onClick={() => openProjectDialog()} onKeyDown={stepRow}>
                <FolderPlus size={14} />
                <span className="session-title">{t("New project")}</span>
              </button>
            ) : (
              <>
                {!q && (
                  <div
                    className={cx("project-item", !projectId && "active")}
                    data-row
                    role="button"
                    tabIndex={0}
                    aria-current={!projectId ? "true" : undefined}
                    onClick={() => setProject(null)}
                    onKeyDown={(e) => onProjectKey(e, null)}
                  >
                    <Layers size={14} />
                    <span className="session-title">{chat ? t("All chats") : t("All sessions")}</span>
                    <span className="project-count">{counts.get("") ?? 0}</span>
                  </div>
                )}
                {shownProjects.map((p) => (
                  <div
                    key={p.id}
                    className={cx("project-item has-actions", projectId === p.id && "active")}
                    data-row
                    role="button"
                    tabIndex={0}
                    aria-current={projectId === p.id ? "true" : undefined}
                    onClick={() => setProject(p.id)}
                    onDoubleClick={() => openProjectDialog(p.id)}
                    onContextMenu={(e) => setMenu({ at: atPointer(e), project: p })}
                    onKeyDown={(e) => onProjectKey(e, p)}
                  >
                    <Folder size={14} />
                    <span className="session-title">
                      <Highlight text={p.name} query={query} />
                    </span>
                    <span className="session-meta">
                      <span className="project-count">{counts.get(p.id) ?? 0}</span>
                      <span className="session-actions">
                        <button
                          className="session-action"
                          tabIndex={-1}
                          aria-label={t("Project options")}
                          {...tip(t("Options"))}
                          onClick={(e) => setMenu({ at: fromButton(e), project: p })}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </span>
                    </span>
                  </div>
                ))}
              </>
            )}
          </section>
        )}

        {groups.length === 0 && (
          <div className="sidebar-empty">
            <span className="sidebar-empty-icon">{query ? <SearchX size={18} /> : <MessageSquare size={18} />}</span>
            <span>
              {query
                ? t(chat ? "No chats match “{query}”" : "No sessions match “{query}”", { query: query.trim() })
                : project
                  ? t(chat ? "No chats in “{project}” yet" : "No sessions in “{project}” yet", { project: project.name })
                  : chat
                    ? t("No chats yet")
                    : t("No sessions yet")}
            </span>
            {!query && <small>{project ? t("Start one and it is filed here.") : chat ? t("Your chats will show up here.") : t("Your sessions will show up here.")}</small>}
          </div>
        )}
        {picked.length > 1 && (
          <div className="selection-bar" role="toolbar" aria-label={t("Selected sessions")}>
            <span>{t("{n} selected", { n: picked.length })}</span>
            <div className="spacer" />
            <button className="session-action" aria-label={t("Archive selected")} {...tip(t("Archive"))} onClick={() => (archive(picked.filter((x) => !x.archived)), clearSelection())}>
              <Archive size={14} />
            </button>
            <button className="session-action danger" aria-label={t("Delete selected")} {...tip(t("Delete"), isMac ? "⌘⌫" : "Del")} onClick={() => (deleteManyWithUndo(picked), clearSelection())}>
              <Trash2 size={14} />
            </button>
            <button className="session-action" aria-label={t("Clear selection")} {...tip(t("Clear"), "Esc")} onClick={clearSelection}>
              <X size={14} />
            </button>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="group-label">
              {g.label === "Pinned" && <Pin size={11} />}
              {t(g.label)}
            </h3>
            {g.items.map(row)}
          </section>
        ))}
        {archived.length > 0 && (
          <section className="archived">
            <button className="group-label archived-toggle" aria-expanded={showArchived} onClick={() => setShowArchived((x) => !x)}>
              <ChevronRight size={12} className={cx("chev", showArchived && "open")} />
              {t("Archived")}
              <span className="project-count">{archived.length}</span>
            </button>
            {showArchived && archived.map(row)}
          </section>
        )}
      </nav>

      {menu && (
        <ContextMenu
          at={menu.at}
          label={"session" in menu ? menu.session.title : menu.project.name}
          items={"session" in menu ? sessionMenu(menu.session) : projectMenu(menu.project)}
          onClose={closeMenu}
        />
      )}

      <footer className="sidebar-footer">
        <AccountMenu />
      </footer>
    </aside>
  );
}
