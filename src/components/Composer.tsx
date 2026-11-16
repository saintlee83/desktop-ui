import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  ArrowUp,
  AtSign,
  Bot,
  CircleHelp,
  Clock,
  Cpu,
  FileText,
  FileUp,
  FolderOpen,
  Map as MapIcon,
  Paperclip,
  SquarePen,
  SquareTerminal,
  Square,
  TextQuote,
  X,
  type LucideIcon,
} from "lucide-react";
import { addFolder } from "../lib/actions";
import { inTauri } from "../lib/agent";
import { chooseFiles, formatSize, fromFile, fromPath } from "../lib/attach";
import { folderInfo } from "../lib/folders";
import { currentLang, useT } from "../lib/i18n";
import { listFiles } from "../lib/native";
import { activeModel, cliActive, currentFolder, isStreaming, kindOf, messageText, useStore } from "../lib/store";
import { rankFiles, triggerAt } from "../lib/suggest";
import type { PendingFile } from "../lib/types";
import { composing, cx, formatTokens, isMac, mod, withViewTransition } from "../lib/util";
import { FolderPicker } from "./FolderPicker";
import { ModePicker } from "./ModePicker";
import { Picker } from "./Picker";
import { IconButton, Keys, tip } from "./ui";

/** Text to drop into the composer from outside (a starter prompt). `n` makes repeats distinct. */
export interface ComposerSeed {
  text: string;
  n: number;
}

function ModelPicker({ onDone }: { onDone: () => void }) {
  const t = useT();
  const models = useStore((s) => s.models);
  const model = useStore(activeModel);
  const setModel = useStore((s) => s.setModel);
  const groups = [...new Set(models.map((m) => m.provider))].map((provider) => ({
    label: provider,
    items: models
      .filter((m) => m.provider === provider)
      .map((m) => ({ id: m.id, name: m.name, description: m.description, meta: formatTokens(m.contextWindow) })),
  }));
  return <Picker label={t("Model")} value={model} onChange={setModel} groups={groups} onDone={onDone} />;
}

/** One completion offered under the message box. */
interface Suggestion {
  id: string;
  label: string;
  detail?: string;
  icon: LucideIcon;
  /** Replaces what was typed for it. */
  insert?: string;
  /** Runs instead, and the typed command goes. */
  run?: () => void;
}

/** The chip of an attached file: its preview for an image, its name and size otherwise. */
function FileChip({ file, onRemove }: { file: PendingFile; onRemove?: () => void }) {
  const t = useT();
  return (
    <span className={cx("chip", file.thumb && "has-thumb")} title={file.path ?? file.name}>
      {file.thumb ? <img src={file.thumb} alt="" className="chip-thumb" /> : <Paperclip size={11} />}
      <span className="chip-name">{file.name}</span>
      {file.size !== undefined && !file.thumb && <span className="chip-size">{formatSize(file.size)}</span>}
      {onRemove && (
        <button aria-label={t("Remove {name}", { name: file.name })} onClick={onRemove}>
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function Composer({ variant = "docked", seed }: { variant?: "home" | "docked"; seed?: ComposerSeed | null }) {
  const t = useT();
  // The interface language: the / command suggestions are worded in it, so they are rebuilt when it changes.
  const lang = currentLang();
  const activeId = useStore((s) => s.activeId);
  const running = useStore((s) => (s.activeId ? !!s.runs[s.activeId] : false));
  const queued = useStore((s) => (s.activeId ? s.queued[s.activeId] : undefined));
  const section = useStore((s) => s.section);
  const sendKey = useStore((s) => s.settings.sendKey ?? "enter");
  // A chat is plain conversation until it has a folder; then the agent works in it, with modes.
  const kind = useStore(kindOf);
  const folder = useStore(currentFolder);
  const mode = useStore((s) => s.sessions.find((x) => x.id === s.activeId)?.mode ?? s.mode);
  // Behind Code's terminal view the composer stays mounted (it keeps its draft) but is not on screen.
  const offscreen = useStore(cliActive);
  // Another window is running this session: it can be watched here, not written to.
  const elsewhere = useStore((s) => !!s.activeId && !s.runs[s.activeId] && isStreaming(s.sessions.find((x) => x.id === s.activeId)));
  const { send, stop, setFolder, unqueue } = useStore.getState();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const addFiles = useCallback((added: PendingFile[]) => {
    if (!added.length) return;
    setFiles((fs) => [...fs, ...added.filter((a) => !fs.some((f) => f.name === a.name && f.path === a.path))]);
  }, []);
  const focus = useCallback(() => taRef.current?.focus(), []);

  // Moving to another session or section puts the cursor in the message box, except while
  // someone is arrowing through the section switch: that focus is theirs to keep.
  useEffect(() => {
    const at = document.activeElement;
    const steering = !!at?.closest('[role="radiogroup"]') && at.matches(":focus-visible");
    if (!offscreen && !steering) taRef.current?.focus();
  }, [activeId, section, offscreen]);

  // The send button's icon pops when it turns into Stop and back, but not when the composer first appears.
  const [wasRunning, setWasRunning] = useState(running);
  const [swapped, setSwapped] = useState(false);
  if (wasRunning !== running) {
    setWasRunning(running);
    setSwapped(true);
  }
  // Likewise the mode menu eases in when a folder turns the chat into work, not on every mount.
  const [wasKind, setWasKind] = useState(kind);
  const [turned, setTurned] = useState(false);
  if (wasKind !== kind) {
    setWasKind(kind);
    setTurned(true);
  }

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 260) + "px";
  }, [text]);

  // A starter prompt replaces the draft and leaves the caret at its end, ready to finish.
  useEffect(() => {
    if (!seed) return;
    setText(seed.text);
    setCaret(seed.text.length);
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    requestAnimationFrame(() => ta.setSelectionRange(seed.text.length, seed.text.length));
  }, [seed]);

  // Inside Tauri the webview swallows file drops and reports them as window events instead.
  useEffect(() => {
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    let dead = false;
    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (cliActive(useStore.getState())) return; // behind the terminal view
        if (payload.type === "enter" || payload.type === "over") setDropping(true);
        else setDropping(false);
        if (payload.type === "drop") {
          // A dropped folder becomes the folder to work in; anything else is attached.
          void Promise.all(payload.paths.map((path) => folderInfo(path).then((info) => ({ path, dir: info.isDir }), () => ({ path, dir: false })))).then(
            (dropped) => {
              const dir = dropped.find((d) => d.dir);
              if (dir) setFolder(dir.path);
              addFiles(dropped.filter((d) => !d.dir).map((d) => fromPath(d.path)));
            },
          );
          taRef.current?.focus();
        }
      })
      .then((un) => {
        if (dead) un();
        else unlisten = un;
      })
      .catch(console.error);
    return () => {
      dead = true;
      unlisten?.();
    };
  }, [addFiles, setFolder]);

  // ---------------- @ files and / commands ----------------

  const trigger = useMemo(() => triggerAt(text, caret), [text, caret]);
  const triggerKey = trigger ? `${trigger.kind}:${trigger.start}` : null;
  // Esc closes the list for the token being typed; the next one opens it again.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [picked, setPicked] = useState(0);
  const models = useStore((s) => s.models);
  const snippets = useStore((s) => s.snippets);

  useEffect(() => {
    if (trigger?.kind !== "file" || !folder) return;
    let stale = false;
    listFiles(folder)
      .then((list) => !stale && setFolderFiles(list))
      .catch(() => !stale && setFolderFiles([]));
    return () => {
      stale = true;
    };
  }, [trigger?.kind, folder]);

  const suggestions = useMemo((): Suggestion[] => {
    if (!trigger) return [];
    const q = trigger.query.toLowerCase();
    if (trigger.kind === "file") {
      if (!folder) return [];
      return rankFiles(folderFiles, trigger.query).map((path) => ({
        id: path,
        label: path.slice(path.lastIndexOf("/") + 1),
        detail: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : undefined,
        icon: FileText,
        insert: `@${path} `,
      }));
    }
    const s = useStore.getState();
    const moded = kind !== "chat";
    const all: Suggestion[] = [
      ...(moded
        ? [
            { id: "plan", label: "/plan", detail: t("Switch to Plan mode"), icon: MapIcon, run: () => s.setMode("plan") },
            { id: "agent", label: "/agent", detail: t("Switch to Agent mode"), icon: Bot, run: () => s.setMode("agent") },
          ]
        : []),
      ...snippets.map((sn) => ({ id: `snippet-${sn.id}`, label: `/${sn.name}`, detail: sn.text.replace(/\s+/g, " ").slice(0, 60), icon: TextQuote, insert: sn.text })),
      { id: "new", label: "/new", detail: section === "chat" ? t("Start a new chat") : t("Start a new session"), icon: SquarePen, run: () => s.newSession() },
      { id: "folder", label: "/folder", detail: folder ? t("Change the folder") : t("Choose a folder to work in"), icon: FolderOpen, run: () => void addFolder() },
      ...(section === "code" ? [{ id: "terminal", label: "/terminal", detail: t("Show this session as a CLI"), icon: SquareTerminal, run: () => s.setCodeView("terminal") }] : []),
      ...models.map((m) => ({ id: `model-${m.id}`, label: `/model ${m.name}`, detail: m.provider, icon: Cpu, run: () => s.setModel(m.id) })),
      { id: "snippets", label: "/snippets", detail: t("Manage snippets"), icon: TextQuote, run: () => s.openSettings("snippets") },
      { id: "help", label: "/help", detail: t("Keyboard shortcuts"), icon: CircleHelp, run: () => s.openSettings("shortcuts") },
    ];
    return all.filter((x) => x.label.slice(1).toLowerCase().includes(q)).slice(0, 9);
  }, [trigger, folder, folderFiles, kind, section, models, snippets, lang, t]);

  const suggesting = !!trigger && dismissed !== triggerKey && (suggestions.length > 0 || (trigger.kind === "file" && !folder));
  useEffect(() => setPicked(0), [triggerKey, suggestions.length]);
  // Once the dismissed token is gone, the next one opens the list again (even at the same spot).
  useEffect(() => {
    if (!triggerKey) setDismissed(null);
  }, [triggerKey]);

  const accept = (item: Suggestion) => {
    if (!trigger) return;
    const after = text.slice(trigger.end);
    if (item.run) {
      const rest = after.replace(/^\s+/, "");
      setText(rest);
      setCaret(0);
      item.run();
      requestAnimationFrame(() => taRef.current?.setSelectionRange(0, 0));
      return;
    }
    const insert = item.insert ?? "";
    const next = text.slice(0, trigger.start) + insert + after;
    const at = trigger.start + insert.length;
    setText(next);
    setCaret(at);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(at, at);
    });
  };

  // ---------------- input ----------------

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDropping(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    // A browser tells folders from files, but only gives a folder's name.
    const items = Array.from(e.dataTransfer.items).filter((item) => item.kind === "file");
    const dir = items.find((item) => item.webkitGetAsEntry?.()?.isDirectory);
    if (dir) setFolder(dir.getAsFile()?.name ?? "");
    const picked = items.filter((item) => item !== dir).map((item) => item.getAsFile()).filter((f): f is File => !!f);
    void Promise.all(picked.map(fromFile)).then(addFiles);
    taRef.current?.focus();
  };
  const onPaste = (e: ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (!pasted.length) return;
    e.preventDefault();
    void Promise.all(pasted.map(fromFile)).then(addFiles);
  };

  const submit = () => {
    if (elsewhere || !text.trim()) return;
    const [prompt, f] = [text, files];
    // From the home screen, animate the composer docking to the bottom.
    if (variant === "home") withViewTransition(() => void send(prompt, f));
    else void send(prompt, f); // while the agent runs, this waits for it to finish
    setText("");
    setCaret(0);
    setFiles([]);
  };

  /** ↑ in an empty composer brings back the last prompt of this session for editing. */
  const recall = () => {
    const s = useStore.getState();
    const messages = s.sessions.find((x) => x.id === s.activeId)?.messages ?? [];
    const last = [...messages].reverse().find((m) => m.role === "user");
    if (!last) return false;
    setText(messageText(last));
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing(e)) return;
    if (suggesting) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = suggestions.length;
        if (n) setPicked((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && suggestions[picked]) {
        e.preventDefault();
        accept(suggestions[picked]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(triggerKey);
        return;
      }
    }
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    if (e.key === "Enter" && (sendKey === "modEnter" ? modKey : !e.shiftKey && !modKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp" && !text && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      if (recall()) e.preventDefault();
    }
  };

  const canSend = !!text.trim() && !elsewhere;
  const sendCombo = sendKey === "modEnter" ? `${mod}↵` : "↵";
  const newLineCombo = sendKey === "modEnter" ? "↵" : "⇧↵";

  return (
    <div className={cx("composer-wrap", `is-${variant}`)}>
      {suggesting && (
        <div className="suggest" role="listbox" aria-label={trigger!.kind === "file" ? t("Files") : t("Commands")} data-esc-layer>
          {trigger!.kind === "file" && !folder ? (
            <div className="suggest-empty">
              <AtSign size={13} /> {t("Add a folder to mention its files")}
            </div>
          ) : (
            suggestions.map((item, i) => (
              <button
                key={item.id}
                role="option"
                aria-selected={i === picked}
                className={cx("suggest-item", i === picked && "on")}
                onMouseEnter={() => setPicked(i)}
                // Keep the focus (and the caret) in the message box.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => accept(item)}
              >
                <item.icon size={14} />
                <span className="suggest-label">{item.label}</span>
                {item.detail && <span className="suggest-detail">{item.detail}</span>}
              </button>
            ))
          )}
          <div className="suggest-hint">
            <Keys combo="↑↓" /> {t("choose")} <Keys combo="↵" /> {t("pick")} <Keys combo="esc" /> {t("close")}
          </div>
        </div>
      )}
      <div
        className={cx("composer", running && "running", dropping && "dropping")}
        onDragEnter={onDragEnter}
        onDragOver={(e) => hasFiles(e) && e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {queued && (
          <div className="queued" role="status">
            <Clock size={12} />
            <span className="queued-label">{t("Sends when the agent finishes:")}</span>
            <span className="queued-text">{queued.text}</span>
            <button aria-label={t("Don't send it")} {...tip(t("Don't send it"))} onClick={() => activeId && unqueue(activeId)}>
              <X size={12} />
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="attachments">
            {files.map((f, i) => (
              <FileChip key={`${f.path ?? f.name}-${i}`} file={f} onRemove={() => setFiles((fs) => fs.filter((x) => x !== f))} />
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          aria-label={t("Message")}
          aria-autocomplete="list"
          aria-expanded={suggesting}
          placeholder={
            elsewhere
              ? t("This session is running in another window…")
              : running
                ? t("Queue a message for when the agent finishes…")
                : kind === "chat"
                  ? t("Ask anything… (/ for commands)")
                  : mode === "plan"
                    ? t("Describe what you want to plan… (@ to mention a file)")
                    : kind === "code"
                      ? t("Describe a coding task… (@ to mention a file)")
                      : t("Describe a task for the agent… (@ to mention a file)")
          }
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
        />
        <div className="composer-bar">
          <IconButton label={t("Attach files")} tipSide="top" onClick={() => void chooseFiles().then(addFiles)}>
            <Paperclip size={16} />
          </IconButton>
          <FolderPicker folder={folder} onChange={setFolder} kbd={`${mod}O`} onDone={focus} />
          {kind !== "chat" && (
            <span className={cx("mode-slot", turned && "turned")}>
              <ModePicker onDone={focus} />
            </span>
          )}
          <div className="spacer" />
          <ModelPicker onDone={focus} />
          {/* One button that changes role, so its color cross-fades instead of the button blinking out and in. */}
          <button
            className={cx("send", running && !text.trim() && "stop")}
            onClick={running && !text.trim() ? () => stop() : submit}
            disabled={!running && !canSend}
            aria-label={running ? (text.trim() ? t("Queue") : t("Stop")) : t("Send")}
            {...(running
              ? text.trim()
                ? tip(t("Send when the agent finishes"), sendCombo, "top")
                : tip(t("Stop"), "Esc", "top")
              : elsewhere
                ? tip(t("Running in another window"), undefined, "top")
                : tip(t("Send"), sendCombo, "top"))}
          >
            {running && !text.trim() ? (
              <Square key="stop" size={11} fill="currentColor" className={cx(swapped && "pop")} />
            ) : running ? (
              <Clock key="queue" size={15} className="pop" />
            ) : (
              <ArrowUp key="send" size={16} className={cx(swapped && "pop")} />
            )}
          </button>
        </div>
        {dropping && (
          <div className="drop-hint" aria-hidden>
            <FileUp size={16} />
            {t("Drop files to attach, or a folder to work in")}
          </div>
        )}
      </div>
      {variant === "docked" && (
        <div className="composer-hint">
          <span className="hint">
            <Keys combo={sendCombo} /> {t("send")}
            <Keys combo={newLineCombo} /> {t("new line")}
            {kind !== "chat" && (
              <>
                <Keys combo="@" /> {t("file")}
              </>
            )}
            <Keys combo="/" /> {t("commands")}
          </span>
          <span className="hint">
            {kind === "chat" ? t("AI can make mistakes. Double-check important info.") : t("Agents can make mistakes. Review changes.")}
          </span>
        </div>
      )}
    </div>
  );
}

export { FileChip };
