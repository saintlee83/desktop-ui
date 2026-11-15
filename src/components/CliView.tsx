import { useState } from "react";
import { RotateCw, SquareTerminal } from "lucide-react";
import { CLIS, cliInfo } from "../lib/clis";
import { cliActive, currentFolder, useStore } from "../lib/store";
import { FolderPicker } from "./FolderPicker";
import { ModePicker } from "./ModePicker";
import { Picker, type PickerGroup } from "./Picker";
import { TerminalView } from "./TerminalView";
import { IconButton } from "./ui";

const CLI_GROUPS: PickerGroup<string>[] = [...new Set(CLIS.map((c) => c.provider))].map((provider) => ({
  label: provider,
  items: CLIS.filter((c) => c.provider === provider).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    meta: c.command || undefined,
  })),
}));

/**
 * Code's terminal mode: the whole main area becomes a terminal running a CLI
 * coding agent in the user's login shell, in place of the chat UI. Once started
 * it stays alive in the background, so switching back to the chat and returning
 * finds the same session. It starts in the folder Code is working in; choosing
 * another one starts it again there.
 */
export function CliView() {
  const active = useStore(cliActive);
  const cliId = useStore((s) => s.cli);
  const setCli = useStore((s) => s.setCli);
  // Nothing is started until the view is first opened.
  const [started, setStarted] = useState(active);
  const [run, setRun] = useState(0);
  const [exited, setExited] = useState(false);
  // Where the shell runs, fixed when it starts: the folder of whatever Code had open.
  const [cwd, setCwd] = useState<string | null>(() => currentFolder(useStore.getState()));
  if (active && !started) {
    setStarted(true);
    setCwd(currentFolder(useStore.getState()));
  }
  if (!started) return null;

  const cli = cliInfo(cliId);
  const restart = () => {
    setExited(false);
    setRun((n) => n + 1);
  };

  return (
    <section className="cli" hidden={!active} aria-label="Terminal">
      <div className="cli-bar">
        <ModePicker />
        <FolderPicker
          folder={cwd}
          empty="Home folder"
          hint={cwd ? undefined : "Choose where the CLI runs"}
          onChange={(folder) => {
            if (folder === cwd) return;
            useStore.getState().setCodeFolder(folder);
            setCwd(folder);
            restart();
          }}
        />
        <Picker
          label="CLI"
          align="left"
          width={300}
          value={cli.id}
          groups={CLI_GROUPS}
          hint="Which CLI runs here"
          onChange={(id) => {
            if (id === cli.id) return;
            setCli(id);
            setExited(false);
          }}
        />
        <div className="spacer" />
        <span className="cli-hint">{cli.command ? `Runs ${cli.command} in your login shell` : "Your login shell"}</span>
        <IconButton label="Restart" className="small" onClick={restart}>
          <RotateCw size={14} />
        </IconButton>
      </div>
      <div className="cli-body">
        {/* Keyed: choosing another CLI or folder, or restarting, ends this shell and starts a fresh one. */}
        <TerminalView key={`${cli.id}:${run}`} active={active && !exited} command={cli.command} cwd={cwd} fontSize={13} onExit={() => setExited(true)} />
        {exited && (
          <div className="cli-exited">
            <span className="panel-empty-icon">
              <SquareTerminal size={18} />
            </span>
            <strong>The shell exited</strong>
            <button className="btn primary" autoFocus onClick={restart}>
              <RotateCw size={14} />
              Start again
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
