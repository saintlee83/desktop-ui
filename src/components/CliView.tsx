import { useState } from "react";
import { RotateCw, SquareTerminal } from "lucide-react";
import { CLIS, SESSION_CLI, cliInfo } from "../lib/clis";
import { t as translate, useT } from "../lib/i18n";
import { cliActive, currentFolder, useStore } from "../lib/store";
import { FolderPicker } from "./FolderPicker";
import { ModePicker } from "./ModePicker";
import { Picker, type PickerGroup } from "./Picker";
import { SessionConsole } from "./SessionConsole";
import { TerminalView } from "./TerminalView";
import { IconButton } from "./ui";

/** The CLI menu, grouped by provider, in the current language. */
const cliGroups = (): PickerGroup<string>[] =>
  [...new Set(CLIS.map((c) => c.provider))].map((provider) => ({
    label: translate(provider),
    items: CLIS.filter((c) => c.provider === provider).map((c) => ({
      id: c.id,
      name: translate(c.name),
      description: translate(c.description),
      meta: c.command || undefined,
    })),
  }));

/**
 * Code's terminal mode: the whole main area becomes a terminal in place of the chat UI.
 *
 * By default it shows the open session itself as a CLI (SessionConsole): the same
 * conversation, carried on from either view. It can instead run another CLI coding agent
 * in the user's login shell, in a session of its own; that one starts in the folder Code
 * is working in, stays alive in the background while the chat is shown, and starts again
 * when another folder is chosen.
 */
export function CliView() {
  const t = useT();
  const active = useStore(cliActive);
  const cliId = useStore((s) => s.cli);
  const setCli = useStore((s) => s.setCli);
  // The session's own folder, for the session's CLI.
  const sessionFolder = useStore(currentFolder);
  // Nothing is started until the view is first opened.
  const [started, setStarted] = useState(active);
  const [run, setRun] = useState(0);
  const [exited, setExited] = useState(false);
  // Where another CLI's shell runs, fixed when it starts: the folder of whatever Code had open.
  const [cwd, setCwd] = useState<string | null>(() => currentFolder(useStore.getState()));
  if (active && !started) {
    setStarted(true);
    setCwd(currentFolder(useStore.getState()));
  }
  if (!started) return null;

  const cli = cliInfo(cliId);
  const linked = cli.id === SESSION_CLI;
  const restart = () => {
    setExited(false);
    setRun((n) => n + 1);
  };

  return (
    <section className="cli" hidden={!active} aria-label={t("Terminal")}>
      <div className="cli-bar">
        <ModePicker />
        {linked ? (
          <FolderPicker
            folder={sessionFolder}
            hint={sessionFolder ? undefined : t("Choose a folder for the agent")}
            onChange={(folder) => useStore.getState().setFolder(folder)}
          />
        ) : (
          <FolderPicker
            folder={cwd}
            empty={t("Home folder")}
            hint={cwd ? undefined : t("Choose where the CLI runs")}
            onChange={(folder) => {
              if (folder === cwd) return;
              useStore.getState().setCodeFolder(folder);
              setCwd(folder);
              restart();
            }}
          />
        )}
        <Picker
          label="CLI"
          align="left"
          width={320}
          value={cli.id}
          groups={cliGroups()}
          hint={t("What runs here")}
          onChange={(id) => {
            if (id === cli.id) return;
            setCli(id);
            setExited(false);
          }}
        />
        <div className="spacer" />
        <span className="cli-hint">
          {linked
            ? t("This session, as a CLI")
            : cli.command
              ? t("Runs {command} in your login shell, in its own session", { command: cli.command })
              : t("Your login shell")}
        </span>
        <IconButton label={linked ? t("Redraw") : t("Restart")} className="small" onClick={restart}>
          <RotateCw size={14} />
        </IconButton>
      </div>
      <div className="cli-body">
        {linked ? (
          <SessionConsole active={active} redraw={run} />
        ) : (
          <>
            {/* Keyed: choosing another CLI or folder, or restarting, ends this shell and starts a fresh one. */}
            <TerminalView key={`${cli.id}:${run}`} active={active && !exited} command={cli.command} cwd={cwd} onExit={() => setExited(true)} />
            {exited && (
              <div className="cli-exited">
                <span className="panel-empty-icon">
                  <SquareTerminal size={18} />
                </span>
                <strong>{t("The shell exited")}</strong>
                <button className="btn primary" autoFocus onClick={restart}>
                  <RotateCw size={14} />
                  {t("Start again")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
