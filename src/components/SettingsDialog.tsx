import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Eye, EyeOff, FilePen, Hand, Keyboard, KeyRound, LogOut, Minus, Palette, Plus, ShieldCheck, User, X, Zap } from "lucide-react";
import { SECTIONS } from "../lib/sections";
import { useStore, ZOOM_STEPS, type PermissionMode, type SettingsTab, type Theme } from "../lib/store";
import { SCHEMES, schemeInfo, useResolvedTheme, type SchemeId } from "../lib/theme";
import { toast } from "../lib/toast";
import { Avatar } from "./AccountMenu";
import { inTauri } from "../lib/agent";
import { cx, isMac, mod, modShift, trapTab, usePresence, useRestoreFocus, zoomKeys } from "../lib/util";
import { IconButton, Keys } from "./ui";

const TABS: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
  { id: "account", label: "Account", icon: User },
  { id: "general", label: "General", icon: Palette },
  { id: "providers", label: "Providers", icon: KeyRound },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
];

const PERMISSIONS: { id: PermissionMode; label: string; desc: string; icon: typeof Hand }[] = [
  { id: "ask", label: "Ask before actions", desc: "Approve every file edit and shell command.", icon: Hand },
  { id: "acceptEdits", label: "Auto-accept edits", desc: "Apply file edits automatically; still ask before running commands.", icon: FilePen },
  { id: "bypass", label: "Full auto", desc: "Never ask. Only use in sandboxed or disposable environments.", icon: Zap },
];

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const SHORTCUTS: { title: string; items: [action: string, keys: string][] }[] = [
  {
    title: "General",
    items: [
      ["Command palette", `${mod}K`],
      ["New window", `${modShift}N`],
      ["Settings", `${mod},`],
      ["Keyboard shortcuts", `${mod}/`],
      ["Toggle sidebar", `${mod}B`],
      ["Toggle side panel", `${mod}J`],
      ["Switch light / dark theme", `${modShift}L`],
      ["Zoom in", zoomKeys.in],
      ["Zoom out", zoomKeys.out],
      ["Reset zoom", zoomKeys.reset],
    ],
  },
  {
    title: "Sessions",
    items: [
      ["New session", `${mod}N`],
      ["Add a folder", `${mod}O`],
      ...SECTIONS.map((s): [string, string] => [`Go to ${s.label}`, `${mod}${s.key}`]),
      ["Search sessions", `${mod}F`],
      ["Previous session", `${modShift}[`],
      ["Next session", `${modShift}]`],
      ["Rename selected session", "F2"],
      ["Delete selected session", isMac ? "⌘⌫" : "Del"],
      ["Delete open session", isMac ? "⇧⌘⌫" : "Ctrl+Shift+⌫"],
    ],
  },
  {
    title: "Conversation",
    items: [
      ["Focus the message box", `${mod}L`],
      ["Send message", "↵"],
      ["New line", "⇧↵"],
      ["Recall last prompt", "↑"],
      ["Switch Agent / Plan", `${modShift}M`],
      ["Copy last response", `${modShift}C`],
      ["Allow a request", isMac ? "⌘↵" : "Ctrl+↵"],
      ["Deny a request", isMac ? "⌘⌫" : "Ctrl+⌫"],
      ["Stop agent", "Esc"],
    ],
  },
  {
    title: "Terminal",
    items: [
      ["Toggle terminal", "Ctrl+`"],
      ["New terminal", "Ctrl+Shift+`"],
      ["Terminal mode in Code (CLI agent)", `${modShift}T`],
    ],
  },
];

/**
 * Miniature window on the theme and color scheme cards, drawn with the real tokens of the
 * theme and scheme it stands for. "System" shows the light and dark halves side by side.
 */
function ThemePreview({ theme, scheme }: { theme: Theme; scheme: SchemeId }) {
  const scenes = theme === "system" ? (["light", "dark"] as const) : [theme];
  return (
    <span className={cx("theme-preview", theme)} aria-hidden>
      {scenes.map((scene) => (
        <span key={scene} className={cx("tp-scene", scene)} data-theme={scene} data-scheme={scheme}>
          <span className="tp-window">
            <span className="tp-side" />
            <span className="tp-main">
              <span className="tp-line" />
              <span className="tp-line short" />
              <span className="tp-box" />
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-…" },
  { id: "openai", name: "OpenAI", placeholder: "sk-…" },
  { id: "google", name: "Google AI", placeholder: "AIza…" },
  { id: "ollama", name: "Ollama endpoint", placeholder: "http://localhost:11434" },
];

function ProviderField({ id, name, placeholder }: (typeof PROVIDERS)[number]) {
  const value = useStore((s) => s.settings.apiKeys[id] ?? "");
  const [show, setShow] = useState(false);
  const isUrl = id === "ollama";
  return (
    <label className="field">
      <span className="field-label">
        {name}
        <span className={cx("badge", value && "on")}>{value ? "Configured" : "Not set"}</span>
      </span>
      <span className="input-wrap">
        <input
          type={show || isUrl ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            const s = useStore.getState();
            s.updateSettings({ apiKeys: { ...s.settings.apiKeys, [id]: e.target.value } });
          }}
        />
        {!isUrl && (
          <IconButton label={show ? "Hide key" : "Show key"} onClick={() => setShow((x) => !x)}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </IconButton>
        )}
      </span>
    </label>
  );
}

function AccountTab() {
  const account = useStore((s) => s.account);
  const { updateAccount, signIn, signOut } = useStore.getState();
  const [draft, setDraft] = useState({ name: "", email: "" });

  if (!account) {
    const valid = draft.name.trim() && /\S+@\S+\.\S+/.test(draft.email);
    return (
      <>
        <h2>Sign in</h2>
        <p className="muted">Create a local profile. It stays on this device until a real identity provider is connected.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) signIn({ name: draft.name.trim(), email: draft.email.trim(), plan: "Free" });
          }}
        >
          <label className="field">
            <span className="field-label">Name</span>
            <span className="input-wrap text">
              <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Your name" />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <span className="input-wrap text">
              <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="you@example.com" />
            </span>
          </label>
          <button className="btn primary" type="submit" disabled={!valid}>
            Sign in
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <h2>Account</h2>
      <div className="profile-card">
        <Avatar name={account.name} size={48} />
        <div className="profile-text">
          <strong>{account.name}</strong>
          <span>{account.email}</span>
        </div>
        <span className="badge on">{account.plan} plan</span>
      </div>
      <label className="field">
        <span className="field-label">Display name</span>
        <span className="input-wrap text">
          <input value={account.name} onChange={(e) => updateAccount({ name: e.target.value })} />
        </span>
      </label>
      <label className="field">
        <span className="field-label">Email</span>
        <span className="input-wrap text">
          <input type="email" value={account.email} onChange={(e) => updateAccount({ email: e.target.value })} />
        </span>
      </label>
      <button
        className="btn ghost danger"
        onClick={() => {
          signOut();
          toast("Logged out");
        }}
      >
        <LogOut size={14} /> Log out
      </button>
    </>
  );
}

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const settings = useStore((s) => s.settings);
  const { setSettingsOpen, updateSettings, zoomBy, resetZoom } = useStore.getState();
  const zoom = settings.zoom ?? 1;
  const scheme = schemeInfo(settings.scheme).id;
  const resolvedTheme = useResolvedTheme();
  const tab = useStore((s) => s.settingsTab);
  const setTab = (settingsTab: SettingsTab) => useStore.setState({ settingsTab });
  const { mounted, closing } = usePresence(open, 140);
  const dialog = useRef<HTMLDivElement>(null);
  useRestoreFocus(open);
  // Focus the dialog itself: Esc and Tab work at once, without a focus ring on some arbitrary control.
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);
  if (!mounted) return null;
  const close = () => setSettingsOpen(false);
  const tabIndex = TABS.findIndex((t) => t.id === tab);

  return (
    <div className={cx("overlay", closing && "closing")} onMouseDown={close} onKeyDown={(e) => e.key === "Escape" && close()}>
      <div
        ref={dialog}
        className="dialog settings"
        role="dialog"
        aria-modal
        aria-label="Settings"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-title">Settings</div>
          <div className="settings-tabs" style={{ "--i": tabIndex } as CSSProperties}>
            <span className="settings-thumb" aria-hidden />
            {TABS.map((t) => (
              <button
                key={t.id}
                className={cx("settings-tab", tab === t.id && "on")}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>
        </nav>
        <section className="settings-body">
          <IconButton label="Close" kbd="Esc" className="close" onClick={close}>
            <X size={16} />
          </IconButton>

          {/* Keyed so each section fades in when selected. */}
          <div className="settings-pane" key={tab}>
            {tab === "account" && <AccountTab />}

            {tab === "general" && (
              <>
                <h2>General</h2>
                <div className="field">
                  <span className="field-label">Theme</span>
                  <div className="theme-cards" role="radiogroup" aria-label="Theme">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        role="radio"
                        aria-checked={settings.theme === t.id}
                        className={cx("theme-card", settings.theme === t.id && "on")}
                        onClick={() => updateSettings({ theme: t.id })}
                      >
                        <ThemePreview theme={t.id} scheme={scheme} />
                        <span className="theme-card-label">
                          {t.label}
                          <Check size={13} className="theme-card-check" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">
                    Color scheme
                    <span className="field-aside">{schemeInfo(scheme).hint}</span>
                  </span>
                  <div className="theme-cards scheme-cards" role="radiogroup" aria-label="Color scheme">
                    {SCHEMES.map((s) => (
                      <button
                        key={s.id}
                        role="radio"
                        aria-checked={scheme === s.id}
                        className={cx("theme-card", scheme === s.id && "on")}
                        onClick={() => updateSettings({ scheme: s.id })}
                      >
                        <ThemePreview theme={resolvedTheme} scheme={s.id} />
                        <span className="theme-card-label">
                          {s.name}
                          <Check size={13} className="theme-card-check" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Zoom</span>
                  <div className="zoom-control">
                    <IconButton label="Zoom out" kbd={zoomKeys.out} disabled={zoom <= ZOOM_STEPS[0]} onClick={() => zoomBy(-1)}>
                      <Minus size={14} />
                    </IconButton>
                    <span className="zoom-value">{Math.round(zoom * 100)}%</span>
                    <IconButton label="Zoom in" kbd={zoomKeys.in} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => zoomBy(1)}>
                      <Plus size={14} />
                    </IconButton>
                    <button className="btn ghost" disabled={zoom === 1} onClick={resetZoom}>
                      Reset
                    </button>
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Runtime</span>
                  <p className="muted">
                    {inTauri ? "Running in the Tauri shell — agent runs in the Rust backend." : "Running in a browser — using the in-page mock agent."}
                  </p>
                </div>
              </>
            )}

            {tab === "providers" && (
              <>
                <h2>Providers</h2>
                <p className="muted">
                  Keys are stored locally on this device. The bundled backend is a mock provider; wire real APIs in{" "}
                  <code>src-tauri/src/agent.rs</code>.
                </p>
                {PROVIDERS.map((p) => (
                  <ProviderField key={p.id} {...p} />
                ))}
              </>
            )}

            {tab === "permissions" && (
              <>
                <h2>Permissions</h2>
                <p className="muted">Control when the agent needs your approval.</p>
                <div className="radio-list">
                  {PERMISSIONS.map((p) => (
                    <label key={p.id} className={cx("radio-card", settings.permissionMode === p.id && "on", p.id === "bypass" && "caution")}>
                      <input
                        type="radio"
                        name="perm"
                        checked={settings.permissionMode === p.id}
                        onChange={() => updateSettings({ permissionMode: p.id })}
                      />
                      <span className="radio-icon">
                        <p.icon size={15} />
                      </span>
                      <span className="radio-text">
                        <strong>{p.label}</strong>
                        <small>{p.desc}</small>
                      </span>
                      <span className="radio-dot" aria-hidden />
                    </label>
                  ))}
                </div>
              </>
            )}

            {tab === "shortcuts" && (
              <>
                <h2>Keyboard shortcuts</h2>
                {SHORTCUTS.map((group) => (
                  <div key={group.title} className="shortcut-group">
                    <h3>{group.title}</h3>
                    <dl className="shortcuts">
                      {group.items.map(([action, keys]) => (
                        <div key={action}>
                          <dt>{action}</dt>
                          <dd>
                            <Keys combo={keys} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
