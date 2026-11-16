import { useEffect, useRef, useState } from "react";
import { Ban, Check, ChevronRight, FilePen, FileText, Globe, Search, ShieldAlert, SquareArrowOutUpRight, SquareTerminal, Undo2, X } from "lucide-react";
import { openFile } from "../lib/actions";
import { inTauri } from "../lib/agent";
import { useT } from "../lib/i18n";
import type { ToolKind, ToolPart } from "../lib/types";
import { currentFolder, useStore } from "../lib/store";
import { cx, isMac } from "../lib/util";
import { DiffStat, DiffView } from "./DiffView";
import { Collapse, CopyButton, IconButton, Keys, Spinner, tip } from "./ui";

const ICONS: Record<ToolKind, typeof FileText> = {
  read: FileText,
  edit: FilePen,
  bash: SquareTerminal,
  search: Search,
  web: Globe,
};

// Labels here are English and translated where shown.
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

/** What "Always allow" covers, in words. */
const ALWAYS: Record<ToolKind, string> = {
  bash: "Always allow this command",
  edit: "Allow all edits",
  read: "Allow all reads",
  search: "Allow all searches",
  web: "Allow all fetches",
};

export function ToolCard({ tool }: { tool: ToolPart }) {
  const t = useT();
  const [open, setOpen] = useState(tool.kind === "edit");
  // A call that appears while running is new; one loaded with its thread is history and just shows.
  const [enter] = useState(tool.status === "running");
  const { answerPermission, allowAlways } = useStore.getState();
  // Files of a session with a folder can be opened from the card.
  const folder = useStore(currentFolder);
  const Icon = ICONS[tool.kind];
  const busy = tool.status === "running" || tool.status === "awaiting";
  // A denied call never ran, so it must not read "Edited" or "Ran".
  const verb = t(tool.status === "denied" ? "Denied" : VERB[tool.kind][busy ? 0 : 1]);
  const hasBody = !!(tool.diff || tool.output);
  // A command's output shows as it comes in.
  const live = tool.kind === "bash" && tool.status === "running" && !!tool.output;
  const expanded = (open || live) && hasBody;
  const file = (tool.kind === "read" || tool.kind === "edit") && folder && inTauri ? (tool.diff?.path ?? tool.input) : null;

  // Live output follows its newest line.
  const out = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (live && out.current) out.current.scrollTop = out.current.scrollHeight;
  }, [live, tool.output]);

  return (
    <div className={cx("tool-card", `status-${tool.status}`, expanded && "open", enter && "enter", tool.reverted && "reverted")}>
      <div className="tool-header-row">
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
          {tool.reverted && (
            <span className="tool-badge" {...tip(t("Undone from the Changes panel"))}>
              <Undo2 size={11} /> {t("Reverted")}
            </span>
          )}
          {tool.diff && <DiffStat diff={tool.diff} />}
          <span className="tool-status" key={tool.status}>
            {tool.status === "running" && <Spinner size={12} />}
            {tool.status === "ok" && <Check size={14} className="ok" />}
            {tool.status === "error" && <X size={14} className="err" />}
            {tool.status === "denied" && <Ban size={13} className="err" />}
            {tool.status === "awaiting" && <ShieldAlert size={14} className="warn" />}
          </span>
          {hasBody && <ChevronRight size={14} className={cx("chev", expanded && "open")} />}
        </button>
        {file && (
          <IconButton label={t("Open in editor")} className="small tool-open" onClick={() => openFile(file)}>
            <SquareArrowOutUpRight size={13} />
          </IconButton>
        )}
      </div>

      <Collapse open={tool.status === "awaiting"}>
        <div className="permission">
          <div className="permission-text">
            <strong>{t("Allow {name}?", { name: tool.name })}</strong>
            <span>{tool.reason}</span>
            {tool.kind === "bash" && <code className="permission-cmd">{tool.input}</code>}
          </div>
          <div className="permission-actions">
            <button className="btn ghost" disabled={!tool.permissionId} onClick={() => answerPermission(tool, false)}>
              {t("Deny")}
              <Keys combo={DENY_KEYS} />
            </button>
            <button
              className="btn ghost"
              disabled={!tool.permissionId}
              onClick={() => allowAlways(tool)}
              {...tip(t("For the rest of this session"))}
            >
              {t(ALWAYS[tool.kind])}
            </button>
            <button className="btn primary" disabled={!tool.permissionId} onClick={() => answerPermission(tool, true)}>
              {t("Allow")}
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
              {!live && <CopyButton text={tool.output ?? ""} className="tool-copy" size={13} />}
              <pre className={cx("tool-output", live && "live")} ref={out}>
                {tool.output}
              </pre>
            </>
          )}
        </div>
      </Collapse>
    </div>
  );
}
