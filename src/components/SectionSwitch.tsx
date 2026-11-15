import { SECTIONS } from "../lib/sections";
import { useStore } from "../lib/store";
import { mod } from "../lib/util";
import { Segmented, tip } from "./ui";

/** Chat / Code toggle, in the title bar beside the new-session button. */
export function SectionSwitch() {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  // Joined string (not a Set) so the selector result is referentially stable.
  const runningIn = useStore((s) =>
    s.sessions
      .filter((x) => s.runs[x.id])
      .map((x) => x.section)
      .join(","),
  );

  return (
    <Segmented
      className="section-switch"
      label="Section"
      value={section}
      onChange={setSection}
      options={SECTIONS.map((s) => ({
        id: s.id,
        label: s.label,
        icon: s.icon,
        hint: s.hint,
        kbd: `${mod}${s.key}`,
        badge: section !== s.id && runningIn.split(",").includes(s.id) && <span className="pulse-dot small" {...tip("Running")} />,
      }))}
    />
  );
}
