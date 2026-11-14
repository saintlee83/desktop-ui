import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FolderGit2, GitBranch, MessageSquare, Pencil, Plus, Search, SearchX, Trash2, X } from "lucide-react";
import { deleteWithUndo } from "../lib/actions";
import { cliActive, isStreaming, useStore } from "../lib/store";
import { isAgentSection, type Session } from "../lib/types";
import { cx, dateGroup, isMac, mod, relativeTime } from "../lib/util";
import { Highlight, Keys, Spinner, tip } from "./ui";
import { AccountMenu } from "./AccountMenu";
import { SectionSwitch } from "./SectionSwitch";

export function Sidebar() {
  const sessions = useStore((s) => s.sessions);
  const runs = useStore((s) => s.runs);
  const section = useStore((s) => s.section);
  // Behind Code's terminal view no session is on screen, so none is marked as open.
  const openId = useStore((s) => (cliActive(s) ? null : s.activeId));
  const noun = section === "chat" ? "chat" : "session";
  const { newSession, selectSession, renameSession } = useStore.getState();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const list = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const cancelRename = useRef(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...sessions]
      .filter((s) => s.section === section && (!q || s.title.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const out: { label: string; items: typeof list }[] = [];
    for (const s of list) {
      const label = dateGroup(s.updatedAt);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [sessions, query, section]);

  const items = () => [...(list.current?.querySelectorAll<HTMLElement>(".session-item") ?? [])];

  const onItemKey = (e: KeyboardEvent<HTMLDivElement>, s: Session) => {
    if (e.target !== e.currentTarget) return; // typing in the rename field
    const all = items();
    const i = all.indexOf(e.currentTarget);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectSession(s.id);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      all[i + 1]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i > 0) all[i - 1].focus();
      else search.current?.focus();
    } else if (e.key === "F2") {
      e.preventDefault();
      setEditing(s.id);
    } else if (e.key === "Delete" || (e.key === "Backspace" && (isMac ? e.metaKey : e.ctrlKey))) {
      e.preventDefault();
      (all[i + 1] ?? all[i - 1] ?? search.current)?.focus();
      deleteWithUndo(s);
    }
  };

  return (
    <aside className="sidebar">
      <SectionSwitch />
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
              items()[0]?.focus();
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

      {isAgentSection(section) && (
        <div className="workspace-row" {...tip("Current workspace")}>
          <FolderGit2 size={14} />
          <span className="workspace-name">desktop-ui</span>
          <span className="workspace-branch">
            <GitBranch size={11} />
            main
          </span>
        </div>
      )}

      <nav className="session-list" ref={list} aria-label={`${noun}s`}>
        {groups.length === 0 && (
          <div className="sidebar-empty">
            <span className="sidebar-empty-icon">{query ? <SearchX size={18} /> : <MessageSquare size={18} />}</span>
            <span>{query ? `No ${noun}s match “${query.trim()}”` : `No ${noun}s yet`}</span>
            {!query && <small>Your {noun}s will show up here.</small>}
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
                  onClick={() => selectSession(s.id)}
                  onDoubleClick={() => setEditing(s.id)}
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
                      <span className="session-title">
                        <Highlight text={s.title} query={query} />
                      </span>
                      <span className="session-meta">
                        {runs[s.id] || isStreaming(s) ? <Spinner size={12} /> : <span className="session-time">{relativeTime(s.updatedAt)}</span>}
                        <span className="session-actions">
                          <button
                            className="session-action"
                            tabIndex={-1}
                            aria-label="Rename"
                            {...tip("Rename", "F2")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(s.id);
                            }}
                          >
                            <Pencil size={13} />
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

      <footer className="sidebar-footer">
        <AccountMenu />
      </footer>
    </aside>
  );
}
