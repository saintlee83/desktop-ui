import { useRef, useState } from "react";
import { ChevronDown, Plus, SquareTerminal, X } from "lucide-react";
import { folderName, shortPath } from "../lib/folders";
import { useT } from "../lib/i18n";
import { cliActive, isAgentic, useStore } from "../lib/store";
import { composing, cx } from "../lib/util";
import { TerminalView } from "./TerminalView";
import { IconButton } from "./ui";

/**
 * Resizable bottom drawer with interactive terminal tabs, wherever the agent has tools.
 * Each session has its own tabs: moving to another session shows its terminals, and the
 * others keep running out of sight.
 */
export function TerminalDrawer() {
  const t = useT();
  const terminals = useStore((s) => s.terminals);
  const activeId = useStore((s) => s.activeId);
  const shown = terminals.filter((term) => (term.sessionId ?? null) === activeId);
  const visible = useStore((s) => s.terminalOpen && isAgentic(s) && !cliActive(s)) && shown.length > 0;
  const selected = useStore((s) => s.activeTerminal);
  // The tab picked last, if it is one of this session's; its first otherwise.
  const active = shown.some((term) => term.id === selected) ? selected : (shown[0]?.id ?? null);
  const height = useStore((s) => s.terminalHeight);
  const { newTerminal, closeTerminal, setActiveTerminal, setTerminalShell, toggleTerminal, setTerminalHeight, renameTerminal } = useStore.getState();
  const [renaming, setRenaming] = useState<string | null>(null);
  const drawer = useRef<HTMLDivElement>(null);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const max = (drawer.current?.parentElement?.clientHeight ?? 800) - 220;
    const move = (ev: PointerEvent) => setTerminalHeight(Math.round(Math.min(max, Math.max(140, startH + startY - ev.clientY))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing-row");
    };
    document.body.classList.add("resizing-row");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Keep the drawer (and every session's terminals) mounted while hidden, so shells and scrollback survive.
  if (terminals.length === 0) return null;
  return (
    <div className="term-drawer" ref={drawer} hidden={!visible} style={{ height }}>
      <div
        className="term-resize"
        onPointerDown={startResize}
        onDoubleClick={() => setTerminalHeight(280)}
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("Resize terminal")}
      />
      <div className="term-tabs" role="tablist" aria-label={t("Terminals")}>
        {shown.map((term, i) => (
          <div
            key={term.id}
            role="tab"
            aria-selected={term.id === active}
            className={cx("term-tab", term.id === active && "on")}
            onClick={() => setActiveTerminal(term.id)}
            onDoubleClick={() => setRenaming(term.id)}
            title={term.cwd ? shortPath(term.cwd) : undefined}
          >
            <SquareTerminal size={13} />
            {renaming === term.id ? (
              <input
                className="term-tab-rename"
                autoFocus
                defaultValue={term.title ?? term.shell ?? t("shell")}
                aria-label={t("Rename terminal")}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  renameTerminal(term.id, e.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (composing(e)) return;
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") {
                    e.stopPropagation();
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <span>
                {term.title ?? `${term.shell ?? t("shell")}${shown.length > 1 ? ` ${i + 1}` : ""}`}
              </span>
            )}
            {term.cwd && !term.title && <span className="term-tab-cwd">{folderName(term.cwd)}</span>}
            <button
              className="term-tab-close"
              aria-label={t("Close terminal")}
              onClick={(e) => {
                e.stopPropagation();
                closeTerminal(term.id);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <IconButton label={t("New terminal")} kbd="Ctrl+Shift+`" tipSide="top" className="small" onClick={newTerminal}>
          <Plus size={14} />
        </IconButton>
        <div className="spacer" />
        <IconButton label={t("Hide terminal")} kbd="Ctrl+`" tipSide="top" className="small" onClick={() => toggleTerminal(false)}>
          <ChevronDown size={15} />
        </IconButton>
      </div>
      <div className="term-body">
        {terminals.map((term) => (
          <TerminalView
            key={term.id}
            active={visible && term.id === active}
            cwd={term.cwd}
            onSpawn={(s) => setTerminalShell(term.id, s.shell)}
            // Like VS Code: when the shell exits, its tab closes.
            onExit={() => closeTerminal(term.id)}
          />
        ))}
      </div>
    </div>
  );
}
