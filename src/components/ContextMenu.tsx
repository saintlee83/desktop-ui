import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, type LucideIcon } from "lucide-react";
import { cssZoom, cx, menuKeyDown } from "../lib/util";
import { Keys } from "./ui";

export type MenuEntry =
  | { id: string; label: string; icon?: LucideIcon; kbd?: string; danger?: boolean; checked?: boolean; run: () => void }
  | { heading: string }
  | "separator";

/** Where a menu opens: at the pointer, or hanging from the button that opened it. */
export interface MenuAnchor {
  x: number;
  y: number;
  /** Opened from the keyboard or a button, so the first item takes focus visibly. */
  keyboard?: boolean;
}

export const anchorBelow = (el: Element): MenuAnchor => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 4, keyboard: true };
};

/**
 * A menu at a point in the window, for right-clicks and "more" buttons. It keeps
 * itself on screen, takes the arrow keys, and closes on a choice, Esc, a click
 * elsewhere, or anything that moves what it was opened on.
 */
export function ContextMenu({ at, label, items, onClose }: { at: MenuAnchor; label: string; items: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Read through a ref, so a parent re-rendering with a new callback doesn't reopen the menu.
  const closer = useRef(onClose);
  closer.current = onClose;

  // Placed after measuring: flipped up or pulled left when it would run off the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const zoom = cssZoom();
    const [w, h] = [el.offsetWidth, el.offsetHeight];
    const [vw, vh] = [window.innerWidth / zoom, window.innerHeight / zoom];
    const [x, y] = [at.x / zoom, at.y / zoom];
    setPos({ left: Math.max(8, Math.min(x, vw - w - 8)), top: y + h > vh - 8 ? Math.max(8, y - h - 4) : y });
  }, [at]);

  // Focus goes to the first item once the menu is placed (until then it is hidden, and can't take it).
  const placed = pos !== null;
  useEffect(() => {
    if (placed) ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    const el = ref.current;
    const before = document.activeElement as HTMLElement | null;
    const onClose = () => closer.current();
    const away = (e: Event) => {
      if (!el?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away, true);
    document.addEventListener("wheel", away, { capture: true, passive: true });
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("wheel", away, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      // Focus returns to the row unless the choice already put it somewhere (a rename field, a dialog).
      if (before?.isConnected && (!document.activeElement || document.activeElement === document.body || el?.contains(document.activeElement))) {
        before.focus({ preventScroll: true });
      }
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      className="popover context-menu"
      role="menu"
      aria-label={label}
      data-esc-layer
      style={pos ? pos : { left: 0, top: 0, visibility: "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        menuKeyDown(e);
        if (e.key === "Tab") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : "heading" in item ? (
          <div key={i} className="menu-label">
            {item.heading}
          </div>
        ) : (
          <button
            key={item.id}
            role="menuitem"
            className={cx("menu-item", item.danger && "danger", item.checked && "selected")}
            onPointerMove={(e) => e.currentTarget.focus({ preventScroll: true })}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.icon && <item.icon size={14} className="context-icon" />}
            <span className="menu-item-label">{item.label}</span>
            {item.checked !== undefined && <Check size={14} className="menu-check" />}
            {item.kbd && <Keys combo={item.kbd} />}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
