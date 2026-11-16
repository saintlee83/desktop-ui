import { useMemo, useState } from "react";
import { Ban, Check, ChevronRight, Copy, FileDiff as FileDiffIcon, FileText, FolderSearch, Gauge, MoreHorizontal, Redo2, ScrollText, ShieldAlert, SquareArrowOutUpRight, Undo2, X } from "lucide-react";
import { openFile, revealFile, revertChanges } from "../lib/actions";
import { inTauri } from "../lib/agent";
import { tn, useT } from "../lib/i18n";
import { activeModel, currentFolder, useActiveSession, useStore, type PanelTab } from "../lib/store";
import { toast } from "../lib/toast";
import type { ToolPart } from "../lib/types";
import { copyText, cx, formatTokens, isMac, mod, useTween } from "../lib/util";
import { ContextMenu, anchorBelow, type MenuAnchor, type MenuEntry } from "./ContextMenu";
import { DiffView } from "./DiffView";
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

/** The edits of each file, oldest first. */
function changedFiles(tools: ToolPart[]) {
  const map = new Map<string, ToolPart[]>();
  for (const t of tools) if (t.diff && t.status === "ok") map.set(t.diff.path, [...(map.get(t.diff.path) ?? []), t]);
  return [...map.entries()];
}

/** Lines added and removed by the edits still in place. */
const sum = (edits: ToolPart[]) =>
  edits.filter((t) => !t.reverted).reduce((a, t) => ({ add: a.add + (t.diff?.additions ?? 0), del: a.del + (t.diff?.deletions ?? 0) }), { add: 0, del: 0 });

function LineStat({ add, del }: { add: number; del: number }) {
  return (
    <span className="diffstat">
      <span className="add">+{add}</span>
      <span className="del">−{del}</span>
    </span>
  );
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
  const t = useT();
  const session = useActiveSession();
  const tools = useTools();
  const folder = useStore(currentFolder);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ at: MenuAnchor; path: string; edits: ToolPart[] } | null>(null);
  const files = useMemo(() => changedFiles(tools), [tools]);

  if (!files.length) {
    return (
      <Empty icon={FileDiffIcon} title={t("No changes yet")}>
        {t("Files the agent edits in this session show up here as diffs.")}
      </Empty>
    );
  }

  const totals = sum(files.flatMap(([, edits]) => edits));
  // Opening and reverting act on the folder on disk, which only the app can reach.
  const onDisk = inTauri && !!folder;
  const fileMenu = (path: string, edits: ToolPart[]): MenuEntry[] => {
    const reverted = edits.every((e) => e.reverted);
    const patch = edits.map((e) => e.diff!.patch.replace(/\n?$/, "\n")).join("");
    return [
      ...(onDisk
        ? [
            { id: "open", label: t("Open in editor"), icon: SquareArrowOutUpRight, run: () => openFile(path) },
            { id: "reveal", label: isMac ? t("Reveal in Finder") : t("Show in folder"), icon: FolderSearch, run: () => revealFile(path) },
          ]
        : []),
      {
        id: "copy",
        label: t("Copy diff"),
        icon: Copy,
        run: () => void copyText(`--- a/${path}\n+++ b/${path}\n${patch}`).then((ok) => ok && toast(t("Copied the diff"))),
      },
      ...(onDisk && session
        ? [
            "separator" as const,
            reverted
              ? { id: "redo", label: t("Reapply changes"), icon: Redo2, run: () => void revertChanges(session.id, path, edits, true) }
              : { id: "revert", label: t("Revert changes"), icon: Undo2, danger: true, run: () => void revertChanges(session.id, path, edits.filter((e) => !e.reverted)) },
          ]
        : []),
    ];
  };

  return (
    <div className="changes">
      <div className="changes-summary">
        {tn(files.length, "{n} file changed", "{n} files changed")}
        <LineStat {...totals} />
      </div>
      {files.map(([path, edits]) => {
        const isOpen = open[path] ?? true;
        const reverted = edits.every((e) => e.reverted);
        return (
          <div key={path} className={cx("change-file", reverted && "reverted")}>
            <div className="change-header-row">
              <button className="change-header" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [path]: !isOpen }))}>
                <ChevronRight size={13} className={cx("chev", isOpen && "open")} />
                <span className="change-path" title={path}>
                  <span className="dir">{path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : ""}</span>
                  {path.split("/").pop()}
                </span>
                {reverted ? <span className="tool-badge">{t("Reverted")}</span> : <LineStat {...sum(edits)} />}
              </button>
              <IconButton label={t("File actions")} className="small" onClick={(e) => setMenu({ at: anchorBelow(e.currentTarget), path, edits })}>
                <MoreHorizontal size={14} />
              </IconButton>
            </div>
            <Collapse open={isOpen}>
              {edits.map((e) => (
                <div key={e.id} className={cx(e.reverted && "reverted")}>
                  <DiffView diff={e.diff!} />
                </div>
              ))}
            </Collapse>
          </div>
        );
      })}
      {menu && <ContextMenu at={menu.at} label={t("{path} actions", { path: menu.path })} items={fileMenu(menu.path, menu.edits)} onClose={() => setMenu(null)} />}
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
  const t = useT();
  const tools = useTools().filter((tool) => tool.kind === "bash");
  if (!tools.length) {
    return (
      <Empty icon={ScrollText} title={t("No commands yet")}>
        {t("Shell commands the agent runs are logged here with their output.")}
      </Empty>
    );
  }
  return (
    <div className="terminal">
      {tools.map((tool) => (
        <div key={tool.id} className={cx("term-entry", `status-${tool.status}`)}>
          <div className="term-cmd">
            <span className="prompt">❯</span>
            <code>{tool.input}</code>
            <CopyButton text={tool.input} className="term-copy" size={12} />
            <span className="term-status" key={tool.status}>
              <CommandStatus status={tool.status} />
            </span>
          </div>
          <pre className={cx("term-out", tool.status === "denied" && "denied", (tool.status === "awaiting" || (tool.status === "running" && !tool.output)) && "pending")}>
            {tool.status === "awaiting" ? t("Waiting for approval…") : tool.status === "running" ? tool.output || t("Running…") : tool.output}
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
  const t = useT();
  const session = useActiveSession();
  const models = useStore((s) => s.models);
  const modelId = useStore(activeModel);
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
  const files = [...new Set(tools.filter((tool) => tool.kind === "read" || tool.kind === "edit").map((tool) => tool.input))];

  return (
    <div className="context">
      <div className="stat-card">
        <div className="stat-label">
          {t("Context window")}
          <span className="stat-aside">{t("{pct}% used", { pct: !used ? "0" : pct < 0.1 ? "<0.1" : pct.toFixed(pct < 10 ? 1 : 0) })}</span>
        </div>
        <div className="stat-value">
          {formatTokens(Math.round(shownUsed))} <small>/ {model ? formatTokens(model.contextWindow) : "—"}</small>
        </div>
        <div
          className={cx("meter", pct >= 90 ? "crit" : pct >= 70 && "warn")}
          role="meter"
          aria-label={t("Context window used")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div style={{ width: `${Math.max(pct, used ? 1 : 0)}%` }} />
        </div>
      </div>
      <div className="stat-grid">
        <Stat label={t("Input tokens")} value={usage.in} />
        <Stat label={t("Output tokens")} value={usage.out} />
        <Stat label={t("Messages")} value={session?.messages.length ?? 0} />
        <Stat label={t("Tool calls")} value={tools.length} />
      </div>
      <div className="stat-label section">
        {t("Files in context")}
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
        <div className="panel-empty small">{t("None yet")}</div>
      )}
    </div>
  );
}

export function RightPanel() {
  const t = useT();
  const tab = useStore((s) => s.panelTab);
  const { setPanelTab, togglePanel } = useStore.getState();
  const tools = useTools();
  const counts: Partial<Record<PanelTab, number>> = {
    changes: useMemo(() => changedFiles(tools).length, [tools]),
    terminal: tools.filter((tool) => tool.kind === "bash").length,
  };

  return (
    <aside className="panel" aria-label={t("Side panel")}>
      <div className="panel-tabs">
        <Segmented
          className="flat"
          label={t("Side panel")}
          value={tab}
          onChange={setPanelTab}
          options={TABS.map((item) => ({
            id: item.id,
            label: t(item.label),
            icon: item.icon,
            badge: counts[item.id] ? <span className="count">{counts[item.id]}</span> : null,
          }))}
        />
        <div className="spacer" />
        <IconButton label={t("Close panel")} kbd={`${mod}J`} className="small" onClick={() => togglePanel(false)}>
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
