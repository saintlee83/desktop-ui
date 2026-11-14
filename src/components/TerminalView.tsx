import { useEffect, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import * as pty from "../lib/pty";
import { SECTIONS } from "../lib/sections";
import { isMac } from "../lib/util";

const LIGHT: ITheme = {
  black: "#1c1b19", red: "#c9302c", green: "#1d7f3d", yellow: "#a5660b",
  blue: "#2f5fc4", magenta: "#8839c7", cyan: "#0f7b8a", white: "#8f8b84",
  brightBlack: "#5d5a55", brightRed: "#e0443f", brightGreen: "#25a04d", brightYellow: "#c27c10",
  brightBlue: "#4175e0", brightMagenta: "#a052e0", brightCyan: "#1396a8", brightWhite: "#b5b1aa",
  selectionBackground: "rgba(102, 86, 240, 0.22)",
  scrollbarSliderBackground: "rgba(20, 18, 14, 0.14)",
  scrollbarSliderHoverBackground: "rgba(20, 18, 14, 0.24)",
  scrollbarSliderActiveBackground: "rgba(20, 18, 14, 0.32)",
};
const DARK: ITheme = {
  black: "#3a3a38", red: "#f0716b", green: "#4cc274", yellow: "#e9ae4a",
  blue: "#82aaff", magenta: "#c792ea", cyan: "#5fd1d6", white: "#d6d4cf",
  brightBlack: "#75726c", brightRed: "#ff8f89", brightGreen: "#6fdc93", brightYellow: "#f5c66e",
  brightBlue: "#a3c1ff", brightMagenta: "#dcb0f5", brightCyan: "#86e3e7", brightWhite: "#ffffff",
  selectionBackground: "rgba(139, 125, 255, 0.35)",
  scrollbarSliderBackground: "rgba(255, 255, 255, 0.12)",
  scrollbarSliderHoverBackground: "rgba(255, 255, 255, 0.2)",
  scrollbarSliderActiveBackground: "rgba(255, 255, 255, 0.28)",
};

function themeFromCss(): ITheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    ...(dark ? DARK : LIGHT),
    background: v("--term-bg"),
    foreground: v("--text"),
    cursor: v("--accent"),
    cursorAccent: v("--term-bg"),
  };
}

/** Keys that, with ⌘ on macOS, are app shortcuts (see App's shortcut handler). */
const APP_KEYS = ["k", "n", "b", "j", ",", "=", "+", "-", "0", "f", "l", "/", "m", "t", "c", "[", "]", "{", "}", "backspace", ...SECTIONS.map((s) => s.key)];
/** Elsewhere Ctrl+letter belongs to the shell, so only these Ctrl+Shift combinations are the app's. */
const APP_SHIFT_KEYS = ["n", "l", "m", "t", "[", "]", "{", "}", "backspace"];

/** App shortcuts xterm must not swallow (they bubble to the window handler instead). */
export function isAppShortcut(e: KeyboardEvent) {
  if (e.ctrlKey && (e.key === "`" || e.code === "Backquote")) return true;
  const key = e.key.toLowerCase();
  if (isMac) return e.metaKey && APP_KEYS.includes(key);
  return e.ctrlKey && e.shiftKey && APP_SHIFT_KEYS.includes(key);
}

/**
 * One interactive terminal: the user's login shell in an xterm view. The shell
 * lives as long as the component stays mounted, also while it is hidden.
 */
export function TerminalView({
  active,
  command,
  fontSize = 12.5,
  onSpawn,
  onExit,
}: {
  /** Visible and meant to have keyboard focus. */
  active: boolean;
  /** Typed into the shell once it is ready, e.g. the CLI agent to start. */
  command?: string;
  fontSize?: number;
  onSpawn?: (shell: pty.Spawned) => void;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  // Read through a ref: the shell is started once, whatever the callbacks are by the time they fire.
  const handlers = useRef({ onSpawn, onExit });
  handlers.current = { onSpawn, onExit };

  useEffect(() => {
    const el = host.current!;
    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      macOptionIsMeta: true,
      allowTransparency: false,
      theme: themeFromCss(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    term.attachCustomKeyEventHandler((e) => !(e.type === "keydown" && isAppShortcut(e)));
    termRef.current = term;

    const safeFit = () => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) fit.fit();
    };
    fitRef.current = safeFit;
    safeFit();

    // StrictMode mounts twice in dev: a disposed view must neither keep nor report its PTY.
    let disposed = false;
    let ptyId: string | null = null;

    // The start command is typed once the shell has printed its prompt and gone quiet,
    // so it lands on the prompt line instead of being echoed above it.
    let typed = !command;
    let quiet = 0;
    const typeCommand = () => {
      if (typed || disposed) return;
      if (!ptyId) {
        quiet = window.setTimeout(typeCommand, 100);
        return;
      }
      typed = true;
      pty.write(ptyId, `${command}\r`).catch(console.error);
    };
    const waitForQuiet = (ms: number) => {
      if (typed) return;
      clearTimeout(quiet);
      quiet = window.setTimeout(typeCommand, ms);
    };

    pty
      .spawn({ cols: term.cols, rows: term.rows }, (ev) => {
        if (disposed) return;
        if (ev.type === "data") {
          term.write(ev.data);
          waitForQuiet(350);
        } else handlers.current.onExit(); // the shell exited (e.g. `exit`)
      })
      .then((s) => {
        if (disposed) {
          void pty.kill(s.id);
          return;
        }
        ptyId = s.id;
        handlers.current.onSpawn?.(s);
        void pty.resize(s.id, term.cols, term.rows);
        // A shell that prints nothing at all still gets its command.
        if (!typed && !quiet) waitForQuiet(1500);
      })
      .catch((err) => term.write(`\x1b[31mFailed to start shell: ${err}\x1b[0m\r\n`));

    const onData = term.onData((d) => {
      if (ptyId) pty.write(ptyId, d).catch(console.error);
    });
    const onResize = term.onResize(({ cols, rows }) => {
      if (ptyId) pty.resize(ptyId, cols, rows).catch(console.error);
    });
    const ro = new ResizeObserver(safeFit);
    ro.observe(el);
    const mo = new MutationObserver(() => (term.options.theme = themeFromCss()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      disposed = true;
      clearTimeout(quiet);
      ro.disconnect();
      mo.disconnect();
      onData.dispose();
      onResize.dispose();
      if (ptyId) void pty.kill(ptyId);
      term.dispose();
      termRef.current = null;
    };
    // The command and font size are fixed for the life of a terminal; remount to change them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    fitRef.current?.();
    termRef.current?.focus();
  }, [active]);

  return <div className="term-view" ref={host} hidden={!active} />;
}
