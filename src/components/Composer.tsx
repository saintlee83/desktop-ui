import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ArrowUp, FileUp, Paperclip, Square, X } from "lucide-react";
import { inTauri } from "../lib/agent";
import { folderInfo } from "../lib/folders";
import { cliActive, currentFolder, isStreaming, kindOf, messageText, useStore } from "../lib/store";
import { basename, cx, formatTokens, mod, withViewTransition } from "../lib/util";
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
  const models = useStore((s) => s.models);
  const model = useStore((s) => s.model);
  const setModel = useStore((s) => s.setModel);
  const groups = [...new Set(models.map((m) => m.provider))].map((provider) => ({
    label: provider,
    items: models
      .filter((m) => m.provider === provider)
      .map((m) => ({ id: m.id, name: m.name, description: m.description, meta: formatTokens(m.contextWindow) })),
  }));
  return <Picker label="Model" value={model} onChange={setModel} groups={groups} onDone={onDone} />;
}

export function Composer({ variant = "docked", seed }: { variant?: "home" | "docked"; seed?: ComposerSeed | null }) {
  const activeId = useStore((s) => s.activeId);
  const running = useStore((s) => (s.activeId ? !!s.runs[s.activeId] : false));
  const mode = useStore((s) => s.mode);
  const section = useStore((s) => s.section);
  // A chat is plain conversation until it has a folder; then the agent works in it, with modes.
  const kind = useStore(kindOf);
  const folder = useStore(currentFolder);
  // Behind Code's terminal view the composer stays mounted (it keeps its draft) but is not on screen.
  const offscreen = useStore(cliActive);
  // Another window is running this session: it can be watched here, not written to.
  const elsewhere = useStore((s) => !!s.activeId && !s.runs[s.activeId] && isStreaming(s.sessions.find((x) => x.id === s.activeId)));
  const { send, stop, setFolder } = useStore.getState();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((names: string[]) => {
    if (names.length) setFiles((fs) => [...new Set([...fs, ...names])]);
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
        if (!taRef.current?.offsetParent) return; // hidden behind the terminal view
        if (payload.type === "enter" || payload.type === "over") setDropping(true);
        else setDropping(false);
        if (payload.type === "drop") {
          // A dropped folder becomes the folder to work in; anything else is attached.
          void Promise.all(payload.paths.map((path) => folderInfo(path).then((info) => ({ path, dir: info.isDir }), () => ({ path, dir: false })))).then(
            (dropped) => {
              const dir = dropped.find((d) => d.dir);
              if (dir) setFolder(dir.path);
              addFiles(dropped.filter((d) => !d.dir).map((d) => basename(d.path)));
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
    // A browser tells folders from files, but only gives their names.
    const entries = Array.from(e.dataTransfer.items)
      .filter((item) => item.kind === "file")
      .map((item) => ({ name: item.getAsFile()?.name ?? "", dir: !!item.webkitGetAsEntry?.()?.isDirectory }));
    const dir = entries.find((x) => x.dir && x.name);
    if (dir) setFolder(dir.name);
    addFiles(entries.filter((x) => !x.dir && x.name).map((x) => x.name));
    taRef.current?.focus();
  };
  const onPaste = (e: ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (!pasted.length) return;
    e.preventDefault();
    addFiles(pasted.map((f) => f.name || "pasted file"));
  };

  const submit = () => {
    if (running || elsewhere || !text.trim()) return;
    const [t, f] = [text, files];
    // From the home screen, animate the composer docking to the bottom.
    if (variant === "home") withViewTransition(() => void send(t, f));
    else void send(t, f);
    setText("");
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

  const canSend = !!text.trim() && !elsewhere;

  return (
    <div className={cx("composer-wrap", `is-${variant}`)}>
      <div
        className={cx("composer", running && "running", dropping && "dropping")}
        onDragEnter={onDragEnter}
        onDragOver={(e) => hasFiles(e) && e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {files.length > 0 && (
          <div className="attachments">
            {files.map((f) => (
              <span key={f} className="chip">
                <Paperclip size={11} />
                <span className="chip-name">{f}</span>
                <button aria-label={`Remove ${f}`} onClick={() => setFiles((fs) => fs.filter((x) => x !== f))}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          aria-label="Message"
          placeholder={
            elsewhere
              ? "This session is running in another window…"
              : kind === "chat"
                ? "Ask anything…"
                : mode === "plan"
                  ? "Describe what you want to plan…"
                  : kind === "code"
                    ? "Describe a coding task…"
                    : "Describe a task for the agent…"
          }
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === "ArrowUp" && !text && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
              if (recall()) e.preventDefault();
            }
          }}
        />
        <div className="composer-bar">
          <IconButton label="Attach files" tipSide="top" onClick={() => fileRef.current?.click()}>
            <Paperclip size={16} />
          </IconButton>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []).map((f) => f.name));
              e.target.value = "";
            }}
          />
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
            className={cx("send", running && "stop")}
            onClick={running ? () => stop() : submit}
            disabled={!running && !canSend}
            aria-label={running ? "Stop" : "Send"}
            {...(running ? tip("Stop", "Esc", "top") : elsewhere ? tip("Running in another window", undefined, "top") : tip("Send", "↵", "top"))}
          >
            {running ? (
              <Square key="stop" size={11} fill="currentColor" className={cx(swapped && "pop")} />
            ) : (
              <ArrowUp key="send" size={16} className={cx(swapped && "pop")} />
            )}
          </button>
        </div>
        {dropping && (
          <div className="drop-hint" aria-hidden>
            <FileUp size={16} />
            Drop files to attach, or a folder to work in
          </div>
        )}
      </div>
      {variant === "docked" && (
        <div className="composer-hint">
          <span className="hint">
            <Keys combo="↵" /> send
            <Keys combo="⇧↵" /> new line
          </span>
          <span className="hint">
            {kind === "chat" ? "AI can make mistakes. Double-check important info." : "Agents can make mistakes. Review changes."}
          </span>
        </div>
      )}
    </div>
  );
}
