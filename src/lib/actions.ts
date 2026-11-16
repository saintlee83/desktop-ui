// Commands shared by keyboard shortcuts, the command palette and buttons.

import { pickFolder } from "./folders";
import { t, tn } from "./i18n";
import { applyPatch, openInEditor, revealFile as revealInDir } from "./native";
import { cliActive, currentFolder, inScope, isAgentic, messageText, sessionCli, sessionOnScreen, useStore } from "./store";
import { toast } from "./toast";
import type { WorkMode } from "./store";
import type { Project, Session, ToolPart } from "./types";
import { basename, copyText } from "./util";
import * as windows from "./windows";

/** The sessions the sidebar lists (this section, this project), newest first. */
function listed() {
  const s = useStore.getState();
  // Pinned first, as the sidebar shows them; archived ones are out of the list.
  return s.sessions
    .filter((x) => inScope(x, s) && !x.archived)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
}

/** Deletes a session and offers to bring it back. */
export function deleteWithUndo(session: Session) {
  const s = useStore.getState();
  const wasActive = s.activeId === session.id;
  s.deleteSession(session.id);
  toast(t("Deleted “{title}”", { title: session.title }), {
    label: t("Undo"),
    run: () => {
      const now = useStore.getState();
      now.restoreSession(session);
      if (wasActive) now.selectSession(session.id);
    },
  });
}

/** Deletes several sessions and offers to bring them all back. */
export function deleteManyWithUndo(sessions: Session[]) {
  if (sessions.length === 1) return deleteWithUndo(sessions[0]);
  const s = useStore.getState();
  s.deleteSessions(sessions.map((x) => x.id));
  toast(tn(sessions.length, "Deleted {n} session", "Deleted {n} sessions"), { label: t("Undo"), run: () => useStore.getState().restoreSessions(sessions) });
}

export function deleteActiveSession() {
  const s = useStore.getState();
  const session = s.sessions.find((x) => x.id === sessionOnScreen(s));
  if (session) deleteWithUndo(session);
}

/** Opens the session below (1) or above (-1) the current one in the sidebar. */
export function stepSession(direction: 1 | -1) {
  const s = useStore.getState();
  const list = listed();
  if (!list.length) return;
  const i = list.findIndex((x) => x.id === s.activeId);
  const next = i < 0 ? 0 : Math.min(list.length - 1, Math.max(0, i + direction));
  s.selectSession(list[next].id);
}

export async function copyLastResponse() {
  const s = useStore.getState();
  const session = s.sessions.find((x) => x.id === s.activeId);
  const reply = [...(session?.messages ?? [])].reverse().find((m) => m.role === "assistant" && messageText(m));
  if (reply && (await copyText(messageText(reply)))) toast(t("Copied the last response"));
}

// Focus moves a frame later, after whatever closed (palette, menu) has handed focus back.
const focusSoon = (selector: string, select = false) =>
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    el?.focus();
    if (select && el instanceof HTMLInputElement) el.select();
  });

/** Puts the cursor in the message box, or in the terminal when Code shows its terminal view. */
export function focusComposer() {
  focusSoon(cliActive(useStore.getState()) ? ".cli .xterm-helper-textarea" : ".main-content .composer textarea");
}

export function focusSearch() {
  const s = useStore.getState();
  if (!s.sidebarOpen) s.toggleSidebar();
  focusSoon(".sidebar-search input", true);
}

export function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  useStore.getState().updateSettings({ theme: dark ? "light" : "dark" });
}

/** Asks for a folder and gives it to the open session, or to the one about to start. */
export async function addFolder() {
  const s = useStore.getState();
  if (cliActive(s) && !sessionCli(s)) return;
  const folder = await pickFolder().catch((e) => {
    toast(t("Couldn't open the folder chooser: {error}", { error: String(e) }));
    return null;
  });
  if (folder) useStore.getState().setFolder(folder);
  focusComposer();
}

/** A plain chat has no modes: they come with a folder. */
const needsFolder = () => toast(t("Add a folder to use Agent and Plan modes"), { label: t("Add folder"), run: () => void addFolder() });

/** Agent ↔ Plan. */
export function toggleMode() {
  const s = useStore.getState();
  if (cliActive(s) && !sessionCli(s)) return;
  if (!isAgentic(s)) needsFolder();
  else s.setMode(s.mode === "agent" ? "plan" : "agent");
}

/** Picks Agent or Plan, coming out of Code's terminal view if it runs another CLI (the session's own takes modes too). */
export function chooseMode(mode: WorkMode) {
  const s = useStore.getState();
  if (cliActive(s) && !sessionCli(s)) s.setCodeView("gui");
  if (!isAgentic(useStore.getState())) return void needsFolder();
  s.setMode(mode);
}

/** Deletes a project (its sessions stay, unfiled) and offers to bring it back. */
export function deleteProjectWithUndo(project: Project) {
  const s = useStore.getState();
  const wasOpen = s.projectId === project.id;
  const filed = s.sessions.filter((x) => x.projectId === project.id).map((x) => x.id);
  s.deleteProject(project.id);
  toast(t("Deleted project “{name}”", { name: project.name }), {
    label: t("Undo"),
    run: () => {
      const now = useStore.getState();
      now.restoreProject(project, filed);
      if (wasOpen) now.setProject(project.id);
    },
  });
}

/** Code's chat UI ↔ its full-window terminal. */
export function toggleCli() {
  const s = useStore.getState();
  s.setCodeView(cliActive(s) ? "gui" : "terminal");
}

export function newWindow() {
  windows.newWindow().catch((e) => toast(t("Couldn't open a window: {error}", { error: String(e) })));
}

// ---------------- files the agent touched ----------------

/** The open session's folder, or a toast saying there is none. */
function folderOrSay(): string | null {
  const folder = currentFolder(useStore.getState());
  if (!folder) toast(t("This session has no folder"));
  return folder;
}

/** Opens a file of the open session's folder in the editor chosen in Settings. */
export function openFile(path: string) {
  const folder = folderOrSay();
  if (!folder) return;
  openInEditor(folder, path, useStore.getState().settings.editor ?? null).catch((e) => toast(t("Couldn't open {file}: {error}", { file: basename(path), error: String(e) })));
}

/** Shows a file of the open session's folder in Finder. */
export function revealFile(path: string) {
  const folder = folderOrSay();
  if (!folder) return;
  revealInDir(folder, path).catch((e) => toast(t("Couldn't show {file}: {error}", { file: basename(path), error: String(e) })));
}

/**
 * Undoes the agent's changes to one file (newest first), or with `redo` puts them back
 * (oldest first). Stops at the first that no longer applies; the ones done are marked.
 */
export async function revertChanges(sessionId: string, path: string, tools: ToolPart[], redo = false) {
  const folder = folderOrSay();
  if (!folder) return;
  const order = redo ? tools : [...tools].reverse();
  const done: string[] = [];
  for (const tool of order) {
    if (!tool.diff) continue;
    try {
      await applyPatch(folder, path, tool.diff.patch, !redo);
      done.push(tool.id);
    } catch (e) {
      const vars = { file: basename(path), error: String(e) };
      toast(redo ? t("Couldn't reapply {file}: {error}", vars) : t("Couldn't revert {file}: {error}", vars));
      break;
    }
  }
  if (!done.length) return;
  useStore.getState().markReverted(sessionId, done, !redo);
  const changed = tools.filter((tool) => done.includes(tool.id));
  if (redo) toast(t("Reapplied the changes to {file}", { file: basename(path) }));
  else toast(t("Reverted {file}", { file: basename(path) }), { label: t("Undo"), run: () => void revertChanges(sessionId, path, changed, true) });
}
