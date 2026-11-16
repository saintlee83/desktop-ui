// Getting conversations out and back in: one session as Markdown, everything as a JSON
// backup, and how much of the browser storage the saved state takes.

import { t, tn } from "./i18n";
import { pickTextFile, saveTextFile } from "./native";
import { STORAGE_KEY, flushSave, messageText, useStore } from "./store";
import { toast } from "./toast";
import type { Session } from "./types";
import { dateLocale } from "./util";

/** Storage a webview gives a page, roughly; the saved state has to fit in it. */
export const STORAGE_LIMIT = 5 * 1024 * 1024;

/** Bytes the saved state takes (localStorage keeps UTF-16, two bytes a character). */
export function storageUsed(): number {
  flushSave();
  try {
    return (localStorage.getItem(STORAGE_KEY)?.length ?? 0) * 2;
  } catch {
    return 0;
  }
}

const slug = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "session";

const fence = (body: string, lang = "") => {
  // A fence longer than any backtick run inside, so code with ``` in it survives.
  const longest = Math.max(2, ...(body.match(/`+/g) ?? []).map((m) => m.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${lang}\n${body.replace(/\n$/, "")}\n${ticks}`;
};

/** A session as a Markdown document: prompts, replies, and what the agent did. */
export function sessionMarkdown(session: Session): string {
  const { models } = useStore.getState();
  const name = (id?: string) => models.find((m) => m.id === id)?.name ?? id ?? t("Assistant");
  const out = [`# ${session.title}`, "", `_${new Date(session.createdAt).toLocaleString(dateLocale())}${session.folder ? ` · ${session.folder}` : ""}_`, ""];
  for (const m of session.messages) {
    if (m.role === "user") {
      out.push(`## ${t("You")}`, "", messageText(m), "");
      const files = [...(m.files?.map((f) => f.name) ?? []), ...(m.attachments ?? [])];
      if (files.length) out.push(`_${t("Attached: {files}", { files: files.join(", ") })}_`, "");
      continue;
    }
    // The mode by its id, "agent" or "plan", looked up like any other text.
    out.push(`## ${name(m.model)}${m.mode && m.mode !== "chat" ? ` (${t(m.mode)})` : ""}`, "");
    for (const p of m.parts) {
      if (p.type === "text") out.push(p.text.trim(), "");
      else if (p.type === "tool") {
        const mark = p.status === "ok" ? "✓" : p.status === "denied" ? "⊘" : "✗";
        out.push(`> ${mark} **${p.name}** \`${p.input.replace(/`/g, "'")}\`${p.reverted ? ` ${t("(reverted)")}` : ""}`, "");
        if (p.diff) out.push(fence(p.diff.patch, "diff"), "");
        else if (p.kind === "bash" && p.output) out.push(fence(p.output), "");
      }
    }
    if (m.status === "error") out.push(`> ${t("Error: {message}", { message: m.error ?? t("something went wrong") })}`, "");
    if (m.status === "cancelled") out.push(`> ${t("Stopped by user")}`, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export async function exportSession(session: Session) {
  try {
    if (await saveTextFile(`${slug(session.title)}.md`, sessionMarkdown(session))) toast(t("Exported “{title}”", { title: session.title }));
  } catch (e) {
    toast(t("Couldn't export: {error}", { error: String(e) }));
  }
}

/** Every session, project and snippet, as one JSON file that `importBackup` reads back. */
export async function exportAll() {
  const { sessions, projects, snippets } = useStore.getState();
  const backup = { app: "agent-desktop", version: 1, exportedAt: new Date().toISOString(), sessions, projects, snippets };
  // Today's date where the user is (toISOString would give UTC's, a day off around midnight).
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  try {
    if (await saveTextFile(`agent-desktop-backup-${date}.json`, JSON.stringify(backup, null, 1), "application/json")) {
      toast(tn(sessions.length, "Backed up {n} session", "Backed up {n} sessions"));
    }
  } catch (e) {
    toast(t("Couldn't back up: {error}", { error: String(e) }));
  }
}

/** Reads a backup and adds what isn't here yet; nothing already here is replaced. */
export async function importBackup() {
  const text = await pickTextFile();
  if (text === null) return;
  try {
    const data = JSON.parse(text) as { app?: string; sessions?: Session[]; projects?: never[]; snippets?: never[] };
    if (data.app !== "agent-desktop" || !Array.isArray(data.sessions)) throw new Error(t("this isn't an Agent Desktop backup"));
    const added = useStore.getState().importData(data);
    toast(added ? tn(added, "Imported {n} session", "Imported {n} sessions") : t("Nothing new in that backup"));
  } catch (e) {
    toast(t("Couldn't import: {error}", { error: e instanceof Error ? e.message : String(e) }));
  }
}
