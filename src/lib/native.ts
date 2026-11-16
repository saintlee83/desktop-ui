// What the app asks of the operating system: links, files, notifications, the dock badge,
// the menu bar icon, the keychain and a global shortcut. Each call has a stand-in for the
// plain-browser preview (`pnpm dev`), so the UI around it can still be tried there.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./agent";
import { t } from "./i18n";

// ---------------- links and files ----------------

/** Opens a web link in the default browser. */
export async function openUrl(url: string) {
  if (!inTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

/** A path the agent reported, against the session's folder. */
export const joinPath = (root: string, path: string) =>
  /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path) ? path : `${root.replace(/[\\/]+$/, "")}/${path.replace(/^\.\//, "")}`;

/** Shows a file in Finder (Explorer, the file manager). */
export async function revealFile(root: string, path: string) {
  if (!inTauri) throw new Error(t("only in the app"));
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(joinPath(root, path));
}

/** Opens a file in `editor` (an app name; none: the system's default app for it). */
export function openInEditor(root: string, path: string, editor: string | null) {
  if (!inTauri) return Promise.reject(new Error(t("only in the app")));
  return invoke<void>("open_in_editor", { root, path, editor });
}

/** Undoes one change the agent made, by applying its diff in reverse; `reverse: false` puts it back. */
export function applyPatch(root: string, path: string, patch: string, reverse: boolean) {
  if (!inTauri) return Promise.reject(new Error(t("only in the app")));
  return invoke<void>("apply_patch", { root, path, patch, reverse });
}

/** Stand-in files for `@` mentions in the browser preview, which can't list a folder. */
const PREVIEW_FILES = [
  "README.md", "package.json", "src/App.tsx", "src/main.tsx", "src/lib/session.ts", "src/lib/session.test.ts",
  "src/lib/store.ts", "src/lib/util.ts", "src/components/Composer.tsx", "src/components/Thread.tsx", "src/styles.css",
];

const listed = new Map<string, { at: number; files: Promise<string[]> }>();

/** Files in a folder, relative to it; remembered for a little while, since a picker asks often. */
export function listFiles(root: string): Promise<string[]> {
  if (!inTauri || !/^(\/|[A-Za-z]:[\\/]|\\\\)/.test(root)) return Promise.resolve(PREVIEW_FILES);
  const hit = listed.get(root);
  if (hit && Date.now() - hit.at < 15_000) return hit.files;
  const files = invoke<string[]>("list_files", { root });
  listed.set(root, { at: Date.now(), files });
  files.catch(() => listed.delete(root));
  return files;
}

/** Asks where to save `contents` and writes it there. Returns false when the user cancels. */
export async function saveTextFile(name: string, contents: string, type = "text/markdown"): Promise<boolean> {
  if (!inTauri) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: name, title: t("Export") });
  if (!path) return false;
  await invoke("save_text", { path, contents });
  return true;
}

/** Lets the user pick a file and reads it as text. */
export function pickTextFile(accept = ".json,application/json"): Promise<string | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept });
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

// ---------------- keychain ----------------

/** Keys typed in the browser preview, which has no keychain: kept until the tab closes. */
const previewKeys = new Map<string, string>();

/** Stores a provider key in the OS keychain (an empty value removes it). The app never reads it back. */
export async function setSecret(name: string, value: string) {
  if (!inTauri) {
    if (value.trim()) previewKeys.set(name, value.trim());
    else previewKeys.delete(name);
    return;
  }
  await invoke("secret_set", { name, value });
}

// ---------------- attention ----------------

let notifyAllowed: boolean | null = null;

/** A system notification, for when the window isn't in front. Asks for permission the first time. */
export async function notify(title: string, body: string) {
  try {
    if (!inTauri) {
      if (!("Notification" in window)) return;
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") new Notification(title, { body });
      return;
    }
    const n = await import("@tauri-apps/plugin-notification");
    if (notifyAllowed === null) {
      notifyAllowed = await n.isPermissionGranted();
      if (!notifyAllowed) notifyAllowed = (await n.requestPermission()) === "granted";
    }
    if (notifyAllowed) n.sendNotification({ title, body });
  } catch (e) {
    console.error("notification failed", e);
  }
}

/** The number on the dock icon (none for 0). The browser preview puts it in the tab title. */
export function setBadge(count: number) {
  if (!inTauri) {
    document.title = count ? `(${count}) Agent Desktop` : "Agent Desktop";
    return;
  }
  getCurrentWindow()
    .setBadgeCount(count || undefined)
    .catch((e) => console.error("badge failed", e));
}

/** What the menu bar icon says: sessions working, and waiting for approval. */
export function trayStatus(running: number, waiting: number) {
  if (inTauri) invoke("tray_status", { running, waiting }).catch((e) => console.error("tray failed", e));
}

/** Brings this window to the front. */
export async function showWindow() {
  if (!inTauri) return window.focus();
  const w = getCurrentWindow();
  await w.show().catch(() => {});
  await w.unminimize().catch(() => {});
  await w.setFocus().catch(() => {});
}

// ---------------- global shortcut ----------------

let registered: string | null = null;

/**
 * Makes `accelerator` (e.g. "Alt+Space") run `handler` from anywhere, replacing the shortcut
 * set before. `null` removes it. Fails when another app already holds the combination.
 */
export async function setGlobalShortcut(accelerator: string | null, handler: () => void) {
  if (!inTauri) return;
  const gs = await import("@tauri-apps/plugin-global-shortcut");
  if (registered) {
    await gs.unregister(registered).catch(() => {});
    registered = null;
  }
  if (!accelerator) return;
  await gs.register(accelerator, (e) => {
    if (e.state === "Pressed") handler();
  });
  registered = accelerator;
}
