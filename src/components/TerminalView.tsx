import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Terminal, type ITerminalOptions, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { t, useT } from "../lib/i18n";
import { openUrl } from "../lib/native";
import * as pty from "../lib/pty";
import { SECTIONS } from "../lib/sections";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { composing, cx, isMac } from "../lib/util";
import { IconButton } from "./ui";

// ANSI colors, muted to sit with the app's palette (see the tokens in styles.css).
const LIGHT: ITheme = {
  black: "#1c1b18", red: "#b83a30", green: "#2b7a4b", yellow: "#94661a",
  blue: "#2f5f9e", magenta: "#7b4f96", cyan: "#1f7480", white: "#8c8881",
  brightBlack: "#5b5852", brightRed: "#d04a40", brightGreen: "#36935b", brightYellow: "#b27d22",
  brightBlue: "#3f74bd", brightMagenta: "#9462b3", brightCyan: "#2a8c9a", brightWhite: "#b5b1aa",
};
const DARK: ITheme = {
  black: "#3a3a37", red: "#ec837b", green: "#7fc79b", yellow: "#dbb56c",
  blue: "#8fb2e0", magenta: "#c3a1dc", cyan: "#7cc8cf", white: "#d6d3cc",
  brightBlack: "#73706a", brightRed: "#ff9c95", brightGreen: "#98dcb2", brightYellow: "#edc988",
  brightBlue: "#abc8ee", brightMagenta: "#d8bdea", brightCyan: "#9bdde3", brightWhite: "#ffffff",
};
/** Opacity of the ink tint behind a selection and on the scrollbar (resting, hover, dragged). */
const TINTS = { light: [0.14, 0.14, 0.24, 0.32], dark: [0.2, 0.12, 0.2, 0.28] };

export function themeFromCss(): ITheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const dark = document.documentElement.dataset.theme === "dark";
  // The color scheme's ink ("R G B"), spelled the way xterm parses colors.
  const ink = v("--ink").split(/\s+/).join(", ");
  const [selection, slider, sliderHover, sliderActive] = TINTS[dark ? "dark" : "light"].map((a) => `rgba(${ink}, ${a})`);
  return {
    ...(dark ? DARK : LIGHT),
    background: v("--term-bg"),
    foreground: v("--text"),
    cursor: v("--accent"),
    cursorAccent: v("--term-bg"),
    selectionBackground: selection,
    scrollbarSliderBackground: slider,
    scrollbarSliderHoverBackground: sliderHover,
    scrollbarSliderActiveBackground: sliderActive,
  };
}

/** How every terminal in the app looks: the shells, and the session shown as a CLI. */
export function terminalOptions(fontSize: number): ITerminalOptions {
  return {
    fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    fontSize,
    lineHeight: 1.25,
    cursorBlink: true,
    cursorStyle: "bar",
    scrollback: 5000,
    macOptionIsMeta: true,
    allowTransparency: false,
    theme: themeFromCss(),
  };
}

/** Keys that, with ⌘ on macOS, are app shortcuts (see App's shortcut handler). */
const APP_KEYS = ["k", "n", "b", "j", "o", ",", "=", "+", "-", "0", "f", "l", "/", "m", "t", "c", "[", "]", "{", "}", "backspace", ...SECTIONS.map((s) => s.key)];
/** Elsewhere Ctrl+letter belongs to the shell, so only these Ctrl+Shift combinations are the app's. */
const APP_SHIFT_KEYS = ["n", "l", "m", "t", "[", "]", "{", "}", "backspace"];

/** App shortcuts xterm must not swallow (they bubble to the window handler instead). */
export function isAppShortcut(e: KeyboardEvent) {
  if (e.ctrlKey && (e.key === "`" || e.code === "Backquote")) return true;
  const key = e.key.toLowerCase();
  if (isMac) return e.metaKey && APP_KEYS.includes(key);
  return e.ctrlKey && e.shiftKey && APP_SHIFT_KEYS.includes(key);
}

/** Terminal text size from Settings. */
const fontSize = () => useStore.getState().settings.terminalFontSize ?? 13;

export interface Xterm {
  term: Terminal;
  search: SearchAddon;
  /** Fits the terminal to its element (when the element is on screen). */
  fit(): void;
  dispose(): void;
}

/**
 * A terminal in `el`, as every terminal in the app is set up: the app's theme and text size
 * (following both as they change), fitted to the element, links that open with ⌘-click, find
 * (⌘F, which calls `onFind`), and the app's shortcuts left to the app.
 */
export function createXterm(el: HTMLElement, onFind: () => void): Xterm {
  const term = new Terminal({ ...terminalOptions(fontSize()), allowProposedApi: true });
  const fitAddon = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(search);
  term.loadAddon(
    new WebLinksAddon((e, uri) => {
      if (isMac ? e.metaKey : e.ctrlKey) openUrl(uri).catch((err) => toast(t("Couldn't open the link: {error}", { error: String(err) })));
    }),
  );
  term.open(el);
  term.attachCustomKeyEventHandler((e) => {
    const findKey = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && e.shiftKey;
    if (e.type === "keydown" && findKey && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      onFind();
      return false;
    }
    return !(e.type === "keydown" && isAppShortcut(e));
  });
  const fit = () => {
    if (el.offsetWidth > 0 && el.offsetHeight > 0) fitAddon.fit();
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(el);
  const mo = new MutationObserver(() => (term.options.theme = themeFromCss()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-scheme"] });
  const unsubscribe = useStore.subscribe((st, prev) => {
    if (st.settings.terminalFontSize === prev.settings.terminalFontSize) return;
    term.options.fontSize = fontSize();
    fit();
  });
  return {
    term,
    search,
    fit,
    dispose() {
      ro.disconnect();
      mo.disconnect();
      unsubscribe();
      term.dispose();
    },
  };
}

/** Find in a terminal's output: ↵ next, ⇧↵ previous, esc closes. */
export function TerminalFind({ xterm, onClose }: { xterm: Xterm; onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ index: number; count: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const sub = xterm.search.onDidChangeResults((r) => setResult({ index: r.resultIndex, count: r.resultCount }));
    return () => {
      sub.dispose();
      xterm.search.clearDecorations();
    };
  }, [xterm]);
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--amber").trim() || "#c08a2b";
  const options = (incremental = false): ISearchOptions => ({
    incremental,
    decorations: { matchOverviewRuler: ink, activeMatchColorOverviewRuler: ink, matchBorder: ink, activeMatchBackground: ink },
  });
  const find = (back = false, incremental = false) => {
    if (!query) return;
    if (back) xterm.search.findPrevious(query, options());
    else xterm.search.findNext(query, options(incremental));
  };
  const close = () => {
    onClose();
    xterm.term.focus();
  };
  return (
    <div className="term-find" role="search" data-esc-layer onKeyDown={(e) => e.stopPropagation()}>
      <input
        ref={input}
        value={query}
        placeholder={t("Find")}
        aria-label={t("Find in terminal")}
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!e.target.value) {
            xterm.search.clearDecorations();
            setResult(null);
          } else xterm.search.findNext(e.target.value, options(true));
        }}
        onKeyDown={(e) => {
          if (composing(e)) return;
          if (e.key === "Enter") {
            e.preventDefault();
            find(e.shiftKey);
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "f") {
            e.preventDefault();
            input.current?.select();
          }
        }}
      />
      <span className={cx("term-find-count", query && result?.count === 0 && "none")}>
        {query && result ? (result.count ? `${result.index + 1}/${result.count}` : t("No results")) : ""}
      </span>
      <IconButton label={t("Previous")} kbd="⇧↵" className="small" onClick={() => find(true)}>
        <ArrowUp size={13} />
      </IconButton>
      <IconButton label={t("Next")} kbd="↵" className="small" onClick={() => find()}>
        <ArrowDown size={13} />
      </IconButton>
      <IconButton label={t("Close")} kbd="esc" className="small" onClick={close}>
        <X size={13} />
      </IconButton>
    </div>
  );
}

/**
 * One interactive terminal: the user's login shell in an xterm view. The shell
 * lives as long as the component stays mounted, also while it is hidden.
 */
export function TerminalView({
  active,
  command,
  cwd,
  onSpawn,
  onExit,
}: {
  /** Visible and meant to have keyboard focus. */
  active: boolean;
  /** Folder the shell starts in; the home directory when there is none or it is gone. */
  cwd?: string | null;
  /** Typed into the shell once it is ready, e.g. the CLI agent to start. */
  command?: string;
  onSpawn?: (shell: pty.Spawned) => void;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [xterm, setXterm] = useState<Xterm | null>(null);
  const [finding, setFinding] = useState(false);
  // Read through a ref: the shell is started once, whatever the callbacks are by the time they fire.
  const handlers = useRef({ onSpawn, onExit });
  handlers.current = { onSpawn, onExit };

  useEffect(() => {
    const x = createXterm(host.current!, () => setFinding(true));
    const { term } = x;
    setXterm(x);

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
      .spawn(
        { cols: term.cols, rows: term.rows },
        (ev) => {
          if (disposed) return;
          if (ev.type === "data") {
            term.write(ev.data);
            waitForQuiet(350);
          } else handlers.current.onExit(); // the shell exited (e.g. `exit`)
        },
        cwd ?? undefined,
      )
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
      .catch((err) => term.write(`\x1b[31m${t("Failed to start shell: {error}", { error: String(err) })}\x1b[0m\r\n`));

    const onData = term.onData((d) => {
      if (ptyId) pty.write(ptyId, d).catch(console.error);
    });
    const onResize = term.onResize(({ cols, rows }) => {
      if (ptyId) pty.resize(ptyId, cols, rows).catch(console.error);
    });

    return () => {
      disposed = true;
      clearTimeout(quiet);
      onData.dispose();
      onResize.dispose();
      if (ptyId) void pty.kill(ptyId);
      x.dispose();
      setXterm(null);
    };
    // The command and folder are fixed for the life of a terminal; remount to change them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active || !xterm) return;
    xterm.fit();
    xterm.term.focus();
  }, [active, xterm]);

  return (
    <div className="term-wrap" hidden={!active}>
      <div className="term-view" ref={host} />
      {finding && xterm && <TerminalFind xterm={xterm} onClose={() => setFinding(false)} />}
    </div>
  );
}
