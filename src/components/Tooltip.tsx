import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cssZoom, cx } from "../lib/util";
import { Keys } from "./ui";

interface Tip {
  text: string;
  kbd?: string;
  /** Anchor point in page coordinates: horizontal center, and the edge the tip hangs from. */
  x: number;
  y: number;
  side: "top" | "bottom";
}

const SHOW_DELAY = 450;
/** After one tooltip has shown, neighbours appear almost immediately (scanning a toolbar). */
const WARM_DELAY = 80;
const WARM_WINDOW = 400;

/**
 * One tooltip layer for the whole app. Any element with `data-tip` gets a tooltip
 * on hover or keyboard focus; `data-tip-kbd` adds a shortcut, `data-tip-side`
 * forces "top" or "bottom". Mount once at the root.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    let shown = false;
    let lastHidden = -Infinity;

    const hide = () => {
      clearTimeout(timer);
      if (shown) lastHidden = performance.now();
      shown = false;
      current = null;
      setTip(null);
    };

    const show = (el: HTMLElement) => {
      if (!el.isConnected || !el.dataset.tip) return;
      const zoom = cssZoom();
      const r = el.getBoundingClientRect();
      const forced = el.dataset.tipSide;
      const side = forced === "top" || forced === "bottom" ? forced : r.bottom + 48 > window.innerHeight ? "top" : "bottom";
      shown = true;
      setTip({
        text: el.dataset.tip,
        kbd: el.dataset.tipKbd || undefined,
        x: (r.left + r.width / 2) / zoom,
        y: (side === "top" ? r.top : r.bottom) / zoom,
        side,
      });
    };

    const target = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tip]") : null);

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = target(e);
      if (el === current) return;
      hide();
      if (!el) return;
      current = el;
      const warm = performance.now() - lastHidden < WARM_WINDOW;
      timer = window.setTimeout(() => show(el), warm ? WARM_DELAY : SHOW_DELAY);
    };
    const onFocus = (e: FocusEvent) => {
      const el = target(e);
      // Keyboard focus only: a click also focuses, and should not pop the tip back up.
      if (!el || !el.matches(":focus-visible")) return;
      hide();
      current = el;
      show(el);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Center on the anchor, then nudge back inside the window if it would overflow.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const half = el.offsetWidth / 2;
    const vw = window.innerWidth / cssZoom();
    const x = Math.min(vw - half - 8, Math.max(half + 8, tip.x));
    el.style.left = `${x}px`;
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={box} className={cx("tooltip", tip.side)} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
      {tip.kbd && <Keys combo={tip.kbd} />}
    </div>
  );
}
