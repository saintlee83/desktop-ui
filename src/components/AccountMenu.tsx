import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsUpDown, Keyboard, LogIn, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { useT } from "../lib/i18n";
import { useStore, type Theme } from "../lib/store";
import { toast } from "../lib/toast";
import { cx, menuKeyDown, mod, useClickOutside, usePresence } from "../lib/util";
import { Keys, Segmented } from "./ui";

/** Initials on a color derived from the name, so each profile gets a stable hue. */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((w) => Array.from(w)[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <span
      className="avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        // Graphite with a trace of a hue taken from the name: people differ, the palette stays quiet.
        background: `linear-gradient(160deg, hsl(${hue} 9% 50%), hsl(${hue} 12% 27%))`,
      }}
    >
      {initials}
    </span>
  );
}

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

/** Account button pinned to the bottom-left of the sidebar, with a menu that opens upward. */
export function AccountMenu() {
  const t = useT();
  const account = useStore((s) => s.account);
  const theme = useStore((s) => s.settings.theme);
  const { openSettings, updateSettings, signOut } = useStore.getState();
  const [open, setOpen] = useState(false);
  const { mounted, closing } = usePresence(open, 120);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  // Focus the menu so arrow keys work straight away.
  useEffect(() => {
    if (open) menu.current?.focus({ preventScroll: true });
  }, [open]);

  if (!account) {
    return (
      <button className="account-signin" onClick={() => openSettings("account")}>
        <LogIn size={15} />
        <span>{t("Sign in")}</span>
      </button>
    );
  }

  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="account popover-anchor" ref={ref}>
      <button
        className={cx("account-button", open && "open")}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={account.name} />
        <span className="account-text">
          <span className="account-name">{account.name}</span>
          <span className="account-sub">{t("{plan} plan", { plan: account.plan })}</span>
        </span>
        <ChevronsUpDown size={14} className="account-chev" />
      </button>

      {mounted && (
        <div
          ref={menu}
          className={cx("popover account-menu", closing && "closing")}
          role="menu"
          aria-label={t("Account")}
          tabIndex={-1}
          data-esc-layer
          onKeyDown={(e) => {
            // Arrow keys inside the theme switch belong to it.
            if (!(e.target as Element).closest(".segmented")) menuKeyDown(e);
          }}
        >
          <div className="account-menu-header">
            <Avatar name={account.name} size={34} />
            <div className="account-text">
              <span className="account-name">{account.name}</span>
              <span className="account-sub">{account.email}</span>
            </div>
          </div>
          <div className="menu-sep" />
          <button role="menuitem" className="menu-item" onClick={choose(() => openSettings("account"))}>
            <User size={15} />
            <span className="menu-item-label">{t("Account")}</span>
          </button>
          <button role="menuitem" className="menu-item" onClick={choose(() => openSettings("general"))}>
            <Settings size={15} />
            <span className="menu-item-label">{t("Settings")}</span>
            <Keys combo={`${mod},`} />
          </button>
          <button role="menuitem" className="menu-item" onClick={choose(() => openSettings("shortcuts"))}>
            <Keyboard size={15} />
            <span className="menu-item-label">{t("Keyboard shortcuts")}</span>
          </button>
          <div className="menu-row">
            <span className="menu-item-label">{t("Theme")}</span>
            <Segmented
              className="icons"
              label={t("Theme")}
              value={theme}
              onChange={(theme) => updateSettings({ theme })}
              options={THEMES.map((x) => ({ id: x.id, icon: x.icon, hint: t(x.label) }))}
            />
          </div>
          <div className="menu-sep" />
          <button
            role="menuitem"
            className="menu-item danger"
            onClick={choose(() => {
              signOut();
              toast(t("Logged out"));
            })}
          >
            <LogOut size={15} />
            <span className="menu-item-label">{t("Log out")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
