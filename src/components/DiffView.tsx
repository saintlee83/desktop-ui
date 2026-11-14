import type { FileDiff } from "../lib/types";
import { cx } from "../lib/util";

/** Renders a unified-diff body with old/new line numbers. */
export function DiffView({ diff }: { diff: FileDiff }) {
  let oldLn = 0;
  let newLn = 0;
  const rows = diff.patch.replace(/\n$/, "").split("\n").map((line, i) => {
    if (line.startsWith("@@")) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      if (m) {
        oldLn = +m[1];
        newLn = +m[2];
      }
      return (
        <tr key={i} className="diff-hunk">
          <td className="ln" />
          <td className="ln" />
          <td className="code">{line}</td>
        </tr>
      );
    }
    const kind = line[0] === "+" ? "add" : line[0] === "-" ? "del" : "ctx";
    const o = kind === "add" ? "" : oldLn++;
    const n = kind === "del" ? "" : newLn++;
    return (
      <tr key={i} className={cx("diff-line", kind)}>
        <td className="ln">{o}</td>
        <td className="ln">{n}</td>
        <td className="code">
          <span className="sign">{kind === "add" ? "+" : kind === "del" ? "−" : " "}</span>
          {line.slice(1)}
        </td>
      </tr>
    );
  });

  return (
    <div className="diff">
      <table>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export function DiffStat({ diff }: { diff: FileDiff }) {
  return (
    <span className="diffstat">
      <span className="add">+{diff.additions}</span>
      <span className="del">−{diff.deletions}</span>
    </span>
  );
}
