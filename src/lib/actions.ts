// Commands shared by keyboard shortcuts, the command palette and buttons.

import { cliActive, messageText, useStore } from "./store";
import { toast } from "./toast";
import type { WorkMode } from "./store";
import { isAgentSection, type Session } from "./types";
import { copyText } from "./util";
import * as windows from "./windows";

/** The current section's sessions, newest first: the order the sidebar lists them in. */
function listed() {
  const s = useStore.getState();
  return s.sessions.filter((x) => x.section === s.section).sort((a, b) => b.updatedAt - a.updatedAt);
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

/** Agent ↔ Plan. From Chat this first moves to the agent section used last. */
export function toggleMode() {
  const s = useStore.getState();
  if (cliActive(s)) return;
  if (!isAgentSection(s.section)) s.enterAgentSection();
  else s.setMode(s.mode === "agent" ? "plan" : "agent");
}

/** Picks Agent or Plan, coming out of Code's terminal view or over from Chat if need be. */
export function chooseMode(mode: WorkMode) {
  const s = useStore.getState();
  if (cliActive(s)) s.setCodeView("gui");
  s.enterAgentSection();
  s.setMode(mode);
}

/** Code's chat UI ↔ its full-window terminal. */
export function toggleCli() {
  const s = useStore.getState();
  s.setCodeView(cliActive(s) ? "gui" : "terminal");
}

export function newWindow() {
  windows.newWindow().catch((e) => toast(`Couldn't open a window: ${e}`));
}
