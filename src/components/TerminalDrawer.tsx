import { useRef } from "react";
import { ChevronDown, Plus, SquareTerminal, X } from "lucide-react";
import { cliActive, useStore } from "../lib/store";
import { isAgentSection } from "../lib/types";
import { cx } from "../lib/util";
import { TerminalView } from "./TerminalView";
import { IconButton } from "./ui";

/** Resizable bottom drawer with interactive terminal tabs (Work and Code sections). */
export function TerminalDrawer() {
  const visible = useStore((s) => s.terminalOpen && isAgentSection(s.section) && !cliActive(s));
  const terminals = useStore((s) => s.terminals);
  const active = useStore((s) => s.activeTerminal);
  const height = useStore((s) => s.terminalHeight);
  const { newTerminal, closeTerminal, setActiveTerminal, setTerminalShell, toggleTerminal, setTerminalHeight } = useStore.getState();
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

  // Keep the drawer mounted while hidden so shells and scrollback survive toggling.
  if (terminals.length === 0) return null;
  return (
    <div className="term-drawer" ref={drawer} hidden={!visible} style={{ height }}>
      <div
        className="term-resize"
        onPointerDown={startResize}
        onDoubleClick={() => setTerminalHeight(280)}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
      />
      <div className="term-tabs" role="tablist" aria-label="Terminals">
        {terminals.map((t, i) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            className={cx("term-tab", t.id === active && "on")}
            onClick={() => setActiveTerminal(t.id)}
          >
            <SquareTerminal size={13} />
            <span>
              {t.shell ?? "shell"}
              {terminals.length > 1 ? ` ${i + 1}` : ""}
            </span>
            <button
              className="term-tab-close"
              aria-label="Close terminal"
              onClick={(e) => {
                e.stopPropagation();
                closeTerminal(t.id);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <IconButton label="New terminal" kbd="Ctrl+Shift+`" tipSide="top" className="small" onClick={newTerminal}>
          <Plus size={14} />
        </IconButton>
        <div className="spacer" />
        <IconButton label="Hide terminal" kbd="Ctrl+`" tipSide="top" className="small" onClick={() => toggleTerminal(false)}>
          <ChevronDown size={15} />
        </IconButton>
      </div>
      <div className="term-body">
        {terminals.map((t) => (
          <TerminalView
            key={t.id}
            active={visible && t.id === active}
            onSpawn={(s) => setTerminalShell(t.id, s.shell)}
            // Like VS Code: when the shell exits, its tab closes.
            onExit={() => closeTerminal(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
