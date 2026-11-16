import { PanelLeft, PanelRight, Search, SquarePen, SquareTerminal } from "lucide-react";
import { cliInfo } from "../lib/clis";
import { useT } from "../lib/i18n";
import { cliActive, isAgentic, sessionCli, sessionTerminals, useActiveSession, useStore } from "../lib/store";
import { mod } from "../lib/util";
import { SectionSwitch } from "./SectionSwitch";
import { IconButton, Keys, tip } from "./ui";

export function TitleBar() {
  const t = useT();
  const session = useActiveSession();
  const running = useStore((s) => (s.activeId ? !!s.runs[s.activeId] : false));
  const section = useStore((s) => s.section);
  // The terminal and the side panel come with the agent's tools: Code, or a chat that has a folder.
  const agentic = useStore(isAgentic);
  const panelOpen = useStore((s) => s.panelOpen);
  const terminalOpen = useStore((s) => s.terminalOpen && sessionTerminals(s).length > 0);
  // In Code's terminal view the chat's panels don't apply. Another CLI gives the title; the
  // session's own CLI is still the session, so it keeps the session's title.
  const cli = useStore((s) => cliActive(s));
  const otherCli = useStore((s) => (cliActive(s) && !sessionCli(s) ? cliInfo(s.cli) : null));
  const { toggleSidebar, togglePanel, toggleTerminal, newSession, setPalette } = useStore.getState();
  const newLabel = section === "chat" ? t("New chat") : t("New session");

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <IconButton label={t("Toggle sidebar")} kbd={`${mod}B`} onClick={toggleSidebar}>
          <PanelLeft size={16} />
        </IconButton>
        <SectionSwitch />
        <IconButton label={newLabel} kbd={`${mod}N`} onClick={newSession}>
          <SquarePen size={16} />
        </IconButton>
      </div>
      <div className="titlebar-center" data-tauri-drag-region>
        <span className="titlebar-title" data-tauri-drag-region>
          {otherCli ? t(otherCli.name) : (session?.title ?? newLabel)}
        </span>
        {running && !otherCli && <span className="pulse-dot" {...tip(t("Agent is running"))} />}
      </div>
      <div className="titlebar-right">
        <button className="kbd-button" onClick={() => setPalette(true)} aria-label={t("Open command palette")}>
          <Search size={13} />
          <span>{t("Search")}</span>
          <Keys combo={`${mod}K`} />
        </button>
        {agentic && !cli && (
          <>
            <IconButton label={t("Toggle terminal")} kbd="Ctrl+`" onClick={() => toggleTerminal()} active={terminalOpen}>
              <SquareTerminal size={16} />
            </IconButton>
            <IconButton label={t("Toggle side panel")} kbd={`${mod}J`} onClick={() => togglePanel()} active={panelOpen}>
              <PanelRight size={16} />
            </IconButton>
          </>
        )}
      </div>
    </header>
  );
}
