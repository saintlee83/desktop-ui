import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Database, Download, Eye, EyeOff, FilePen, Hand, Keyboard, KeyRound, LogOut, Minus, Palette, Plus, ShieldCheck, TextQuote, Trash2, Upload, User, X, Zap } from "lucide-react";
import { SECTIONS } from "../lib/sections";
import { useStore, ZOOM_STEPS, type Language, type PermissionMode, type SendKey, type SettingsTab, type Theme } from "../lib/store";
import { STORAGE_LIMIT, exportAll, importBackup, storageUsed } from "../lib/data";
import { setSecret } from "../lib/native";
import { formatSize } from "../lib/attach";
import { tn, useT } from "../lib/i18n";
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
  { id: "snippets", label: "Snippets", icon: TextQuote },
  { id: "data", label: "Data", icon: Database },
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

/** Action names are in English, translated where shown; `section` fills "Go to {label}". */
const shortcuts = (sendKey: SendKey): { title: string; items: [action: string, keys: string, section?: string][] }[] => [
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
      ...SECTIONS.map((s): [string, string, string] => ["Go to {label}", `${mod}${s.key}`, s.label]),
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
      ["Send message (while the agent runs: queue it)", sendKey === "modEnter" ? `${mod}↵` : "↵"],
      ["New line", sendKey === "modEnter" ? "↵" : "⇧↵"],
      ["Mention a file", "@"],
      ["Commands and snippets", "/"],
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
      ["Terminal mode in Code (the session as a CLI)", `${modShift}T`],
      ["Find in the terminal", `${mod}F`],
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

/** A translated sentence with `{name}` in it replaced by an element (such as a bit of code). */
function withElement(text: string, name: string, element: ReactNode) {
  const [before, after = ""] = text.split(`{${name}}`);
  return (
    <>
      {before}
      {element}
      {after}
    </>
  );
}

/** Providers whose key goes to the keychain. */
const KEYS = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-…" },
  { id: "openai", name: "OpenAI", placeholder: "sk-…" },
  { id: "google", name: "Google AI", placeholder: "AIza…" },
];

/**
 * A provider's API key. It goes straight to the OS keychain and is never shown again:
 * the field only says whether one is saved, and takes a new one to replace it.
 */
function KeyField({ id, name, placeholder }: (typeof KEYS)[number]) {
  const t = useT();
  const saved = useStore((s) => (s.settings.keysSet ?? []).includes(id));
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const store = async (next: string) => {
    setBusy(true);
    try {
      await setSecret(id, next);
      const s = useStore.getState();
      const keys = new Set(s.settings.keysSet ?? []);
      if (next.trim()) keys.add(id);
      else keys.delete(id);
      s.updateSettings({ keysSet: [...keys] });
      setValue("");
      toast(next.trim() ? t(inTauri ? "{name} key saved in the keychain" : "{name} key saved", { name }) : t("{name} key removed", { name }));
    } catch (e) {
      toast(t("Couldn't save the {name} key: {error}", { name, error: String(e) }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      <span className="field-label">
        {name}
        <span className={cx("badge", saved && "on")}>{saved ? (inTauri ? t("In Keychain") : t("Saved")) : t("Not set")}</span>
      </span>
      <span className="key-row">
        <span className="input-wrap">
          <input
            type={show ? "text" : "password"}
            value={value}
            placeholder={saved ? t("•••••••• (type a new key to replace it)") : placeholder}
            spellCheck={false}
            autoComplete="off"
            aria-label={t("{name} API key", { name })}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && void store(value)}
          />
          <IconButton label={show ? t("Hide key") : t("Show key")} onClick={() => setShow((x) => !x)}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </IconButton>
        </span>
        <button className="btn primary" disabled={!value.trim() || busy} onClick={() => void store(value)}>
          {t("Save")}
        </button>
        {saved && (
          <button className="btn ghost danger" disabled={busy} onClick={() => void store("")}>
            {t("Remove")}
          </button>
        )}
      </span>
    </div>
  );
}

/** Where local models are served: not a secret, so it is kept with the settings. */
function EndpointField() {
  const t = useT();
  const value = useStore((s) => s.settings.endpoints?.ollama ?? "");
  return (
    <label className="field">
      <span className="field-label">
        {t("Ollama endpoint")}
        <span className={cx("badge", value && "on")}>{value ? t("Set") : t("Not set")}</span>
      </span>
      <span className="input-wrap">
        <input
          type="text"
          value={value}
          placeholder="http://localhost:11434"
          spellCheck={false}
          onChange={(e) => {
            const s = useStore.getState();
            s.updateSettings({ endpoints: { ...s.settings.endpoints, ollama: e.target.value } });
          }}
        />
      </span>
    </label>
  );
}

/** A setting on one line: what it is on the left, its control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-text">
        <span className="setting-label">{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  );
}

function Select<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <span className="select-wrap">
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </span>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={cx("toggle", on && "on")} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** Apps the Changes panel can open files in (macOS app names). */
const EDITORS: [string, string][] = [
  ["", "System default"],
  ["Visual Studio Code", "Visual Studio Code"],
  ["Cursor", "Cursor"],
  ["Zed", "Zed"],
  ["Sublime Text", "Sublime Text"],
  ["Xcode", "Xcode"],
  ["TextEdit", "TextEdit"],
];

/** Shortcuts offered for bringing the app up from anywhere (Tauri accelerators). */
const GLOBAL_SHORTCUTS: [string, string][] = [
  ["", "Off"],
  ["Alt+Space", isMac ? "⌥ Space" : "Alt+Space"],
  ["Control+Alt+Space", isMac ? "⌃⌥ Space" : "Ctrl+Alt+Space"],
  ["CommandOrControl+Shift+Space", isMac ? "⇧⌘ Space" : "Ctrl+Shift+Space"],
  ["CommandOrControl+Alt+K", isMac ? "⌥⌘K" : "Ctrl+Alt+K"],
];

const SIZES = (from: number, to: number): [string, string][] =>
  Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), `${from + i} px`]);

/** The rest of General: how the app behaves, under the look. */
function Behavior() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const models = useStore((s) => s.models);
  const model = useStore((s) => s.model);
  const { updateSettings } = useStore.getState();
  // Only the first entry of each list is words; the rest are names and keys.
  const editors = EDITORS.map(([v, text]): [string, string] => [v, v ? text : t(text)]);
  const globalShortcuts = GLOBAL_SHORTCUTS.map(([v, text]): [string, string] => [v, v ? text : t(text)]);
  return (
    <>
      <h3 className="settings-sub">{t("Behavior")}</h3>
      <Row label={t("Model for new sessions")} hint={t("Each session keeps the model it was started with, until you change it there.")}>
        <Select label={t("Model for new sessions")} value={model} options={models.map((m) => [m.id, m.name])} onChange={(id) => useStore.setState({ model: id })} />
      </Row>
      <Row label={t("Send messages with")} hint={settings.sendKey === "modEnter" ? t("Enter starts a new line.") : t("Shift+Enter starts a new line.")}>
        <Select<SendKey>
          label={t("Send messages with")}
          value={settings.sendKey ?? "enter"}
          options={[
            ["enter", "Enter"],
            ["modEnter", isMac ? "⌘ Enter" : "Ctrl+Enter"],
          ]}
          onChange={(sendKey) => updateSettings({ sendKey })}
        />
      </Row>
      <Row label={t("Notifications")} hint={t("When the agent finishes or needs approval while the app is in the background.")}>
        <Toggle label={t("Notifications")} on={settings.notifications !== false} onChange={(notifications) => updateSettings({ notifications })} />
      </Row>
      <Row label={t("Open files in")} hint={t("From the Changes panel and tool cards.")}>
        <Select label={t("Open files in")} value={settings.editor ?? ""} options={editors} onChange={(editor) => updateSettings({ editor: editor || null })} />
      </Row>
      <Row label={t("Bring up Agent Desktop")} hint={t("A shortcut that works from any app and opens a new chat.")}>
        <Select
          label={t("Global shortcut")}
          value={settings.globalShortcut ?? ""}
          options={globalShortcuts}
          onChange={(globalShortcut) => updateSettings({ globalShortcut: globalShortcut || null })}
        />
      </Row>
      <Row label={t("Code text size")} hint={t("Code in replies, diffs and command output.")}>
        <Select
          label={t("Code text size")}
          value={String(settings.codeFontSize ?? "")}
          options={[["", t("Default")], ...SIZES(11, 18)]}
          onChange={(v) => updateSettings({ codeFontSize: v ? Number(v) : undefined })}
        />
      </Row>
      <Row label={t("Terminal text size")}>
        <Select
          label={t("Terminal text size")}
          value={String(settings.terminalFontSize ?? 13)}
          options={SIZES(10, 20)}
          onChange={(v) => updateSettings({ terminalFontSize: Number(v) })}
        />
      </Row>
      <Row label={t("Language")}>
        <Select<Language>
          label={t("Language")}
          value={settings.language ?? "system"}
          options={[
            ["system", t("System")],
            ["en", "English"],
            ["ko", "한국어"],
          ]}
          onChange={(language) => updateSettings({ language })}
        />
      </Row>
    </>
  );
}

/** Saved text, inserted by typing /name in the message box. */
function SnippetsTab() {
  const t = useT();
  const snippets = useStore((s) => s.snippets);
  const { saveSnippet, deleteSnippet } = useStore.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", text: "" });
  const nameOk = (name: string, id: string | null) => /^[\p{L}\p{N}_-]+$/u.test(name) && !snippets.some((x) => x.name === name && x.id !== id);
  const begin = (id: string | null) => {
    const sn = snippets.find((x) => x.id === id);
    setDraft(sn ? { name: sn.name, text: sn.text } : { name: "", text: "" });
    setEditing(id ?? "new");
  };
  const save = () => {
    const name = draft.name.trim();
    const id = editing === "new" ? crypto.randomUUID() : editing!;
    if (!nameOk(name, id) || !draft.text.trim()) return;
    saveSnippet({ id, name, text: draft.text });
    setEditing(null);
  };
  const form = (
    <div className="snippet-form">
      <span className="input-wrap text">
        <span className="snippet-slash">/</span>
        <input autoFocus value={draft.name} placeholder={t("name")} aria-label={t("Snippet name")} onChange={(e) => setDraft({ ...draft, name: e.target.value.replace(/\s/g, "-") })} />
      </span>
      <textarea value={draft.text} placeholder={t("The text it inserts")} aria-label={t("Snippet text")} rows={4} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      {draft.name && !nameOk(draft.name.trim(), editing === "new" ? null : editing) && (
        <small className="field-error">{t("Use letters, numbers, - and _, and a name no other snippet has.")}</small>
      )}
      <div className="snippet-actions">
        <button className="btn ghost" onClick={() => setEditing(null)}>
          {t("Cancel")}
        </button>
        <button className="btn primary" disabled={!draft.text.trim() || !nameOk(draft.name.trim(), editing === "new" ? null : editing)} onClick={save}>
          {t("Save")}
        </button>
      </div>
    </div>
  );
  return (
    <>
      <h2>{t("Snippets")}</h2>
      <p className="muted">{withElement(t("Text you use often. Type {slash} and its name in the message box to insert it."), "slash", <code>/</code>)}</p>
      <div className="snippet-list">
        {snippets.map((sn) =>
          editing === sn.id ? (
            <div key={sn.id}>{form}</div>
          ) : (
            <div key={sn.id} className="snippet">
              <button className="snippet-main" onClick={() => begin(sn.id)}>
                <code>/{sn.name}</code>
                <span>{sn.text.replace(/\s+/g, " ")}</span>
              </button>
              <IconButton label={t("Delete /{name}", { name: sn.name })} className="small" onClick={() => deleteSnippet(sn.id)}>
                <Trash2 size={13} />
              </IconButton>
            </div>
          ),
        )}
        {editing === "new" ? (
          form
        ) : (
          <button className="btn ghost" onClick={() => begin(null)}>
            <Plus size={14} /> {t("New snippet")}
          </button>
        )}
      </div>
    </>
  );
}

/** What is stored, and getting it out and back in. */
function DataTab() {
  const t = useT();
  const count = useStore((s) => s.sessions.length);
  const [used, setUsed] = useState(() => storageUsed());
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setUsed(storageUsed()), [count]);
  const pct = Math.min(100, (used / STORAGE_LIMIT) * 100);
  const clearAll = () => {
    const { sessions, deleteSessions, restoreSessions } = useStore.getState();
    const all = [...sessions];
    deleteSessions(all.map((s) => s.id));
    setConfirm(false);
    toast(t("Deleted all {n} sessions", { n: all.length }), { label: t("Undo"), run: () => restoreSessions(all) });
  };
  return (
    <>
      <h2>{t("Data")}</h2>
      <p className="muted">{t("Sessions, projects and settings are saved on this device. API keys are not: they are in the keychain.")}</p>
      <div className="stat-card">
        <div className="stat-label">
          {t("Storage used")}
          <span className="stat-aside">{tn(count, "{n} session", "{n} sessions")}</span>
        </div>
        <div className="stat-value">
          {formatSize(used)} <small>{t("/ about {size}", { size: formatSize(STORAGE_LIMIT) })}</small>
        </div>
        <div className={cx("meter", pct >= 90 ? "crit" : pct >= 70 && "warn")} role="meter" aria-label={t("Storage used")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div style={{ width: `${Math.max(pct, used ? 1 : 0)}%` }} />
        </div>
        {pct >= 70 && <small className="field-note">{t("Back up and delete old sessions to make room.")}</small>}
      </div>
      <Row label={t("Back up everything")} hint={t("Sessions, projects and snippets, as one JSON file.")}>
        <button className="btn ghost" onClick={() => void exportAll()}>
          <Download size={14} /> {t("Back up…")}
        </button>
      </Row>
      <Row label={t("Restore from a backup")} hint={t("Adds what isn't here yet; nothing is replaced.")}>
        <button className="btn ghost" onClick={() => void importBackup().then(() => setUsed(storageUsed()))}>
          <Upload size={14} /> {t("Import…")}
        </button>
      </Row>
      <Row label={t("Delete all sessions")} hint={t("Projects, snippets and settings stay. You can undo right after.")}>
        {confirm ? (
          <span className="confirm-pair">
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              {t("Cancel")}
            </button>
            <button className="btn ghost danger" onClick={clearAll}>
              {t("Delete {n}", { n: count })}
            </button>
          </span>
        ) : (
          <button className="btn ghost danger" disabled={!count} onClick={() => setConfirm(true)}>
            <Trash2 size={14} /> {t("Delete all…")}
          </button>
        )}
      </Row>
    </>
  );
}

function AccountTab() {
  const t = useT();
  const account = useStore((s) => s.account);
  const { updateAccount, signIn, signOut } = useStore.getState();
  const [draft, setDraft] = useState({ name: "", email: "" });

  if (!account) {
    const valid = draft.name.trim() && /\S+@\S+\.\S+/.test(draft.email);
    return (
      <>
        <h2>{t("Sign in")}</h2>
        <p className="muted">{t("Create a local profile. It stays on this device until a real identity provider is connected.")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) signIn({ name: draft.name.trim(), email: draft.email.trim(), plan: "Free" });
          }}
        >
          <label className="field">
            <span className="field-label">{t("Name")}</span>
            <span className="input-wrap text">
              <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("Your name")} />
            </span>
          </label>
          <label className="field">
            <span className="field-label">{t("Email")}</span>
            <span className="input-wrap text">
              <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="you@example.com" />
            </span>
          </label>
          <button className="btn primary" type="submit" disabled={!valid}>
            {t("Sign in")}
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <h2>{t("Account")}</h2>
      <div className="profile-card">
        <Avatar name={account.name} size={48} />
        <div className="profile-text">
          <strong>{account.name}</strong>
          <span>{account.email}</span>
        </div>
        <span className="badge on">{t("{plan} plan", { plan: account.plan })}</span>
      </div>
      <label className="field">
        <span className="field-label">{t("Display name")}</span>
        <span className="input-wrap text">
          <input value={account.name} onChange={(e) => updateAccount({ name: e.target.value })} />
        </span>
      </label>
      <label className="field">
        <span className="field-label">{t("Email")}</span>
        <span className="input-wrap text">
          <input type="email" value={account.email} onChange={(e) => updateAccount({ email: e.target.value })} />
        </span>
      </label>
      <button
        className="btn ghost danger"
        onClick={() => {
          signOut();
          toast(t("Logged out"));
        }}
      >
        <LogOut size={14} /> {t("Log out")}
      </button>
    </>
  );
}

export function SettingsDialog() {
  const t = useT();
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
  const tabIndex = TABS.findIndex((x) => x.id === tab);

  return (
    <div className={cx("overlay", closing && "closing")} onMouseDown={close} onKeyDown={(e) => e.key === "Escape" && close()}>
      <div
        ref={dialog}
        className="dialog settings"
        role="dialog"
        aria-modal
        aria-label={t("Settings")}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <nav className="settings-nav" aria-label={t("Settings sections")}>
          <div className="settings-title">{t("Settings")}</div>
          <div className="settings-tabs" style={{ "--i": tabIndex } as CSSProperties}>
            <span className="settings-thumb" aria-hidden />
            {TABS.map((item) => (
              <button
                key={item.id}
                className={cx("settings-tab", tab === item.id && "on")}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => setTab(item.id)}
              >
                <item.icon size={15} />
                {t(item.label)}
              </button>
            ))}
          </div>
        </nav>
        <section className="settings-body">
          <IconButton label={t("Close")} kbd="Esc" className="close" onClick={close}>
            <X size={16} />
          </IconButton>

          {/* Keyed so each section fades in when selected. */}
          <div className="settings-pane" key={tab}>
            {tab === "account" && <AccountTab />}

            {tab === "general" && (
              <>
                <h2>{t("General")}</h2>
                <div className="field">
                  <span className="field-label">{t("Theme")}</span>
                  <div className="theme-cards" role="radiogroup" aria-label={t("Theme")}>
                    {THEMES.map((th) => (
                      <button
                        key={th.id}
                        role="radio"
                        aria-checked={settings.theme === th.id}
                        className={cx("theme-card", settings.theme === th.id && "on")}
                        onClick={() => updateSettings({ theme: th.id })}
                      >
                        <ThemePreview theme={th.id} scheme={scheme} />
                        <span className="theme-card-label">
                          {t(th.label)}
                          <Check size={13} className="theme-card-check" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">
                    {t("Color scheme")}
                    <span className="field-aside">{t(schemeInfo(scheme).hint)}</span>
                  </span>
                  <div className="theme-cards scheme-cards" role="radiogroup" aria-label={t("Color scheme")}>
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
                          {t(s.name)}
                          <Check size={13} className="theme-card-check" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">{t("Zoom")}</span>
                  <div className="zoom-control">
                    <IconButton label={t("Zoom out")} kbd={zoomKeys.out} disabled={zoom <= ZOOM_STEPS[0]} onClick={() => zoomBy(-1)}>
                      <Minus size={14} />
                    </IconButton>
                    <span className="zoom-value">{Math.round(zoom * 100)}%</span>
                    <IconButton label={t("Zoom in")} kbd={zoomKeys.in} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => zoomBy(1)}>
                      <Plus size={14} />
                    </IconButton>
                    <button className="btn ghost" disabled={zoom === 1} onClick={resetZoom}>
                      {t("Reset")}
                    </button>
                  </div>
                </div>
                <Behavior />
                <div className="field">
                  <span className="field-label">{t("Runtime")}</span>
                  <p className="muted">
                    {inTauri ? t("Running in the Tauri shell — agent runs in the Rust backend.") : t("Running in a browser — using the in-page mock agent.")}
                  </p>
                </div>
              </>
            )}

            {tab === "providers" && (
              <>
                <h2>{t("Providers")}</h2>
                <p className="muted">
                  {inTauri
                    ? t("Keys go to the system keychain and are never shown again; the app only reads them when it calls a provider.")
                    : t("Browser preview: keys are kept only until this tab closes.")}{" "}
                  {withElement(t("The bundled backend is a mock provider; wire real APIs in {file}."), "file", <code>src-tauri/src/agent.rs</code>)}
                </p>
                {KEYS.map((p) => (
                  <KeyField key={p.id} {...p} />
                ))}
                <EndpointField />
              </>
            )}

            {tab === "permissions" && (
              <>
                <h2>{t("Permissions")}</h2>
                <p className="muted">
                  {t(
                    "Control when the agent needs your approval. A project can set its own (edit the project), and “Always allow” on a request covers the rest of that session.",
                  )}
                </p>
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
                        <strong>{t(p.label)}</strong>
                        <small>{t(p.desc)}</small>
                      </span>
                      <span className="radio-dot" aria-hidden />
                    </label>
                  ))}
                </div>
              </>
            )}

            {tab === "snippets" && <SnippetsTab />}
            {tab === "data" && <DataTab />}

            {tab === "shortcuts" && (
              <>
                <h2>{t("Keyboard shortcuts")}</h2>
                {shortcuts(settings.sendKey ?? "enter").map((group) => (
                  <div key={group.title} className="shortcut-group">
                    <h3>{t(group.title)}</h3>
                    <dl className="shortcuts">
                      {group.items.map(([action, keys, section]) => (
                        <div key={`${action} ${keys}`}>
                          <dt>{t(action, section ? { label: t(section) } : undefined)}</dt>
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
