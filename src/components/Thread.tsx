import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  BookOpenText,
  Bug,
  CodeXml,
  FileText,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  Lightbulb,
  ListChecks,
  MessageCircle,
  PenLine,
  Scale,
  Sparkles,
  Table2,
  WandSparkles,
} from "lucide-react";
import { useActiveSession, useStore } from "../lib/store";
import { cx, usePresence } from "../lib/util";
import { MessageView } from "./MessageView";
import { Composer, type ComposerSeed } from "./Composer";
import { SectionSwitch } from "./SectionSwitch";

/** Starter prompts. Ones ending in a space are openers the user finishes; the rest are ready to send. */
const HOME_COPY = {
  chat: {
    icon: MessageCircle,
    title: "How can I help you today?",
    body: "Chat with any model: answers only, no tools or file access.",
    starters: [
      { icon: Lightbulb, label: "Brainstorm ideas", prompt: "Help me brainstorm ideas for " },
      { icon: GraduationCap, label: "Explain a concept", prompt: "Explain, step by step, how " },
      { icon: PenLine, label: "Draft a message", prompt: "Draft a short, friendly message to " },
      { icon: Scale, label: "Compare options", prompt: "Compare the trade-offs between " },
    ],
  },
  work: {
    icon: Sparkles,
    title: "What should we work on?",
    body: "The agent can read, edit and run commands in your workspace, with your approval.",
    starters: [
      { icon: FolderOpen, label: "Tidy up a folder", prompt: "Organize the files in " },
      { icon: FileText, label: "Summarize documents", prompt: "Read and summarize the documents in " },
      { icon: Table2, label: "Clean up data", prompt: "Clean up and reformat the data in " },
      { icon: ListChecks, label: "Plan a project", prompt: "Break this project into steps and work through them: " },
    ],
  },
  code: {
    icon: CodeXml,
    title: "What are we building?",
    body: "A coding agent for your repository: it reads, edits and runs commands, and shows you every diff.",
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
  const section = useStore((s) => s.section);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const copy = HOME_COPY[section];
  const [seed, setSeed] = useState<ComposerSeed | null>(null);
  // The hero and starters animate in with the screen. Changing section afterwards just swaps
  // their content: replaying the entrance would make them blink out and back in.
  const [shownFor, setShownFor] = useState(section);
  const [entering, setEntering] = useState(true);
  if (shownFor !== section) {
    setShownFor(section);
    setEntering(false);
  }

  return (
    <div className={cx("home", entering && "entering")}>
      <div className="home-top">
        <div className="home-hero">
          <div className="empty-mark">
            <copy.icon size={22} />
          </div>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
        </div>
      </div>
      <Composer variant="home" seed={seed} />
      {/* Lives in the bottom spacer so the composer itself stays exactly centered. */}
      <div className="home-bottom">
        {/* The switch lives in the sidebar; it only moves here while the sidebar is hidden. */}
        {!sidebarOpen && <SectionSwitch />}
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
