import { PanelLeft, PanelRight, Search, SquarePen, SquareTerminal } from "lucide-react";
import { cliInfo } from "../lib/clis";
import { cliActive, isAgentic, useActiveSession, useStore } from "../lib/store";
import { mod } from "../lib/util";
import { SectionSwitch } from "./SectionSwitch";
import { IconButton, Keys, tip } from "./ui";

export function TitleBar() {
  const session = useActiveSession();
  const running = useStore((s) => (s.activeId ? !!s.runs[s.activeId] : false));
  const section = useStore((s) => s.section);
  // The terminal and the side panel come with the agent's tools: Code, or a chat that has a folder.
  const agentic = useStore(isAgentic);
  const panelOpen = useStore((s) => s.panelOpen);
  const terminalOpen = useStore((s) => s.terminalOpen);
  // In Code's terminal view the window is the CLI: it gives the title, and the chat's panels don't apply.
  const cli = useStore((s) => (cliActive(s) ? cliInfo(s.cli) : null));
  const { toggleSidebar, togglePanel, toggleTerminal, newSession, setPalette } = useStore.getState();
  const noun = section === "chat" ? "chat" : "session";

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <IconButton label="Toggle sidebar" kbd={`${mod}B`} onClick={toggleSidebar}>
          <PanelLeft size={16} />
        </IconButton>
        <SectionSwitch />
        <IconButton label={`New ${noun}`} kbd={`${mod}N`} onClick={newSession}>
          <SquarePen size={16} />
        </IconButton>
      </div>
      <div className="titlebar-center" data-tauri-drag-region>
        <span className="titlebar-title" data-tauri-drag-region>
          {cli ? cli.name : (session?.title ?? `New ${noun}`)}
        </span>
        {running && !cli && <span className="pulse-dot" {...tip("Agent is running")} />}
      </div>
      <div className="titlebar-right">
        <button className="kbd-button" onClick={() => setPalette(true)} aria-label="Open command palette">
          <Search size={13} />
          <span>Search</span>
          <Keys combo={`${mod}K`} />
        </button>
        {agentic && !cli && (
          <>
            <IconButton label="Toggle terminal" kbd="Ctrl+`" onClick={() => toggleTerminal()} active={terminalOpen}>
              <SquareTerminal size={16} />
            </IconButton>
            <IconButton label="Toggle side panel" kbd={`${mod}J`} onClick={() => togglePanel()} active={panelOpen}>
              <PanelRight size={16} />
            </IconButton>
          </>
        )}
      </div>
    </header>
  );
}
