// Appearance: light or dark, and which color scheme the neutrals are drawn from.
// The colors themselves are tokens in styles.css, keyed by the two attributes set here.

import { useEffect, useState } from "react";
import { useStore } from "./store";
import { withViewTransition } from "./util";

export type SchemeId = "ink" | "graphite" | "mono" | "sand" | "sage" | "slate";

export interface SchemeInfo {
  id: SchemeId;
  name: string;
  hint: string;
}

/** Every scheme is a set of neutrals with its own cast; none adds an accent hue. */
export const SCHEMES: SchemeInfo[] = [
  { id: "ink", name: "Ink", hint: "Warm paper and ink" },
  { id: "graphite", name: "Graphite", hint: "Cool, even grays" },
  { id: "mono", name: "Mono", hint: "Pure black and white" },
  { id: "sand", name: "Sand", hint: "Parchment and umber" },
  { id: "sage", name: "Sage", hint: "Gray with a green cast" },
  { id: "slate", name: "Slate", hint: "Gray with a blue cast" },
];

export const DEFAULT_SCHEME: SchemeId = "ink";
export const schemeInfo = (id: string | undefined) => SCHEMES.find((s) => s.id === id) ?? SCHEMES[0];

/** The theme actually on screen: "system" resolved against the OS setting. */
export function useResolvedTheme(): "light" | "dark" {
  const theme = useStore((s) => s.settings.theme);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return theme === "dark" || (theme === "system" && systemDark) ? "dark" : "light";
}

/**
 * Sets the saved theme and scheme on the root element before anything is drawn, so the
 * window doesn't open in the default colors and then change.
 */
export function paintTheme() {
  const { theme, scheme } = useStore.getState().settings;
  const root = document.documentElement;
  root.dataset.theme = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  root.dataset.scheme = schemeInfo(scheme).id;
}

/** Keeps `data-theme` and `data-scheme` on the root element in step with the settings. */
export function useApplyTheme() {
  const theme = useResolvedTheme();
  const scheme = useStore((s) => schemeInfo(s.settings.scheme).id);
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.theme === theme && root.dataset.scheme === scheme) return;
    const set = () => {
      root.dataset.theme = theme;
      root.dataset.scheme = scheme;
    };
    // Later switches cross-fade (the first paint was already done by `paintTheme`).
    if (root.dataset.theme) withViewTransition(set, "fade");
    else set();
  }, [theme, scheme]);
}
