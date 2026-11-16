import { Bot, Map as MapIcon, SquareTerminal } from "lucide-react";
import { useT } from "../lib/i18n";
import { activeMode, cliActive, useStore, type WorkMode } from "../lib/store";
import { cx, modShift } from "../lib/util";
import { Picker, type PickerItem } from "./Picker";

type Choice = WorkMode | "terminal";

/** Names and descriptions are English; they are translated where shown. */
export const MODES: PickerItem<WorkMode>[] = [
  { id: "agent", name: "Agent", icon: Bot, description: "Reads, edits and runs commands" },
  { id: "plan", name: "Plan", icon: MapIcon, description: "Explores read-only, proposes a plan" },
];
/** Code only: not a way of running the built-in agent, but a full-window terminal with a CLI agent in it. */
const TERMINAL: PickerItem<Choice> = {
  id: "terminal",
  name: "Terminal",
  icon: SquareTerminal,
  description: "This session as a CLI, in a full-window terminal",
};

/**
 * How the agent works where it has tools: Agent or Plan, and in Code also Terminal. Lives
 * in the composer, and in the terminal view's bar so there is always a way back.
 */
export function ModePicker({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const section = useStore((s) => s.section);
  const mode = useStore(activeMode);
  const terminal = useStore(cliActive);
  const { setMode, setCodeView } = useStore.getState();
  const choices: PickerItem<Choice>[] = section === "code" ? [...MODES, TERMINAL] : MODES;
  const items = choices.map((m) => ({
    ...m,
    name: t(m.name),
    description: m.description && t(m.description),
  }));

  return (
    <Picker<Choice>
      className={cx("mode-picker", terminal ? "is-terminal" : `is-${mode}`)}
      label={t("Mode")}
      align="left"
      width={330}
      value={terminal ? "terminal" : mode}
      groups={[{ items }]}
      hint={terminal ? t("Back to the chat") : t("Switch mode")}
      kbd={`${modShift}${terminal ? "T" : "M"}`}
      onChange={(choice) => {
        if (choice === "terminal") return setCodeView("terminal");
        setMode(choice);
        if (terminal) setCodeView("gui");
      }}
      onDone={onDone}
    />
  );
}
