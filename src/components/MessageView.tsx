import { memo, useEffect, useState } from "react";
import { AlertCircle, Brain, ChevronRight, Paperclip, RotateCcw } from "lucide-react";
import type { Message, Part } from "../lib/types";
import { messageText, useStore } from "../lib/store";
import { cx, formatTokens } from "../lib/util";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";
import { Collapse, CopyButton, tip } from "./ui";

function Thinking({ part, live }: { part: Extract<Part, { type: "thinking" }>; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const active = live && !part.endedAt;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  const secs = Math.max(1, Math.round(((part.endedAt ?? Date.now()) - part.startedAt) / 1000));

  return (
    <div className={cx("thinking", open && "open", active && "active")}>
      <button className="thinking-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Brain size={14} />
        <span className={cx(active && "shimmer")}>{active ? "Thinking…" : `Thought for ${secs}s`}</span>
        <ChevronRight size={13} className={cx("chev", open && "open")} />
      </button>
      <Collapse open={open}>
        <div className="thinking-body">{part.text}</div>
      </Collapse>
    </div>
  );
}

export const MessageView = memo(function MessageView({ message, isLast }: { message: Message; isLast: boolean }) {
  const models = useStore((s) => s.models);
  const retry = useStore((s) => s.retry);
  // Only a message that has just been written animates in. Opening a thread shows its
  // history at once; fading all of it in would blank the screen for a moment.
  const [enter] = useState(() => Date.now() - message.createdAt < 1500);

  if (message.role === "user") {
    return (
      <div className={cx("msg user", enter && "enter")}>
        <div className="user-bubble">
          {message.attachments && (
            <div className="attachments">
              {message.attachments.map((a) => (
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
          <CopyButton text={messageText(message)} />
        </div>
      </div>
    );
  }

  const streaming = message.status === "streaming";
  const modelName = models.find((m) => m.id === message.model)?.name ?? message.model;
  const lastPart = message.parts[message.parts.length - 1];

  return (
    <div className={cx("msg assistant", streaming && "streaming", enter && "enter")}>
      {message.parts.map((p, i) => {
        if (p.type === "thinking") return <Thinking key={i} part={p} live={streaming} />;
        if (p.type === "tool") return <ToolCard key={p.id} tool={p} />;
        return <Markdown key={i} text={p.text} />;
      })}

      {streaming && (!lastPart || (lastPart.type === "tool" && lastPart.status !== "running" && lastPart.status !== "awaiting")) && (
        <div className="typing" role="status" aria-label="Working">
          <span />
          <span />
          <span />
        </div>
      )}
      {streaming && lastPart?.type === "text" && <span className="caret" />}

      {message.status === "error" && (
        <div className="msg-error" role="alert">
          <AlertCircle size={14} /> {message.error ?? "Something went wrong."}
        </div>
      )}
      {message.status === "cancelled" && <div className="msg-note">Stopped by user</div>}

      {!streaming && (
        <div className="msg-footer">
          <CopyButton text={messageText(message)} />
          {isLast && (
            <button className="msg-action" aria-label="Retry" {...tip("Retry")} onClick={retry}>
              <RotateCcw size={14} />
            </button>
          )}
          <span className="msg-meta">
            {modelName}
            {message.usage && (
              <>
                {" · "}
                {formatTokens(message.usage.inputTokens)} in · {formatTokens(message.usage.outputTokens)} out
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
});
