import { useMemo, useState } from "react";
import { Ban, Check, ChevronRight, FileDiff as FileDiffIcon, FileText, Gauge, ScrollText, ShieldAlert, X } from "lucide-react";
import { useActiveSession, useStore, type PanelTab } from "../lib/store";
import type { FileDiff, ToolPart } from "../lib/types";
import { cx, formatTokens, mod, useTween } from "../lib/util";
import { DiffStat, DiffView } from "./DiffView";
import { Collapse, CopyButton, IconButton, Segmented, Spinner } from "./ui";

const TABS: { id: PanelTab; label: string; icon: typeof Gauge }[] = [
  { id: "changes", label: "Changes", icon: FileDiffIcon },
  { id: "terminal", label: "Commands", icon: ScrollText },
  { id: "context", label: "Context", icon: Gauge },
];

function useTools() {
  const session = useActiveSession();
  return useMemo(
    () => session?.messages.flatMap((m) => m.parts.filter((p): p is ToolPart => p.type === "tool")) ?? [],
    [session],
  );
}

/** Latest diff per file wins; totals accumulate. */
function changedFiles(tools: ToolPart[]) {
  const map = new Map<string, FileDiff[]>();
  for (const t of tools) if (t.diff && t.status === "ok") map.set(t.diff.path, [...(map.get(t.diff.path) ?? []), t.diff]);
  return [...map.entries()];
}

function Empty({ icon: Icon, title, children }: { icon: typeof Gauge; title: string; children: string }) {
  return (
    <div className="panel-empty">
      <span className="panel-empty-icon">
        <Icon size={18} />
      </span>
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

function Changes() {
  const tools = useTools();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const files = useMemo(() => changedFiles(tools), [tools]);

  if (!files.length) {
    return (
      <Empty icon={FileDiffIcon} title="No changes yet">
        Files the agent edits in this session show up here as diffs.
      </Empty>
    );
  }

  const totals = files.flatMap(([, d]) => d).reduce((a, d) => ({ add: a.add + d.additions, del: a.del + d.deletions }), { add: 0, del: 0 });

  return (
    <div className="changes">
      <div className="changes-summary">
        {files.length} file{files.length > 1 ? "s" : ""} changed
        <span className="diffstat">
          <span className="add">+{totals.add}</span>
          <span className="del">−{totals.del}</span>
        </span>
      </div>
      {files.map(([path, diffs]) => {
        const isOpen = open[path] ?? true;
        return (
          <div key={path} className="change-file">
            <button className="change-header" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [path]: !isOpen }))}>
              <ChevronRight size={13} className={cx("chev", isOpen && "open")} />
              <span className="change-path" title={path}>
                <span className="dir">{path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : ""}</span>
                {path.split("/").pop()}
              </span>
              <DiffStat diff={diffs[diffs.length - 1]} />
            </button>
            <Collapse open={isOpen}>
              {diffs.map((d, i) => (
                <DiffView key={i} diff={d} />
              ))}
            </Collapse>
          </div>
        );
      })}
    </div>
  );
}

function CommandStatus({ status }: { status: ToolPart["status"] }) {
  if (status === "running") return <Spinner size={11} />;
  if (status === "awaiting") return <ShieldAlert size={13} className="warn" />;
  if (status === "ok") return <Check size={13} className="ok" />;
  if (status === "denied") return <Ban size={12} className="err" />;
  return <X size={13} className="err" />;
}

function Terminal() {
  const tools = useTools().filter((t) => t.kind === "bash");
  if (!tools.length) {
    return (
      <Empty icon={ScrollText} title="No commands yet">
        Shell commands the agent runs are logged here with their output.
      </Empty>
    );
  }
  return (
    <div className="terminal">
      {tools.map((t) => (
        <div key={t.id} className={cx("term-entry", `status-${t.status}`)}>
          <div className="term-cmd">
            <span className="prompt">❯</span>
            <code>{t.input}</code>
            <CopyButton text={t.input} className="term-copy" size={12} />
            <span className="term-status" key={t.status}>
              <CommandStatus status={t.status} />
            </span>
          </div>
          <pre className={cx("term-out", t.status === "denied" && "denied", (t.status === "running" || t.status === "awaiting") && "pending")}>
            {t.status === "running" ? "Running…" : t.status === "awaiting" ? "Waiting for approval…" : t.output}
          </pre>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const shown = useTween(value);
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{formatTokens(Math.round(shown))}</div>
    </div>
  );
}

function Context() {
  const session = useActiveSession();
  const models = useStore((s) => s.models);
  const modelId = useStore((s) => s.model);
  const tools = useTools();
  const model = models.find((m) => m.id === modelId);
  const usage = session?.messages.reduce(
    (a, m) => ({ in: a.in + (m.usage?.inputTokens ?? 0), out: a.out + (m.usage?.outputTokens ?? 0) }),
    { in: 0, out: 0 },
  ) ?? { in: 0, out: 0 };
  const lastIn = [...(session?.messages ?? [])].reverse().find((m) => m.usage)?.usage;
  const used = (lastIn?.inputTokens ?? 0) + (lastIn?.outputTokens ?? 0);
  const pct = model ? Math.min(100, (used / model.contextWindow) * 100) : 0;
  const shownUsed = useTween(used);
  const files = [...new Set(tools.filter((t) => t.kind === "read" || t.kind === "edit").map((t) => t.input))];

  return (
    <div className="context">
      <div className="stat-card">
        <div className="stat-label">
          Context window
          <span className="stat-aside">{!used ? "0" : pct < 0.1 ? "<0.1" : pct.toFixed(pct < 10 ? 1 : 0)}% used</span>
        </div>
        <div className="stat-value">
          {formatTokens(Math.round(shownUsed))} <small>/ {model ? formatTokens(model.contextWindow) : "—"}</small>
        </div>
        <div
          className={cx("meter", pct >= 90 ? "crit" : pct >= 70 && "warn")}
          role="meter"
          aria-label="Context window used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div style={{ width: `${Math.max(pct, used ? 1 : 0)}%` }} />
        </div>
      </div>
      <div className="stat-grid">
        <Stat label="Input tokens" value={usage.in} />
        <Stat label="Output tokens" value={usage.out} />
        <Stat label="Messages" value={session?.messages.length ?? 0} />
        <Stat label="Tool calls" value={tools.length} />
      </div>
      <div className="stat-label section">
        Files in context
        {files.length > 0 && <span className="stat-aside">{files.length}</span>}
      </div>
      {files.length ? (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f}>
              <FileText size={13} />
              <span className="dir">{f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : ""}</span>
              {f.split("/").pop()}
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel-empty small">None yet</div>
      )}
    </div>
  );
}

export function RightPanel() {
  const tab = useStore((s) => s.panelTab);
  const { setPanelTab, togglePanel } = useStore.getState();
  const tools = useTools();
  const counts: Partial<Record<PanelTab, number>> = {
    changes: useMemo(() => changedFiles(tools).length, [tools]),
    terminal: tools.filter((t) => t.kind === "bash").length,
  };

  return (
    <aside className="panel" aria-label="Side panel">
      <div className="panel-tabs">
        <Segmented
          className="flat"
          label="Side panel"
          value={tab}
          onChange={setPanelTab}
          options={TABS.map((t) => ({
            id: t.id,
            label: t.label,
            icon: t.icon,
            badge: counts[t.id] ? <span className="count">{counts[t.id]}</span> : null,
          }))}
        />
        <div className="spacer" />
        <IconButton label="Close panel" kbd={`${mod}J`} className="small" onClick={() => togglePanel(false)}>
          <X size={14} />
        </IconButton>
      </div>
      {/* Keyed so each tab starts scrolled to its top. */}
      <div className="panel-body" key={tab}>
        {tab === "changes" && <Changes />}
        {tab === "terminal" && <Terminal />}
        {tab === "context" && <Context />}
      </div>
    </aside>
  );
}
