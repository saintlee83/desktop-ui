// Getting the user's attention from outside the window: the dock badge, the menu bar icon,
// the global shortcut and the menu bar's "New Chat". (Notifications go out from the store,
// where runs end and ask for approval.)

import { listen } from "@tauri-apps/api/event";
import { inTauri } from "./agent";
import { t } from "./i18n";
import { setBadge, setGlobalShortcut, showWindow, trayStatus } from "./native";
import { awaitingTool, isStreaming, sessionOnScreen, useStore } from "./store";
import { toast } from "./toast";
import { isPrimaryWindow } from "./windows";

/** Opens a new chat and puts the cursor in it, from wherever the app was. */
function quickChat() {
  const s = useStore.getState();
  if (s.paletteOpen) s.setPalette(false);
  if (s.settingsOpen) s.setSettingsOpen(false);
  s.setSection("chat");
  useStore.getState().newSession();
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".main-content .composer textarea")?.focus());
}

/** Starts watching; returns a function that stops. Call once per window. */
export function startAttention(): () => void {
  const stops: (() => void)[] = [];

  // Sessions waiting for approval, and replies not yet seen, count on the dock icon.
  // The menu bar says how many agents are working or waiting.
  let last = "";
  const report = () => {
    const { sessions } = useStore.getState();
    const running = sessions.filter(isStreaming).length;
    const waiting = sessions.filter((x) => awaitingTool(x)).length;
    const unread = sessions.filter((x) => x.unread && !x.archived).length;
    const key = `${running}/${waiting}/${unread}`;
    if (key === last) return;
    last = key;
    setBadge(waiting + unread);
    trayStatus(running, waiting);
  };
  report();
  stops.push(useStore.subscribe((st, prev) => st.sessions !== prev.sessions && report()));

  // A reply is seen once its session is on screen in a window in front: on finishing there,
  // or when the user comes back to the window.
  const markSeen = () => {
    if (!document.hasFocus()) return;
    const s = useStore.getState();
    const id = sessionOnScreen(s);
    if (id && s.sessions.find((x) => x.id === id)?.unread) {
      useStore.setState((st) => ({ sessions: st.sessions.map((x) => (x.id === id ? { ...x, unread: false } : x)) }));
    }
  };
  window.addEventListener("focus", markSeen);
  stops.push(() => window.removeEventListener("focus", markSeen));
  stops.push(useStore.subscribe((st, prev) => (st.sessions !== prev.sessions || st.activeId !== prev.activeId) && markSeen()));

  if (inTauri) {
    // "New Chat" in the menu bar menu, sent to the window it brought up.
    let unlisten: (() => void) | undefined;
    let dead = false;
    listen("tray-new-chat", quickChat)
      .then((un) => (dead ? un() : (unlisten = un)))
      .catch(console.error);
    stops.push(() => {
      dead = true;
      unlisten?.();
    });
  }

  // One window holds the global shortcut, so it doesn't fire once per window.
  if (isPrimaryWindow) {
    let current: string | null | undefined;
    const apply = () => {
      const accel = useStore.getState().settings.globalShortcut ?? null;
      if (accel === current) return;
      current = accel;
      setGlobalShortcut(accel, () => {
        void showWindow().then(quickChat);
      }).catch((e) => {
        toast(t("Couldn't use {shortcut} as the global shortcut: {error}", { shortcut: accel ?? "", error: String(e) }));
        current = null;
      });
    };
    apply();
    stops.push(useStore.subscribe((st, prev) => st.settings !== prev.settings && apply()));
    stops.push(() => void setGlobalShortcut(null, () => {}));
  }

  return () => stops.forEach((stop) => stop());
}
