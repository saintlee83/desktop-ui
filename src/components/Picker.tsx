import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { cssZoom, cx, menuKeyDown, useClickOutside, usePresence } from "../lib/util";
import { tip } from "./ui";

export interface PickerItem<T extends string> {
  id: T;
  name: string;
  description?: string;
  /** Short trailing tag, e.g. a context window size. */
  meta?: string;
  icon?: LucideIcon;
}

export interface PickerGroup<T extends string> {
  label?: string;
  items: PickerItem<T>[];
}

/**
 * A pill showing the current choice that opens a menu of the others (model, mode, CLI).
 * The menu opens toward whichever side has more room and is fully keyboard-navigable.
 */
export function Picker<T extends string>({
  label,
  value,
  onChange,
  groups,
  align = "right",
  width = 320,
  hint,
  kbd,
  className,
  onDone,
}: {
  /** Accessible name of the menu, and of the pill when the current choice is unknown. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  groups: PickerGroup<T>[];
  /** Which edge of the pill the menu lines up with. */
  align?: "left" | "right";
  width?: number;
  /** Tooltip on the pill, with an optional shortcut. */
  hint?: string;
  kbd?: string;
  className?: string;
  /** Called after the menu closes by choosing or Esc, e.g. to hand focus back. */
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { mounted, closing } = usePresence(open, 120);
  // Open toward whichever side has more room, capped to fit (the home composer sits mid-window).
  const [placement, setPlacement] = useState<{ up: boolean; maxHeight: number }>({ up: true, maxHeight: 420 });
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  const current = groups.flatMap((g) => g.items).find((i) => i.id === value);

  // Keyboard users land on the current choice.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, [open]);

  const toggle = () => {
    if (!open && ref.current) {
      const zoom = cssZoom();
      const r = ref.current.getBoundingClientRect();
      const margin = 12;
      const titlebar = document.querySelector(".titlebar")?.getBoundingClientRect().bottom ?? 0;
      const above = (r.top - titlebar) / zoom - margin - 8;
      const below = (window.innerHeight - r.bottom) / zoom - margin - 8;
      const up = above >= Math.min(420, below) || above >= 320;
      setPlacement({ up, maxHeight: Math.max(160, Math.min(420, up ? above : below)) });
    }
    setOpen((o) => !o);
  };

  return (
    <div className={cx("popover-anchor", className)} ref={ref}>
      <button
        className={cx("pill", open && "open")}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.name ?? "none"}`}
        {...(hint && !open ? tip(hint, kbd, "top") : {})}
      >
        {current?.icon && <current.icon size={14} className="pill-icon" />}
        <span>{current?.name ?? `Select ${label.toLowerCase()}`}</span>
        <ChevronDown size={13} className="pill-chev" />
      </button>
      {mounted && (
        <div
          ref={menu}
          className={cx("popover picker-menu", placement.up ? "up" : "down", `align-${align}`, closing && "closing")}
          role="listbox"
          aria-label={label}
          data-esc-layer
          style={{ width, maxHeight: placement.maxHeight }}
          onKeyDown={(e) => {
            menuKeyDown(e);
            if (e.key === "Tab") setOpen(false);
            if (e.key === "Escape") onDone?.();
          }}
        >
          {groups.map((g, i) => (
            <div key={g.label ?? i} role="group" aria-label={g.label}>
              {g.label && <div className="menu-label">{g.label}</div>}
              {g.items.map((item) => (
                <button
                  key={item.id}
                  role="option"
                  aria-selected={item.id === value}
                  className={cx("menu-item", item.id === value && "selected")}
                  onPointerMove={(e) => e.currentTarget.focus({ preventScroll: true })}
                  onClick={() => {
                    setOpen(false);
                    onChange(item.id);
                    onDone?.();
                  }}
                >
                  {item.icon && (
                    <span className="menu-item-icon">
                      <item.icon size={15} />
                    </span>
                  )}
                  <span className="menu-item-text">
                    <span>{item.name}</span>
                    {item.description && <small>{item.description}</small>}
                  </span>
                  {item.meta && <span className="menu-item-meta">{item.meta}</span>}
                  <Check size={14} className="menu-check" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
