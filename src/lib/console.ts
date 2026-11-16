// Renders a session as terminal output, for Code's terminal view when it shows the open
// session itself (the "Agent Desktop" CLI). Pure functions: SessionConsole decides when
// to write what. The look follows command-line coding agents: `❯` for prompts, `●` for
// what the agent says and does, `⎿` for results.

import { t, tn } from "./i18n";
import type { Message, Part, ToolPart } from "./types";

const ESC = "\x1b[";
export const sgr = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  cyan: `${ESC}36m`,
  noBold: `${ESC}22m`,
  noItalic: `${ESC}23m`,
  fg: `${ESC}39m`,
};
const paint = (style: string, text: string) => `${style}${text}${sgr.reset}`;
export const dim = (text: string) => paint(sgr.dim, text);

/** Spinner frames for "working" (plain dingbats, none with an emoji form). */
export const SPINNER = ["·", "✢", "✶", "✻", "✽", "✻", "✶", "✢"];

/** Rows of a tool's output shown before the rest is folded into "… +N lines". */
const OUTPUT_ROWS = 4;
const DIFF_ROWS = 14;

// ---------------- width and wrapping ----------------

/** Terminal columns a code point takes: 0 for marks and joiners, 2 for wide (CJK, Hangul, most emoji). */
export function charWidth(cp: number): number {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (
    (cp >= 0x300 && cp <= 0x36f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    cp === 0x200b ||
    cp === 0x200d
  )
    return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2;
  return 1;
}

const SGR_RE = /\x1b\[[0-9;]*m/y;

/**
 * Wraps one line that may contain SGR color codes to `width` columns, breaking after
 * spaces where it can and anywhere where it must (as in CJK text). Every row after the
 * first starts with `indent`; colors carry over, since the terminal keeps them across rows.
 */
export function wrap(line: string, width: number, indent = ""): string[] {
  const indentWidth = Array.from(indent).length;
  const rows: string[] = [];
  let row = "";
  let col = 0;
  // Where the row could break: just after its last space.
  let breakAt = -1;
  let breakCol = 0;
  let i = 0;
  while (i < line.length) {
    SGR_RE.lastIndex = i;
    const code = SGR_RE.exec(line);
    if (code) {
      row += code[0];
      i += code[0].length;
      continue;
    }
    const cp = line.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    i += ch.length;
    const w = charWidth(cp);
    if (col + w > width && col > 0) {
      if (breakAt > 0 && ch !== " ") {
        rows.push(row.slice(0, breakAt).trimEnd());
        row = indent + row.slice(breakAt);
        col = indentWidth + (col - breakCol);
      } else {
        rows.push(row.trimEnd());
        row = indent;
        col = indentWidth;
        if (ch === " ") {
          breakAt = -1;
          continue; // a space that would start the next row is dropped
        }
      }
      breakAt = -1;
    }
    row += ch;
    col += w;
    if (ch === " ") {
      breakAt = row.length;
      breakCol = col;
    }
  }
  rows.push(row);
  return rows;
}

// ---------------- markdown, lightly ----------------

/** Bold, italics and inline code; the rest of the markdown is shown as written. */
function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, `${sgr.bold}$1${sgr.noBold}`)
    .replace(/(^|[\s(])[_*]([^_*\s](?:[^_*]*[^_*\s])?)[_*](?=[\s).,!?:;]|$)/g, `$1${sgr.italic}$2${sgr.noItalic}`)
    .replace(/`([^`]+)`/g, `${sgr.cyan}$1${sgr.fg}`);
}

/**
 * Styles each line of a markdown answer. Code fences need the lines before them,
 * so this always looks at the whole text; the caller picks the lines it needs.
 */
function markdownLines(text: string): string[] {
  let fence = false;
  return text.split("\n").map((raw) => {
    const line = raw.replace(/\t/g, "  ");
    if (/^\s*```/.test(line)) {
      fence = !fence;
      return dim(line.trim());
    }
    if (fence) return paint(sgr.cyan, line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) return paint(sgr.bold, heading[1]);
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) return `${bullet[1]}• ${inline(bullet[2])}`;
    return inline(line);
  });
}

// ---------------- blocks ----------------

const BULLET = "● ";
const RESULT = "  ⎿  ";
const UNDER = "     ";

export function header(title: string, folder: string | null, cols: number): string[] {
  const width = Math.max(20, cols - 1);
  return [
    ...wrap(`${paint(sgr.bold, "✻ Agent Desktop")}  ${dim(title)}`, width, "  "),
    ...wrap(dim(`  ${folder ?? t("No folder: the agent works without one")}`), width, "  "),
    ...wrap(dim(`  ${t("↵ send · ⌥↵ new line · ⇧⇥ Agent/Plan · esc stop · ⇧⌘T back to the chat")}`), width, "  "),
  ];
}

export function userBlock(m: Message, text: string, cols: number): string[] {
  const width = Math.max(20, cols - 1);
  const lines = text.replace(/\t/g, "  ").split("\n");
  const rows = lines.flatMap((line, i) => wrap((i === 0 ? dim("❯ ") : "  ") + line, width, "  "));
  if (m.attachments?.length) rows.push(...wrap(dim(`${RESULT}${t("Attached {files}", { files: m.attachments.join(", ") })}`), width, UNDER));
  return rows;
}

/**
 * The text part's lines, styled, without leading blank lines (a reply may open with some).
 * Once it is `settled` (nothing more will be added) trailing blank lines go too.
 */
export function textLines(part: Extract<Part, { type: "text" }>, settled: boolean): string[] {
  const text = part.text.replace(/^\n+/, "");
  return markdownLines(settled ? text.replace(/\n+$/, "") : text);
}

/** Rows for lines `from` (inclusive) to `to` (exclusive) of a text part; the first line carries the bullet. */
export function textRows(lines: string[], from: number, to: number, cols: number): string[] {
  const width = Math.max(20, cols - 1);
  const out: string[] = [];
  for (let i = from; i < to; i++) out.push(...wrap((i === 0 ? BULLET : "  ") + lines[i], width, "  "));
  return out;
}

export function thinkingRow(part: Extract<Part, { type: "thinking" }>): string {
  const secs = Math.max(1, Math.round(((part.endedAt ?? Date.now()) - part.startedAt) / 1000));
  return dim(`${sgr.italic}✻ ${t("Thought for {n}s", { n: secs })}${sgr.noItalic}`);
}

const STATUS_DOT: Record<ToolPart["status"], string> = {
  ok: sgr.green,
  error: sgr.red,
  denied: sgr.dim,
  running: sgr.dim,
  awaiting: sgr.yellow,
};

function toolTitle(tool: ToolPart): string {
  const verb = tool.kind === "edit" && tool.diff ? "Update" : tool.name;
  return `${paint(STATUS_DOT[tool.status], "●")} ${paint(sgr.bold, verb)}(${tool.input})`;
}

/** "… +N lines" under output that was cut short. */
const more = (n: number) => dim(`${UNDER}${tn(n, "… +{n} line", "… +{n} lines")}`);

function outputRows(output: string, width: number, style: (s: string) => string): string[] {
  const lines = output.replace(/\n+$/, "").split("\n");
  const shown = lines.slice(0, OUTPUT_ROWS).flatMap((line, i) => wrap((i === 0 ? RESULT : UNDER) + style(line), width, UNDER));
  return lines.length > OUTPUT_ROWS ? [...shown, more(lines.length - OUTPUT_ROWS)] : shown;
}

function diffRows(tool: ToolPart, width: number): string[] {
  const diff = tool.diff!;
  const summary = t("Updated {path} with {additions} and {removals}", {
    path: paint(sgr.bold, diff.path),
    additions: tn(diff.additions, "{n} addition", "{n} additions"),
    removals: tn(diff.deletions, "{n} removal", "{n} removals"),
  });
  const rows = [`${RESULT}${summary}`];
  const lines = diff.patch.replace(/\n$/, "").split("\n").filter((l) => !l.startsWith("@@"));
  for (const line of lines.slice(0, DIFF_ROWS)) {
    const sign = line[0];
    const body = line.slice(1).replace(/\t/g, "  ");
    const styled = sign === "+" ? paint(sgr.green, `+ ${body}`) : sign === "-" ? paint(sgr.red, `- ${body}`) : dim(`  ${body}`);
    rows.push(...wrap(UNDER + styled, width, UNDER + "  "));
  }
  if (lines.length > DIFF_ROWS) rows.push(more(lines.length - DIFF_ROWS));
  return rows;
}

/** A call that was still going when the run was stopped (see `applyEvent` for "done"). */
const interrupted = (part: Part | undefined) => part?.type === "tool" && part.status === "error" && part.output === "Interrupted";

/** A finished tool call: its title and what came of it. */
export function toolBlock(tool: ToolPart, cols: number): string[] {
  const width = Math.max(20, cols - 1);
  const rows = wrap(toolTitle(tool), width, "  ");
  if (interrupted(tool)) rows.push(dim(`${RESULT}${t("Interrupted by user")}`));
  else if (tool.status === "denied") rows.push(dim(`${RESULT}${t("Denied")}`));
  else if (tool.diff && tool.status === "ok") rows.push(...diffRows(tool, width));
  else if (tool.output) rows.push(...outputRows(tool.output, width, tool.status === "error" ? (s) => paint(sgr.red, s) : dim));
  return rows;
}

/** A tool call still going: running, or waiting for the user's answer. */
export function liveToolBlock(tool: ToolPart, cols: number): string[] {
  const width = Math.max(20, cols - 1);
  const rows = wrap(toolTitle(tool), width, "  ");
  if (tool.status === "awaiting") {
    if (tool.reason) rows.push(...wrap(`${RESULT}${tool.reason}`, width, UNDER));
  } else {
    rows.push(dim(`${RESULT}${t("Running…")}`));
  }
  return rows;
}

/** How an assistant message ended, when it didn't end normally. */
export function endRows(m: Message, cols: number): string[] {
  const width = Math.max(20, cols - 1);
  if (m.status === "error") return wrap(paint(sgr.red, `${RESULT}${t("Error: {error}", { error: m.error ?? t("Something went wrong.") })}`), width, UNDER);
  // A stopped tool call already says so.
  if (m.status === "cancelled") return interrupted(m.parts.at(-1)) ? [] : [dim(`${RESULT}${t("Interrupted by user")}`)];
  return [];
}

/** A tool call is over once it has a final status. */
export const toolDone = (t: ToolPart) => t.status === "ok" || t.status === "error" || t.status === "denied";
