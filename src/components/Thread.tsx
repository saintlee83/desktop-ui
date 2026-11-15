import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  BookOpenText,
  Bug,
  FileText,
  FlaskConical,
  Folder,
  FolderOpen,
  GraduationCap,
  Lightbulb,
  ListChecks,
  PenLine,
  Scale,
  Table2,
  WandSparkles,
} from "lucide-react";
import { folderName } from "../lib/folders";
import { homeFolder, kindOf, useActiveSession, useStore } from "../lib/store";
import { cx, usePresence } from "../lib/util";
import { MessageView } from "./MessageView";
import { Composer, type ComposerSeed } from "./Composer";

/**
 * The new-session screen for each kind of session. A chat is plain conversation; with a
 * folder it is work. Starter prompts ending in a space are openers the user finishes; the
 * rest are ready to send.
 */
/** The folder's name, set off from the sentence around it; a plain phrase when there is none. */
const named = (folder: string | null, otherwise: string) => (folder ? <b>{folderName(folder)}</b> : otherwise);

const HOME_COPY = {
  chat: {
    title: "How can I help you today?",
    body: () => "Chat with any model. Add a folder and the agent can work in it.",
    starters: [
      { icon: Lightbulb, label: "Brainstorm ideas", prompt: "Help me brainstorm ideas for " },
      { icon: GraduationCap, label: "Explain a concept", prompt: "Explain, step by step, how " },
      { icon: PenLine, label: "Draft a message", prompt: "Draft a short, friendly message to " },
      { icon: Scale, label: "Compare options", prompt: "Compare the trade-offs between " },
    ],
  },
  work: {
    title: "What should we work on?",
    body: (folder: string | null) => <>The agent can read, edit and run commands in {named(folder, "your folder")}, with your approval.</>,
    starters: [
      { icon: FolderOpen, label: "Tidy up a folder", prompt: "Organize the files in " },
      { icon: FileText, label: "Summarize documents", prompt: "Read and summarize the documents in " },
      { icon: Table2, label: "Clean up data", prompt: "Clean up and reformat the data in " },
      { icon: ListChecks, label: "Plan a project", prompt: "Break this project into steps and work through them: " },
    ],
  },
  code: {
    title: "What are we building?",
    body: (folder: string | null) => (
      <>A coding agent for {named(folder, "your repository")}: it reads, edits and runs commands, and shows you every diff.</>
    ),
    starters: [
      { icon: Bug, label: "Fix a bug", prompt: "Find and fix the bug where " },
      { icon: FlaskConical, label: "Write tests", prompt: "Write tests for " },
      { icon: BookOpenText, label: "Explain this codebase", prompt: "Give me a tour of this codebase: the main modules and how they fit together." },
      { icon: WandSparkles, label: "Refactor a module", prompt: "Refactor " },
    ],
  },
} as const;

/** New-session screen: equal spacers above and below keep the composer vertically centered. */
export function Home() {
  const kind = useStore(kindOf);
  const folder = useStore(homeFolder);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const copy = HOME_COPY[kind];
  const [seed, setSeed] = useState<ComposerSeed | null>(null);
  // The hero and starters animate in with the screen. Changing section, or a folder turning the
  // chat into work, just swaps their content: replaying the entrance would blink them out and in.
  const [shownFor, setShownFor] = useState(kind);
  const [entering, setEntering] = useState(true);
  if (shownFor !== kind) {
    setShownFor(kind);
    setEntering(false);
  }

  return (
    <div className={cx("home", entering && "entering")}>
      <div className="home-top">
        <div className="home-hero">
          {project && (
            <button className="home-project" onClick={() => useStore.getState().openProjectDialog(project.id)}>
              <Folder size={13} />
              {project.name}
            </button>
          )}
          <h1>{copy.title}</h1>
          <p>{copy.body(folder)}</p>
        </div>
      </div>
      <Composer variant="home" seed={seed} />
      {/* Lives in the bottom spacer so the composer itself stays exactly centered. */}
      <div className="home-bottom">
        <div className="starters">
          {copy.starters.map((s, i) => (
            <button
              key={s.label}
              className="starter"
              style={{ "--i": i } as CSSProperties}
              onClick={() => setSeed({ text: s.prompt, n: Date.now() })}
            >
              <s.icon size={14} />
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Thread() {
  const session = useActiveSession();
  const running = useStore((s) => (s.activeId ? !!s.runs[s.activeId] : false));
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  /** Until when (performance.now) growth of the content should keep the view pinned to the bottom. */
  const followUntil = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const jump = usePresence(showJump, 160);

  // Follow the stream while the user is at the bottom; stop following if they scroll up.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [session?.messages]);

  useLayoutEffect(() => {
    stick.current = true;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session?.id]);

  // Content also grows between events (tool cards and diffs animate open), so stay
  // pinned through that too, but only during a run: expanding a card by hand while
  // idle must not yank the view.
  useEffect(() => {
    followUntil.current = running ? Infinity : performance.now() + 500;
  }, [running]);
  useEffect(() => {
    const el = ref.current;
    const content = inner.current;
    if (!el || !content) return;
    const ro = new ResizeObserver((entries) => {
      if (!stick.current) return;
      // The viewport itself shrinking (terminal opened, composer grew) always keeps the bottom in view.
      const viewportResized = entries.some((e) => e.target === el);
      if (viewportResized || performance.now() < followUntil.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    ro.observe(el);
    return () => ro.disconnect();
  }, [session?.id]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = atBottom;
    setShowJump(!atBottom);
  };

  if (!session) return null;

  return (
    <div className="thread-wrap">
      <div className="thread" ref={ref} onScroll={onScroll}>
        <div className="thread-inner" ref={inner}>
          {session.messages.map((m, i) => (
            <MessageView key={m.id} message={m} isLast={i === session.messages.length - 1} />
          ))}
        </div>
      </div>
      {jump.mounted && (
        <button
          className={cx("jump", jump.closing && "closing", running && "live")}
          aria-label="Scroll to bottom"
          tabIndex={jump.closing ? -1 : 0}
          onClick={() => ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })}
        >
          <ArrowDown size={15} />
        </button>
      )}
    </div>
  );
}
