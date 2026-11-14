import { useState } from "react";
import { Check, ChevronRight, FilePen, FileText, Globe, Search, ShieldAlert, SquareTerminal, X, Ban } from "lucide-react";
import type { ToolKind, ToolPart } from "../lib/types";
import { useStore } from "../lib/store";
import { cx, isMac } from "../lib/util";
import { DiffStat, DiffView } from "./DiffView";
import { Collapse, CopyButton, Keys, Spinner } from "./ui";

const ICONS: Record<ToolKind, typeof FileText> = {
  read: FileText,
  edit: FilePen,
  bash: SquareTerminal,
  search: Search,
  web: Globe,
};

const VERB: Record<ToolKind, [running: string, done: string]> = {
  read: ["Reading", "Read"],
  edit: ["Editing", "Edited"],
  bash: ["Running", "Ran"],
  search: ["Searching", "Searched"],
  web: ["Fetching", "Fetched"],
};

// Handled globally in App's shortcut handler.
const ALLOW_KEYS = isMac ? "⌘↵" : "Ctrl+↵";
const DENY_KEYS = isMac ? "⌘⌫" : "Ctrl+⌫";

export function ToolCard({ tool }: { tool: ToolPart }) {
  const [open, setOpen] = useState(tool.kind === "edit");
  // A call that appears while running is new; one loaded with its thread is history and just shows.
  const [enter] = useState(tool.status === "running");
  const answerPermission = useStore((s) => s.answerPermission);
  const Icon = ICONS[tool.kind];
  const busy = tool.status === "running" || tool.status === "awaiting";
  // A denied call never ran, so it must not read "Edited" or "Ran".
  const verb = tool.status === "denied" ? "Denied" : VERB[tool.kind][busy ? 0 : 1];
  const hasBody = !!(tool.diff || tool.output);
  const expanded = open && hasBody;

  return (
    <div className={cx("tool-card", `status-${tool.status}`, expanded && "open", enter && "enter")}>
      <button
        className="tool-header"
        onClick={() => hasBody && setOpen((o) => !o)}
        disabled={!hasBody}
        aria-expanded={hasBody ? expanded : undefined}
      >
        <span className="tool-icon">
          <Icon size={14} />
        </span>
        <span className="tool-verb">{verb}</span>
        <code className="tool-input">{tool.kind === "bash" ? `$ ${tool.input}` : tool.input}</code>
        {tool.diff && <DiffStat diff={tool.diff} />}
        <span className="tool-status" key={tool.status}>
          {tool.status === "running" && <Spinner size={12} />}
          {tool.status === "ok" && <Check size={14} className="ok" />}
          {tool.status === "error" && <X size={14} className="err" />}
          {tool.status === "denied" && <Ban size={13} className="err" />}
          {tool.status === "awaiting" && <ShieldAlert size={14} className="warn" />}
        </span>
        {hasBody && <ChevronRight size={14} className={cx("chev", open && "open")} />}
      </button>

      <Collapse open={tool.status === "awaiting"}>
        <div className="permission">
          <div className="permission-text">
            <strong>Allow {tool.name}?</strong>
            <span>{tool.reason}</span>
            {tool.kind === "bash" && <code className="permission-cmd">{tool.input}</code>}
          </div>
          <div className="permission-actions">
            <button className="btn ghost" disabled={!tool.permissionId} onClick={() => answerPermission(tool, false)}>
              Deny
              <Keys combo={DENY_KEYS} />
            </button>
            <button className="btn primary" disabled={!tool.permissionId} onClick={() => answerPermission(tool, true)}>
              Allow
              <Keys combo={ALLOW_KEYS} />
            </button>
          </div>
        </div>
      </Collapse>

      <Collapse open={expanded}>
        <div className="tool-body">
          {tool.diff ? (
            <DiffView diff={tool.diff} />
          ) : (
            <>
              <CopyButton text={tool.output ?? ""} className="tool-copy" size={13} />
              <pre className="tool-output">{tool.output}</pre>
            </>
          )}
        </div>
      </Collapse>
    </div>
  );
}
