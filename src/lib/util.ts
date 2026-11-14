import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { flushSync } from "react-dom";

/** Counts view transitions, so a superseded one doesn't clear the marker of the one that replaced it. */
let transitions = 0;

/**
 * Runs a state change inside a View Transition (when supported). The callback
 * runs asynchronously in that case, so nothing may depend on it having run.
 *
 * `kind` says what moves: "dock" glides the composer between the middle of the
 * home screen and the bottom of a thread; "fade" only cross-fades the window
 * (theme, switching to the terminal view). Changes that leave the composer where
 * it is should not use a transition at all: cross-fading a screen into a nearly
 * identical one reads as a blink.
 */
export function withViewTransition(update: () => void, kind: "dock" | "fade" = "dock") {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<unknown>; finished: Promise<unknown> };
  };
  if (!doc.startViewTransition || reducedMotion()) {
    update();
    return;
  }
  // styles.css names the composer as its own transition group only while docking.
  const root = document.documentElement;
  const id = ++transitions;
  root.dataset.vt = kind;
  const done = () => {
    if (transitions === id) delete root.dataset.vt;
  };
  const transition = doc.startViewTransition(() => flushSync(update));
  transition.finished.then(done, done);
  // A transition is skipped (the update still runs) when the window is hidden or another one starts.
  transition.ready.catch(() => {});
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Page-level CSS zoom (the browser fallback for the zoom setting). 1 inside Tauri, which zooms natively. */
export const cssZoom = () => parseFloat(document.documentElement.style.zoom) || 1;

export const basename = (path: string) => path.split(/[\\/]/).pop() || path;

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const mod = isMac ? "⌘" : "Ctrl+";
/** Prefix for shortcuts that add Shift, in each platform's usual order: "⇧⌘N", "Ctrl+Shift+N". */
export const modShift = isMac ? "⇧⌘" : "Ctrl+Shift+";
export const zoomKeys = { in: isMac ? "⌘+" : "Ctrl +", out: isMac ? "⌘−" : "Ctrl −", reset: `${mod}0` };

export function relativeTime(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dateGroup(ts: number) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const day = 86_400_000;
  if (ts >= today) return "Today";
  if (ts >= today - day) return "Yesterday";
  if (ts >= today - 7 * day) return "Previous 7 days";
  if (ts >= today - 30 * day) return "Previous 30 days";
  return "Older";
}

export const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`;

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onOutside, active]);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Keeps something mounted for `exitMs` after `open` turns false so it can play an
 * exit animation. Render while `mounted`; add a closing class while `closing`.
 */
export function usePresence(open: boolean, exitMs = 150) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const t = setTimeout(() => setPresent(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);
  return { mounted: open || present, closing: !open && present };
}

/** While `open`, remembers what had focus and hands it back on close (if it still exists). */
export function useRestoreFocus(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      if (prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, [open]);
}

/** Eased number that follows `value`, for counters. Snaps when motion is reduced. */
export function useTween(value: number, ms = 450) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    if (a === value) return;
    if (reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const cur = a + (value - a) * (1 - Math.pow(1 - p, 3));
      from.current = cur;
      setShown(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** Arrow/Home/End roving focus for menus and listboxes. Attach to the menu container. */
export function menuKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"]')].filter(
    (el) => !el.hasAttribute("disabled"),
  );
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? i + 1 : i < 0 ? items.length - 1 : i - 1;
  items[(next + items.length) % items.length].focus();
}

/** Keeps Tab focus cycling inside a dialog. Attach to the dialog container. */
export function trapTab(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const focusable = [
    ...e.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === e.currentTarget)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
