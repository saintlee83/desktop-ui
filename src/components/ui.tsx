import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Check, Copy, type LucideIcon } from "lucide-react";
import { copyText, cssZoom, cx, usePresence } from "../lib/util";

/** Tooltip props for any element: text plus an optional shortcut. Rendered by <Tooltips />. */
export const tip = (text: string, kbd?: string, side?: "top" | "bottom") => ({
  "data-tip": text,
  "data-tip-kbd": kbd,
  "data-tip-side": side,
});

export function IconButton({
  label,
  kbd,
  tipSide,
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  kbd?: string;
  tipSide?: "top" | "bottom";
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} {...tip(label, kbd, tipSide)} className={cx("icon-btn", active && "active", className)} {...rest}>
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** "⌘K" → [⌘, K], "Ctrl+Shift+`" → [Ctrl, Shift, `], "⌘+" → [⌘, +]. */
export function splitKeys(combo: string) {
  const keys: string[] = [];
  let rest = combo;
  for (;;) {
    const m = /^(⌘|⌥|⇧|⌃|Ctrl|Shift|Alt)[+ ]?(?=.)/.exec(rest);
    if (!m) break;
    keys.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  if (rest) keys.push(rest);
  return keys;
}

/** A shortcut rendered as individual key caps. */
export function Keys({ combo, className }: { combo: string; className?: string }) {
  return (
    <span className={cx("keys", className)}>
      {splitKeys(combo).map((k, i) => (
        <kbd key={i} className="kbd">
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

/** Copy button whose icon flips to a check for a moment after a successful copy. */
export function CopyButton({ text, className = "msg-action", size = 14 }: { text: string | (() => string); className?: string; size?: number }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      className={cx(className, done && "done")}
      aria-label="Copy"
      {...tip(done ? "Copied" : "Copy")}
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyText(typeof text === "function" ? text() : text)) setDone(true);
      }}
    >
      {done ? <Check size={size} className="pop" /> : <Copy size={size} />}
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label?: ReactNode;
  icon?: LucideIcon;
  /** Tooltip; also the accessible name when there is no label. */
  hint?: string;
  kbd?: string;
  badge?: ReactNode;
}

/** Radio group with a thumb that slides to the selected option. Arrow keys move the selection. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  iconSize = 13,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  className?: string;
  iconSize?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const ids = options.map((o) => o.id).join("|");

  useLayoutEffect(() => {
    const el = root.current;
    const th = thumb.current;
    if (!el || !th) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>('[aria-checked="true"]');
      th.style.opacity = on ? "1" : "0";
      if (!on) return;
      th.style.width = `${on.offsetWidth}px`;
      th.style.transform = `translateX(${on.offsetLeft}px)`;
    };
    place();
    // Labels and badges can change width (fonts, counts) without the value changing.
    const ro = new ResizeObserver(place);
    for (const b of el.querySelectorAll("button")) ro.observe(b);
    return () => ro.disconnect();
  }, [value, ids]);

  // The thumb only starts animating after its first placement, so it doesn't fly in from the corner.
  useEffect(() => {
    const id = requestAnimationFrame(() => root.current?.setAttribute("data-ready", ""));
    return () => cancelAnimationFrame(id);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.id);
    root.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
  };

  return (
    <div ref={root} className={cx("segmented", className)} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      <span ref={thumb} className="seg-thumb" aria-hidden />
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            data-id={o.id}
            aria-checked={on}
            aria-label={o.label ? undefined : o.hint}
            tabIndex={on ? 0 : -1}
            className={cx(on && "on")}
            {...(o.hint ? tip(o.hint, o.kbd) : {})}
            onClick={() => onChange(o.id)}
          >
            {o.icon && <o.icon size={iconSize} />}
            {o.label}
            {o.badge}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Animates its children's height open and closed. Content that is already open
 * when it mounts appears without animating (e.g. when switching sessions).
 */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const { mounted, closing } = usePresence(open, 200);
  const [toggled, setToggled] = useState(false);
  const prev = useRef(open);
  useLayoutEffect(() => {
    if (prev.current !== open) {
      prev.current = open;
      setToggled(true);
    }
  }, [open]);
  if (!mounted) return null;
  return (
    <div className={cx("collapse", closing ? "closing" : toggled && "opening", className)}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}

/** Wraps the parts of `text` that match any word of `query` in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return (
    <>
      {text.split(new RegExp(`(${pattern})`, "ig")).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

/**
 * Drag handle on a column edge. While dragging it calls `apply` with each width
 * (cheap, e.g. set a CSS variable) and `commit` once on release.
 */
export function ColResizer({
  edge,
  label,
  width,
  min,
  max,
  apply,
  commit,
  reset,
}: {
  /** Which edge of its column the handle sits on. */
  edge: "left" | "right";
  label: string;
  width: number;
  min: number;
  max: () => number;
  apply: (width: number) => void;
  commit: (width: number) => void;
  reset: () => void;
}) {
  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const zoom = cssZoom();
    const x0 = e.clientX;
    const limit = Math.max(min, max());
    let w = width;
    el.setPointerCapture(e.pointerId);
    el.setAttribute("data-dragging", "");
    document.body.classList.add("resizing-col");
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / zoom;
      w = Math.round(Math.min(limit, Math.max(min, width + (edge === "right" ? d : -d))));
      apply(w);
    };
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeAttribute("data-dragging");
      document.body.classList.remove("resizing-col");
      commit(w);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };
  return (
    <div
      className={cx("col-resize", `on-${edge}`)}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={start}
      onDoubleClick={reset}
    />
  );
}
