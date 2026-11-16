import { useEffect, useRef, useState } from "react";
import * as con from "../lib/console";
import { folderName } from "../lib/folders";
import { currentLang, t, useT } from "../lib/i18n";
import { activeMode, activeModel, awaitingTool, currentFolder, isStreaming, messageText, useStore } from "../lib/store";
import type { ToolPart } from "../lib/types";
import { TerminalFind, createXterm, type Xterm } from "./TerminalView";

/** How far the transcript has been written: whole messages, then parts, then lines of a streaming text part. */
interface Written {
  session: string | null;
  /** Ids of the messages written (or being written), to notice when the thread changes under them. */
  ids: string[];
  msg: number;
  part: number;
  line: number;
  /** The current message's separator line is out. */
  opened: boolean;
}

const fresh = (session: string | null): Written => ({ session, ids: [], msg: 0, part: 0, line: 0, opened: false });

/**
 * Code's terminal view when it shows the open session itself: the same conversation as
 * the chat, written out as a command-line agent would, and live while the agent works.
 * What is typed here is sent to the session like a message from the composer, so either
 * view can carry on where the other left off.
 *
 * Finished output is written once and scrolls like any terminal's. Only the bottom of the
 * screen is redrawn: the line being streamed, the tool call in progress, the status line
 * and the prompt.
 */
export function SessionConsole({ active, redraw }: { active: boolean; redraw: number }) {
  const host = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const api = useRef<{ refresh(full: boolean): void; focus(): void } | null>(null);
  const [xterm, setXterm] = useState<Xterm | null>(null);
  const [finding, setFinding] = useState(false);
  // The transcript is written in the interface language: a change of language writes it out again.
  useT();
  const lang = currentLang();

  useEffect(() => {
    const x = createXterm(host.current!, () => setFinding(true));
    const { term } = x;
    setXterm(x);

    let written = fresh(null);
    /** Rows the redrawn bottom part took at the last write, counted from its first row to the cursor. */
    let liveRows = 0;
    let writing = false;
    let dirty = false;
    let full = true;
    let frame = 0;
    let raf = 0;
    let input = "";
    /** Position while stepping back through earlier prompts with ↑ (-1: not), and the draft it set aside. */
    let recall = -1;
    let draft = "";

    const line = () => term.buffer.active.baseY + term.buffer.active.cursorY;
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(flush);
    };

    function flush() {
      raf = 0;
      if (!activeRef.current) {
        full = true; // written out again when the view comes back
        return;
      }
      if (writing) {
        dirty = true;
        return;
      }
      const s = useStore.getState();
      const session = s.sessions.find((x) => x.id === s.activeId) ?? null;
      const messages = session?.messages ?? [];
      const cols = term.cols;
      const sameThread = written.ids.every((id, i) => messages[i]?.id === id);

      // A prompt recalled with ↑ belongs to the session it came from; another session gets the draft back.
      if (written.session !== (session?.id ?? null) && recall !== -1) {
        input = draft;
        recall = -1;
      }

      let out = "\r" + (liveRows ? `\x1b[${liveRows}A` : "") + "\x1b[J";
      if (full || written.session !== (session?.id ?? null) || !sameThread || liveRows >= term.rows - 1) {
        term.reset();
        full = false;
        liveRows = 0;
        written = fresh(session?.id ?? null);
        const folder = currentFolder(s);
        out = "\x1b[?2004h" + con.header(session?.title ?? t("New session"), folder, cols).join("\r\n") + "\r\n";
      }

      // Everything that will not change any more is written once.
      const done: string[] = [];
      const live: string[] = [];
      let thinking = false;
      let tool: ToolPart | null = null;
      scan: while (written.msg < messages.length) {
        const m = messages[written.msg];
        if (!written.opened) {
          done.push("");
          written.opened = true;
          written.ids.push(m.id);
        }
        if (m.role === "user") {
          done.push(...con.userBlock(m, messageText(m), cols));
        } else {
          const streaming = m.status === "streaming";
          while (written.part < m.parts.length) {
            const p = m.parts[written.part];
            const settled = !streaming || written.part < m.parts.length - 1;
            // A blank line between the steps of a reply.
            const gap = written.part > 0 ? [""] : [];
            if (p.type === "text") {
              const lines = con.textLines(p, settled);
              // While a reply streams, its last line is still growing: it is drawn, not written.
              // Blank lines wait too, in case the reply ends there.
              let complete = settled ? lines.length : lines.length - 1;
              if (!settled) while (complete > written.line && !lines[complete - 1]) complete--;
              if (complete > written.line) {
                done.push(...(written.line === 0 ? gap : []), ...con.textRows(lines, written.line, complete, cols));
                written.line = complete;
              }
              if (!settled) {
                if (lines[lines.length - 1]) live.push(...(written.line === 0 ? gap : []), ...con.textRows(lines, lines.length - 1, lines.length, cols));
                break scan;
              }
            } else if (p.type === "thinking") {
              if (!p.endedAt && streaming) {
                thinking = true;
                break scan;
              }
              done.push(...gap, con.thinkingRow(p));
            } else if (con.toolDone(p) || !streaming) {
              done.push(...gap, ...con.toolBlock(p, cols));
            } else {
              tool = p;
              live.push(...gap, ...con.liveToolBlock(p, cols));
              break scan;
            }
            written.part++;
            written.line = 0;
          }
          if (streaming) break;
          done.push(...con.endRows(m, cols));
        }
        written.msg++;
        written.part = 0;
        written.line = 0;
        written.opened = false;
      }

      // The bottom of the screen: progress, then the prompt.
      const running = !!session && !!s.runs[session.id];
      const elsewhere = !!session && !running && isStreaming(session);
      const awaiting = running && tool?.status === "awaiting" && tool.permissionId ? tool : null;
      const width = Math.max(20, cols - 1);
      if ((running || elsewhere) && !awaiting) {
        const started = messages.at(-1)?.createdAt ?? Date.now();
        const secs = Math.max(0, Math.round((Date.now() - started) / 1000));
        const spinner = con.SPINNER[frame % con.SPINNER.length];
        if (live.length) live.push("");
        live.push(`${con.sgr.yellow}${spinner}${con.sgr.reset} ${thinking ? t("Thinking…") : t("Working…")} ${con.dim(t("({secs}s · esc to interrupt)", { secs }))}`);
      }
      live.push("");
      if (awaiting) {
        live.push(...con.wrap(`${con.sgr.bold}${t("Allow {name}?", { name: awaiting.name })}${con.sgr.reset} ${con.dim(t("y yes · a always (this session) · n no · esc stop"))}`, width));
      } else {
        const plan = activeMode(s) === "plan";
        const modelId = activeModel(s);
        const model = s.models.find((m) => m.id === modelId)?.name ?? modelId;
        const folder = currentFolder(s);
        const queued = session ? s.queued[session.id] : undefined;
        if (queued) live.push(...con.wrap(con.dim(`  ⏱ ${t("Sends when the agent finishes: {text}", { text: queued.text.replace(/\s+/g, " ") })}`), width, "    "));
        live.push(con.dim(`  ${plan ? t("Plan") : t("Agent")} · ${model}${folder ? ` · ${folderName(folder)}` : ""} · ⇧⇥ ${plan ? t("Agent") : t("Plan")}`));
        live.push(
          elsewhere
            ? con.dim(`❯ ${t("Running in another window. It shows here as it goes.")}`)
            : `${con.dim("❯")} ${input.replace(/\n/g, "\r\n  ")}`,
        );
      }

      out += done.map((row) => row + "\r\n").join("");
      writing = true;
      let start = 0;
      term.write(out, () => {
        start = line();
      });
      term.write(live.join("\r\n"), () => {
        liveRows = line() - start;
        writing = false;
        if (dirty) {
          dirty = false;
          schedule();
        }
      });
    }

    const refresh = (all: boolean) => {
      if (all) full = true;
      schedule();
    };

    const submit = () => {
      const s = useStore.getState();
      const session = s.sessions.find((x) => x.id === s.activeId);
      if (input.endsWith("\\")) {
        input = input.slice(0, -1) + "\n"; // a trailing backslash continues on a new line
        return;
      }
      // While this window runs the session, the message waits its turn (see `send`); one
      // running in another window can only be watched.
      if (!input.trim() || (session && !s.runs[session.id] && isStreaming(session))) return;
      const text = input;
      input = "";
      recall = -1;
      void s.send(text);
    };

    const step = (direction: 1 | -1) => {
      const s = useStore.getState();
      const prompts = (s.sessions.find((x) => x.id === s.activeId)?.messages ?? []).filter((m) => m.role === "user").map(messageText);
      const next = recall + direction;
      if (next < -1 || next >= prompts.length) return;
      if (recall === -1) draft = input;
      recall = next;
      input = recall === -1 ? draft : prompts[prompts.length - 1 - recall];
    };

    const onData = term.onData((data) => {
      const s = useStore.getState();
      const session = s.sessions.find((x) => x.id === s.activeId) ?? null;
      const running = !!session && !!s.runs[session.id];
      if (data === "\x1b") {
        if (running) s.stop();
        return;
      }
      const ask = running ? awaitingTool(session) : null;
      if (ask) {
        if (data === "y" || data === "Y") s.answerPermission(ask, true);
        else if (data === "a" || data === "A") s.allowAlways(ask);
        else if (data === "n" || data === "N") s.answerPermission(ask, false);
        else if (data === "\x03") s.stop();
        return;
      }
      if (data.startsWith("\x1b[200~")) {
        input += data.replace(/^\x1b\[200~/, "").replace(/\x1b\[201~$/, "").replace(/\r\n?/g, "\n");
      } else if (data === "\r") submit();
      else if (data === "\x1b\r" || data === "\n") input += "\n";
      else if (data === "\x7f" || data === "\b") input = Array.from(input).slice(0, -1).join("");
      else if (data === "\x17") input = input.replace(/\S+\s*$/, "");
      else if (data === "\x15") input = "";
      else if (data === "\x03") {
        if (running) s.stop();
        else input = "";
      } else if (data === "\x0c") full = true;
      else if (data === "\x1b[A") step(1);
      else if (data === "\x1b[B") step(-1);
      else if (data === "\x1b[Z") s.setMode(activeMode(s) === "agent" ? "plan" : "agent");
      else if (!data.startsWith("\x1b")) input += data.replace(/[\x00-\x1f\x7f]/g, "");
      schedule();
    });

    // Redraw whatever the session does, here or in another window.
    const unsubscribe = useStore.subscribe((st, prev) => {
      if (
        st.sessions !== prev.sessions ||
        st.activeId !== prev.activeId ||
        st.runs !== prev.runs ||
        st.queued !== prev.queued ||
        st.mode !== prev.mode ||
        st.model !== prev.model ||
        st.models !== prev.models
      )
        schedule();
    });
    // Keeps the spinner and the seconds going while the agent works.
    const ticker = window.setInterval(() => {
      const s = useStore.getState();
      const session = s.sessions.find((x) => x.id === s.activeId);
      if (activeRef.current && isStreaming(session)) {
        frame++;
        schedule();
      }
    }, 140);

    // Rows wrap to the width, so a resize writes the transcript out again (once it settles).
    let resized = 0;
    const onResize = term.onResize(() => {
      clearTimeout(resized);
      resized = window.setTimeout(() => refresh(true), 120);
    });
    api.current = {
      refresh,
      focus: () => {
        x.fit();
        term.focus();
      },
    };
    schedule();

    return () => {
      api.current = null;
      cancelAnimationFrame(raf);
      clearInterval(ticker);
      clearTimeout(resized);
      unsubscribe();
      onData.dispose();
      onResize.dispose();
      x.dispose();
      setXterm(null);
    };
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (!active) return;
    api.current?.focus();
    api.current?.refresh(true);
  }, [active]);

  useEffect(() => {
    if (redraw) api.current?.refresh(true);
  }, [redraw]);

  const shownLang = useRef(lang);
  useEffect(() => {
    if (shownLang.current === lang) return;
    shownLang.current = lang;
    api.current?.refresh(true);
  }, [lang]);

  return (
    <div className="term-wrap" hidden={!active}>
      <div className="term-view" ref={host} />
      {finding && xterm && <TerminalFind xterm={xterm} onClose={() => setFinding(false)} />}
    </div>
  );
}
