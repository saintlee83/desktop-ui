import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useToasts, type Toast } from "../lib/toast";
import { cx } from "../lib/util";

const LIFETIME = 5000;
const EXIT_MS = 180;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const [closing, setClosing] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(LIFETIME);

  // Auto-dismiss, paused while hovered or focused so Undo stays reachable.
  useEffect(() => {
    if (closing || paused) return;
    const started = performance.now();
    const t = setTimeout(() => setClosing(true), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(1200, remaining.current - (performance.now() - started));
    };
  }, [closing, paused]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => dismiss(toast.id), EXIT_MS);
    return () => clearTimeout(t);
  }, [closing, dismiss, toast.id]);

  return (
    <div
      className={cx("toast", closing && "closing")}
      role="status"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action?.run();
            setClosing(true);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" aria-label="Dismiss" onClick={() => setClosing(true)}>
        <X size={13} />
      </button>
    </div>
  );
}

/** Stack of transient notifications. Mount once at the root. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
