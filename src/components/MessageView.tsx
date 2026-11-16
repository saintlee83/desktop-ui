import { memo, useEffect, useRef, useState } from "react";
import { AlertCircle, Brain, ChevronDown, ChevronRight, GitBranch, Paperclip, Pencil, Play, RotateCcw } from "lucide-react";
import { useT } from "../lib/i18n";
import type { Message, Part } from "../lib/types";
import { isStreaming, messageText, useStore } from "../lib/store";
import { composing, cx, formatTokens } from "../lib/util";
import { FileChip } from "./Composer";
import { ContextMenu, anchorBelow, type MenuAnchor } from "./ContextMenu";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";
import { Collapse, CopyButton, Keys, tip } from "./ui";

function Thinking({ part, live }: { part: Extract<Part, { type: "thinking" }>; live: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const active = live && !part.endedAt;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const secs = Math.max(1, Math.round(((part.endedAt ?? Date.now()) - part.startedAt) / 1000));

  return (
    <div className={cx("thinking", open && "open", active && "active")}>
      <button className="thinking-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Brain size={14} />
        <span className={cx(active && "shimmer")}>{active ? t("Thinking…") : t("Thought for {n}s", { n: secs })}</span>
        <ChevronRight size={13} className={cx("chev", open && "open")} />
      </button>
      <Collapse open={open}>
        <div className="thinking-body">{part.text}</div>
      </Collapse>
    </div>
  );
}

/** "14:32", or "Mar 3, 14:32" for another day; the full date shows on hover. */
function Time({ at }: { at: number }) {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <time className="msg-time" dateTime={d.toISOString()} title={d.toLocaleString()}>
      {today ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`}
    </time>
  );
}

/** A prompt being rewritten in place: saving runs it again, and what came after it goes. */
function EditPrompt({ message, onDone }: { message: Message; onDone: () => void }) {
  const t = useT();
  const [text, setText] = useState(messageText(message));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 320) + "px";
  }, [text]);
  const save = () => {
    if (!text.trim()) return;
    useStore.getState().editMessage(message.id, text);
    onDone();
  };
  return (
    <div className="edit-prompt" data-esc-layer>
      <textarea
        ref={ref}
        value={text}
        aria-label={t("Edit message")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (composing(e)) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }
        }}
      />
      <div className="edit-prompt-bar">
        <span className="hint">{t("Replies after this one will be replaced.")}</span>
        <button className="btn ghost small" onClick={onDone}>
          {t("Cancel")} <Keys combo="esc" />
        </button>
        <button className="btn primary small" onClick={save} disabled={!text.trim()}>
          {t("Send")} <Keys combo="↵" />
        </button>
      </div>
    </div>
  );
}

export const MessageView = memo(function MessageView({ message, isLast }: { message: Message; isLast: boolean }) {
  const t = useT();
  const models = useStore((s) => s.models);
  // Editing, retrying and running a plan wait until the session is idle (here and in other windows).
  const idle = useStore((s) => {
    const session = s.sessions.find((x) => x.id === s.activeId);
    return !!session && !s.runs[session.id] && !isStreaming(session);
  });
  const { retry, forkSession } = useStore.getState();
  // Only a message that has just been written animates in. Opening a thread shows its
  // history at once; fading all of it in would blank the screen for a moment.
  const [enter] = useState(() => Date.now() - message.createdAt < 1500);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);

  if (message.role === "user") {
    return (
      <div className={cx("msg user", enter && "enter", editing && "editing")}>
        {editing ? (
          <EditPrompt message={message} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="user-bubble">
              {(message.files?.length || message.attachments?.length) && (
                <div className="attachments">
                  {message.files?.map((f, i) => <FileChip key={`${f.name}-${i}`} file={f} />)}
                  {message.attachments?.map((a) => (
                    <span key={a} className="chip">
                      <Paperclip size={11} />
                      <span className="chip-name">{a}</span>
                    </span>
                  ))}
                </div>
              )}
              {messageText(message)}
            </div>
            <div className="msg-footer">
              <Time at={message.createdAt} />
              <CopyButton text={messageText(message)} />
              {idle && (
                <button className="msg-action" aria-label={t("Edit")} {...tip(t("Edit and send again"))} onClick={() => setEditing(true)}>
                  <Pencil size={14} />
                </button>
              )}
              <button className="msg-action" aria-label={t("Branch")} {...tip(t("Branch from here"))} onClick={() => forkSession(message.id)}>
                <GitBranch size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const streaming = message.status === "streaming";
  const modelName = models.find((m) => m.id === message.model)?.name ?? message.model;
  const lastPart = message.parts[message.parts.length - 1];
  // A finished plan can be carried out straight away.
  const plan = isLast && idle && message.mode === "plan" && message.status === "done" && !!messageText(message).trim();

  return (
    <div className={cx("msg assistant", streaming && "streaming", enter && "enter")}>
      {message.parts.map((p, i) => {
        if (p.type === "thinking") return <Thinking key={i} part={p} live={streaming} />;
        if (p.type === "tool") return <ToolCard key={p.id} tool={p} />;
        return <Markdown key={i} text={p.text} />;
      })}

      {streaming && (!lastPart || (lastPart.type === "tool" && lastPart.status !== "running" && lastPart.status !== "awaiting")) && (
        <div className="typing" role="status" aria-label={t("Working")}>
          <span />
          <span />
          <span />
        </div>
      )}
      {streaming && lastPart?.type === "text" && <span className="caret" />}

      {message.status === "error" && (
        <div className="msg-error" role="alert">
          <AlertCircle size={14} /> {message.error ?? t("Something went wrong.")}
        </div>
      )}
      {message.status === "cancelled" && <div className="msg-note">{t("Stopped by user")}</div>}

      {plan && (
        <div className="plan-run">
          <button
            className="btn primary small"
            onClick={() => {
              const s = useStore.getState();
              s.setMode("agent");
              void s.send(t("Go ahead with this plan."));
            }}
          >
            <Play size={13} /> {t("Run this plan")}
          </button>
          <span className="hint">{t("Switches to Agent mode and carries it out.")}</span>
        </div>
      )}

      {!streaming && (
        <div className="msg-footer">
          <CopyButton text={messageText(message)} />
          {isLast && idle && (
            <span className="retry-group">
              <button className="msg-action" aria-label={t("Retry")} {...tip(t("Retry"))} onClick={() => retry()}>
                <RotateCcw size={14} />
              </button>
              <button
                className="msg-action narrow"
                aria-label={t("Retry with another model")}
                {...tip(t("Retry with another model"))}
                onClick={(e) => setMenu(anchorBelow(e.currentTarget))}
              >
                <ChevronDown size={12} />
              </button>
            </span>
          )}
          <button className="msg-action" aria-label={t("Branch")} {...tip(t("Branch from here"))} onClick={() => forkSession(message.id)}>
            <GitBranch size={14} />
          </button>
          <span className="msg-meta">
            {modelName}
            {message.usage && (
              <>
                {" · "}
                {t("{input} in · {output} out", {
                  input: formatTokens(message.usage.inputTokens),
                  output: formatTokens(message.usage.outputTokens),
                })}
              </>
            )}
            {" · "}
            <Time at={message.createdAt} />
          </span>
        </div>
      )}
      {menu && (
        <ContextMenu
          at={menu}
          label={t("Retry with")}
          onClose={() => setMenu(null)}
          items={[
            { heading: t("Retry with") },
            ...models.map((m) => ({ id: m.id, label: m.name, checked: m.id === message.model, run: () => retry(m.id) })),
          ]}
        />
      )}
    </div>
  );
});
