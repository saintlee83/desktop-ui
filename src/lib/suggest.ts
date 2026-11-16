// Completions in the composer: `@` mentions a file of the session's folder, `/` at the start
// runs a command or inserts a snippet.

export interface Trigger {
  kind: "file" | "command";
  /** What has been typed after the `@` or `/`. */
  query: string;
  /** Where the `@`/`/` token starts and ends in the text, so a pick can replace it. */
  start: number;
  end: number;
}

/** What the text before the caret asks to complete, if anything. */
export function triggerAt(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const at = /(^|\s)@([^\s@]*)$/.exec(before);
  if (at) return { kind: "file", query: at[2], start: caret - at[2].length - 1, end: caret };
  // A command is the whole message so far: "/plan", not "see /usr".
  const slash = /^\/([^\s/]*)$/.exec(before);
  if (slash) return { kind: "command", query: slash[1], start: 0, end: caret };
  return null;
}

/** How well `path` matches `q` (lowercase): the file's own name counts most. -1: not at all. */
function score(path: string, q: string): number {
  const p = path.toLowerCase();
  const name = p.slice(p.lastIndexOf("/") + 1);
  if (name === q) return 1000;
  if (name.startsWith(q)) return 800 - name.length;
  if (name.includes(q)) return 600 - name.length;
  if (p.includes(q)) return 400 - p.length / 10;
  let i = 0;
  for (const ch of p) if (ch === q[i]) i++;
  return i === q.length ? 200 - p.length / 10 : -1;
}

/** The best matches for `query` among `files`; with no query, the shallowest files first. */
export function rankFiles(files: string[], query: string, limit = 8): string[] {
  const q = query.toLowerCase();
  if (!q) {
    const depth = (f: string) => f.split("/").length;
    return [...files].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b)).slice(0, limit);
  }
  return files
    .map((f) => [score(f, q), f] as const)
    .filter(([s]) => s >= 0)
    .sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]))
    .slice(0, limit)
    .map(([, f]) => f);
}
