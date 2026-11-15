// Commands shared by keyboard shortcuts, the command palette and buttons.

import { pickFolder } from "./folders";
import { cliActive, inScope, isAgentic, messageText, useStore } from "./store";
import { toast } from "./toast";
import type { WorkMode } from "./store";
import type { Project, Session } from "./types";
import { copyText } from "./util";
import * as windows from "./windows";

/** The sessions the sidebar lists (this section, this project), newest first. */
function listed() {
  const s = useStore.getState();
  return s.sessions.filter((x) => inScope(x, s)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Deletes a session and offers to bring it back. */
export function deleteWithUndo(session: Session) {
  const s = useStore.getState();
  const wasActive = s.activeId === session.id;
  s.deleteSession(session.id);
  toast(`Deleted “${session.title}”`, {
    label: "Undo",
    run: () => {
      const now = useStore.getState();
      now.restoreSession(session);
      if (wasActive) now.selectSession(session.id);
    },
  });
}

export function deleteActiveSession() {
  const s = useStore.getState();
  const session = s.sessions.find((x) => x.id === s.activeId);
  if (session && !cliActive(s)) deleteWithUndo(session);
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
  if (reply && (await copyText(messageText(reply)))) toast("Copied the last response");
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
  if (cliActive(useStore.getState())) return;
  const folder = await pickFolder().catch((e) => {
    toast(`Couldn't open the folder chooser: ${e}`);
    return null;
  });
  if (folder) useStore.getState().setFolder(folder);
  focusComposer();
}

/** A plain chat has no modes: they come with a folder. */
const needsFolder = () => toast("Add a folder to use Agent and Plan modes", { label: "Add folder", run: () => void addFolder() });

/** Agent ↔ Plan. */
export function toggleMode() {
  const s = useStore.getState();
  if (cliActive(s)) return;
  if (!isAgentic(s)) needsFolder();
  else s.setMode(s.mode === "agent" ? "plan" : "agent");
}

/** Picks Agent or Plan, coming out of Code's terminal view if need be. */
export function chooseMode(mode: WorkMode) {
  const s = useStore.getState();
  if (cliActive(s)) s.setCodeView("gui");
  if (!isAgentic(useStore.getState())) return void needsFolder();
  s.setMode(mode);
}

/** Deletes a project (its sessions stay, unfiled) and offers to bring it back. */
export function deleteProjectWithUndo(project: Project) {
  const s = useStore.getState();
  const wasOpen = s.projectId === project.id;
  const filed = s.sessions.filter((x) => x.projectId === project.id).map((x) => x.id);
  s.deleteProject(project.id);
  toast(`Deleted project “${project.name}”`, {
    label: "Undo",
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
  windows.newWindow().catch((e) => toast(`Couldn't open a window: ${e}`));
}
