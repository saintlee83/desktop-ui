import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Folder, FolderMinus, FolderPlus, Layers, MessageSquare, MoreHorizontal, Pencil, Plus, Search, SearchX, Settings2, SquarePen, Trash2, X } from "lucide-react";
import { deleteProjectWithUndo, deleteWithUndo } from "../lib/actions";
import { folderName } from "../lib/folders";
import { cliActive, inScope, isStreaming, useStore } from "../lib/store";
import { toast } from "../lib/toast";
import type { Project, Session } from "../lib/types";
import { cx, dateGroup, isMac, mod, relativeTime } from "../lib/util";
import { Highlight, Keys, Spinner, tip } from "./ui";
import { AccountMenu } from "./AccountMenu";
import { ContextMenu, anchorBelow, type MenuAnchor, type MenuEntry } from "./ContextMenu";

type OpenMenu = { at: MenuAnchor } & ({ session: Session } | { project: Project });

export function Sidebar() {
  const sessions = useStore((s) => s.sessions);
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const runs = useStore((s) => s.runs);
  const section = useStore((s) => s.section);
  // Behind Code's terminal view no session is on screen, so none is marked as open.
  const openId = useStore((s) => (cliActive(s) ? null : s.activeId));
  const noun = section === "chat" ? "chat" : "session";
  const { newSession, selectSession, renameSession, setProject, openProjectDialog, moveSession } = useStore.getState();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const list = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const cancelRename = useRef(false);
  const project = projects.find((p) => p.id === projectId) ?? null;
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const list = sessions
      .filter((s) => inScope(s, { section, projectId }) && (!q || s.title.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const out: { label: string; items: typeof list }[] = [];
    for (const s of list) {
      const label = dateGroup(s.updatedAt);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [sessions, q, section, projectId]);

  /** How many of this section's sessions each project holds ("" counts them all). */
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of sessions) {
      if (s.section !== section) continue;
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
      deleteWithUndo(s);
    }
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
    toast(to ? `Moved to “${to.name}”` : `Removed from “${from?.name ?? "the project"}”`);
  };

  const sessionMenu = (s: Session): MenuEntry[] => [
    { id: "rename", label: "Rename", icon: Pencil, kbd: "F2", run: () => setEditing(s.id) },
    "separator",
    { heading: "Move to project" },
    ...projects.map((p) => ({ id: `to-${p.id}`, label: p.name, icon: Folder, checked: s.projectId === p.id, run: () => move(s, p) })),
    ...(s.projectId ? [{ id: "unfile", label: "No project", icon: FolderMinus, run: () => move(s, null) }] : []),
    { id: "new-project", label: "New project…", icon: FolderPlus, run: () => openProjectDialog("new", s.id) },
    "separator",
    { id: "delete", label: "Delete", icon: Trash2, danger: true, kbd: isMac ? "⌘⌫" : "Del", run: () => deleteWithUndo(s) },
  ];

  const projectMenu = (p: Project): MenuEntry[] => [
    {
      id: "new-in",
      label: `New ${noun} in project`,
      icon: SquarePen,
      run: () => {
        setProject(p.id);
        newSession();
      },
    },
    { id: "edit", label: "Edit project…", icon: Settings2, kbd: "F2", run: () => openProjectDialog(p.id) },
    "separator",
    { id: "delete", label: "Delete project", icon: Trash2, danger: true, run: () => deleteProjectWithUndo(p) },
  ];

  const atPointer = (e: MouseEvent): MenuAnchor => {
    e.preventDefault();
    return { x: e.clientX, y: e.clientY };
  };
  const fromButton = (e: MouseEvent): MenuAnchor => {
    e.stopPropagation();
    return anchorBelow(e.currentTarget);
  };

  return (
    <aside className="sidebar">
      <button className="new-session" onClick={newSession}>
        <Plus size={15} />
        <span>New {noun}</span>
        <Keys combo={`${mod}N`} className="shortcut" />
      </button>

      <label className="sidebar-search">
        <Search size={14} />
        <input
          ref={search}
          placeholder={`Search ${noun}s`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
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
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              search.current?.focus();
            }}
          >
            <X size={12} />
          </button>
        )}
      </label>

      <nav className="session-list" ref={list} aria-label={`Projects and ${noun}s`}>
        {(!q || shownProjects.length > 0) && (
          <section className="projects" aria-label="Projects">
            <h3 className="group-label projects-label">
              Projects
              <button className="session-action" aria-label="New project" {...tip("New project")} onClick={() => openProjectDialog()}>
                <Plus size={13} />
              </button>
            </h3>
            {projects.length === 0 ? (
              <button className="project-item is-new" data-row onClick={() => openProjectDialog()} onKeyDown={stepRow}>
                <FolderPlus size={14} />
                <span className="session-title">New project</span>
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
                    <span className="session-title">All {noun}s</span>
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
                          aria-label="Project options"
                          {...tip("Options")}
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
            <span>{query ? `No ${noun}s match “${query.trim()}”` : project ? `No ${noun}s in “${project.name}” yet` : `No ${noun}s yet`}</span>
            {!query && <small>{project ? `Start one and it is filed here.` : `Your ${noun}s will show up here.`}</small>}
          </div>
        )}
        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="group-label">{g.label}</h3>
            {g.items.map((s) => {
              const isEditing = editing === s.id;
              return (
                <div
                  key={s.id}
                  // "fresh": only a session created just now animates in. Re-sorting moves the other
                  // rows in the DOM, which would restart an entrance animation on every one of them.
                  className={cx("session-item", s.id === openId && "active", isEditing && "editing", Date.now() - s.createdAt < 1500 && "fresh")}
                  data-row
                  onClick={() => selectSession(s.id)}
                  onDoubleClick={() => setEditing(s.id)}
                  onContextMenu={(e) => !isEditing && setMenu({ at: atPointer(e), session: s })}
                  role="button"
                  aria-current={s.id === openId ? "page" : undefined}
                  tabIndex={0}
                  onKeyDown={(e) => onItemKey(e, s)}
                >
                  {isEditing ? (
                    <input
                      className="rename-input"
                      autoFocus
                      defaultValue={s.title}
                      aria-label="Rename"
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        if (!cancelRename.current) renameSession(s.id, e.target.value);
                        cancelRename.current = false;
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== "Escape") return;
                        cancelRename.current = e.key === "Escape";
                        // Blur by handing focus back to the row, so arrow keys keep working.
                        e.currentTarget.closest<HTMLElement>(".session-item")?.focus();
                      }}
                    />
                  ) : (
                    <>
                      {/* A chat that works in a folder is marked, so it can be told from plain conversation. */}
                      {section === "chat" && s.folder && <Folder size={12} className="session-folder" {...tip(`Works in ${folderName(s.folder)}`)} />}
                      <span className="session-title">
                        <Highlight text={s.title} query={query} />
                      </span>
                      <span className="session-meta">
                        {runs[s.id] || isStreaming(s) ? <Spinner size={12} /> : <span className="session-time">{relativeTime(s.updatedAt)}</span>}
                        <span className="session-actions">
                          <button
                            className="session-action"
                            tabIndex={-1}
                            aria-label="More"
                            {...tip("Rename, move…")}
                            onClick={(e) => setMenu({ at: fromButton(e), session: s })}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          <button
                            className="session-action danger"
                            tabIndex={-1}
                            aria-label="Delete"
                            {...tip("Delete", isMac ? "⌘⌫" : "Del")}
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
            })}
          </section>
        ))}
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
