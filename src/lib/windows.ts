// App windows. Every window runs the same UI against the same saved state
// (see the "Multiple windows" part of store.ts for how they stay in sync).

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./agent";

/**
 * The window the app starts with. Only it may assume, on a fresh start, that
 * every unfinished run is dead; a window opened later shares the app with
 * windows whose runs are still going. A plain browser tab counts as primary.
 */
export const isPrimaryWindow = !inTauri || getCurrentWindow().label === "main";

/** Opens another window of the app (a new tab when running in a plain browser). */
export async function newWindow() {
  if (inTauri) await invoke("new_window");
  else window.open(location.href, "_blank");
}

/**
 * Runs `cleanup` just before this window goes away. Returns a function that
 * removes the hook. The window closes even if `cleanup` fails or stalls.
 */
export function onWindowClose(cleanup: () => Promise<void>): () => void {
  if (!inTauri) {
    const run = () => void cleanup();
    window.addEventListener("pagehide", run);
    return () => window.removeEventListener("pagehide", run);
  }
  let unlisten: (() => void) | undefined;
  let dead = false;
  getCurrentWindow()
    // Tauri closes the window once this handler settles, so it must never reject or hang.
    .onCloseRequested(() => Promise.race([cleanup().catch(console.error), new Promise<void>((done) => setTimeout(done, 800))]))
    .then((un) => {
      if (dead) un();
      else unlisten = un;
    })
    .catch(console.error);
  return () => {
    dead = true;
    unlisten?.();
  };
}
