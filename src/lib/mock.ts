// Browser-only fallback for the Rust agent (see src-tauri/src/mock.rs).
// Lets you iterate on the UI with `pnpm dev` in a normal browser.

import type { AgentEvent, ModelInfo, RunRequest, ToolKind, FileDiff } from "./types";

export const MODELS: ModelInfo[] = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", provider: "Anthropic", contextWindow: 200_000, description: "Most capable, for complex agentic work" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "Anthropic", contextWindow: 200_000, description: "Fast and smart for everyday coding" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", provider: "Anthropic", contextWindow: 200_000, description: "Fastest, for quick edits and questions" },
  { id: "gpt-5", name: "GPT-5", provider: "OpenAI", contextWindow: 400_000, description: "OpenAI flagship reasoning model" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", contextWindow: 1_000_000, description: "Long context, multimodal" },
  { id: "local/qwen-coder", name: "Qwen Coder (local)", provider: "Ollama", contextWindow: 32_000, description: "Runs on this machine, offline" },
];

type Step =
  | { think: string }
  | { say: string }
  | { tool: { name: string; kind: ToolKind; input: string; output: string; diff?: FileDiff; permission?: string; ms: number } };

const runs = new Map<string, { cancelled: boolean }>();
const permissions = new Map<string, (allow: boolean) => void>();

class Cancelled extends Error {}

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

function script(req: RunRequest): Step[] {
  const model = MODELS.find((m) => m.id === req.model)?.name ?? req.model;
  const topic = req.prompt.trim().replace(/\s+/g, " ").slice(0, 80);
  // Where the agent works, by name, and a nod to the project's instructions if it has any.
  const name = req.folder?.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  const place = name ? `\`${name}\`` : "the codebase";
  const heed =
    (req.instructions?.trim() ? ` The project's instructions apply: "${req.instructions.trim().replace(/\s+/g, " ").slice(0, 80)}".` : "") +
    (req.attachments?.length ? ` Attached: ${req.attachments.map((a) => a.name).join(", ")}.` : "");
  const grep: Step = {
    tool: {
      name: "Grep", kind: "search", input: `"normalizeTitle" in src/`, ms: 300,
      output: "src/lib/session.ts:15:export function normalizeTitle(prompt: string): string {\nsrc/lib/session.ts:22:    title: normalizeTitle(prompt),",
    },
  };
  const read: Step = {
    tool: {
      name: "Read", kind: "read", input: "src/lib/session.ts", ms: 250,
      output: " 13  const MAX_TITLE = 48;\n 14\n 15  export function normalizeTitle(prompt: string): string {\n 16    return prompt.slice(0, MAX_TITLE);\n 17  }",
    },
  };
  if (req.mode === "chat") {
    return [
      { think: `The user asked: "${topic}". Conversational request — no tools needed.${heed}` },
      { say: `Here's a response from **${model}** (browser mock).\n\nYou asked about: _${topic}_\n\n- Streaming text\n- Markdown & tables\n- Add a folder for tool calls\n\n\`\`\`ts\nconst run = await startRun(request, onEvent);\n\`\`\`` },
    ];
  }
  if (req.mode === "plan") {
    return [
      { think: `Plan mode, read-only. Task: "${topic}".${heed}` },
      { say: `Exploring ${place} read-only first.\n\n` },
      grep,
      read,
      { say: "### Plan\n\n1. Normalize whitespace in `normalizeTitle`\n2. Add an empty-title fallback\n3. Add tests and run them\n\n> Nothing changed. Switch to **Agent** mode to execute." },
    ];
  }
  return [
    { think: `Task: "${topic}". I'll locate the title helper first.${heed}` },
    { say: `I'll start by exploring ${place}.\n\n` },
    grep,
    read,
    { think: "normalizeTitle slices the raw prompt without trimming. Fix: collapse whitespace, trim, truncate safely." },
    { say: "Found the cause. Applying a fix.\n\n" },
    {
      tool: {
        name: "Edit", kind: "edit", input: "src/lib/session.ts", ms: 500, permission: "Edit src/lib/session.ts (+3 −1)",
        output: "Applied 1 edit to src/lib/session.ts",
        diff: {
          path: "src/lib/session.ts", additions: 3, deletions: 1,
          patch: "@@ -15,3 +15,5 @@\n export function normalizeTitle(prompt: string): string {\n-  return prompt.slice(0, MAX_TITLE);\n+  const clean = prompt.replace(/\\s+/g, \" \").trim();\n+  if (!clean) return \"Untitled session\";\n+  return Array.from(clean).slice(0, MAX_TITLE).join(\"\");\n }\n",
        },
      },
    },
    { say: "Running the tests.\n\n" },
    {
      tool: {
        name: "Bash", kind: "bash", input: "pnpm test --run session", ms: 1200, permission: "Run shell command",
        output: " ✓ src/lib/session.test.ts (4 tests) 3ms\n\n Tests  4 passed (4)",
      },
    },
    { say: `### Summary\n\n- Fixed whitespace handling in \`normalizeTitle\`\n- 4/4 tests passing\n\n_Ran with ${model} via the browser mock._` },
  ];
}

const DENIED = "\n\nUnderstood — I've stopped and left your files untouched.";

export async function startRun(req: RunRequest, emit: (e: AgentEvent) => void): Promise<string> {
  const runId = uid("run");
  const state = { cancelled: false };
  runs.set(runId, state);
  let out = 0;

  const sleep = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (state.cancelled) throw new Cancelled();
      await new Promise((r) => setTimeout(r, Math.min(50, end - Date.now())));
    }
    if (state.cancelled) throw new Cancelled();
  };
  const stream = async (text: string, thinking: boolean) => {
    const words = text.split(/(?<= )/);
    for (let i = 0; i < words.length; ) {
      const n = 1 + Math.floor(Math.random() * 3);
      const delta = words.slice(i, i + n).join("");
      i += n;
      out += delta.length;
      emit(thinking ? { type: "thinking", delta } : { type: "text", delta });
      await sleep((thinking ? 14 : 22) + Math.random() * 26);
    }
  };

  (async () => {
    try {
      await sleep(350);
      for (const step of script(req)) {
        if ("think" in step) await stream(step.think, true);
        else if ("say" in step) await stream(step.say, false);
        else {
          const t = step.tool;
          const id = uid("tool");
          emit({ type: "toolStart", id, name: t.name, kind: t.kind, input: t.input });
          await sleep(220);
          if (t.permission) {
            const pid = uid("perm");
            const answer = new Promise<boolean>((resolve) => permissions.set(pid, resolve));
            emit({ type: "permissionRequest", id: pid, toolId: id, reason: t.permission });
            const allowed = await Promise.race([
              answer,
              (async () => { while (!state.cancelled) await new Promise((r) => setTimeout(r, 100)); permissions.delete(pid); throw new Cancelled(); })(),
            ]);
            if (!allowed) {
              emit({ type: "toolEnd", id, status: "denied", output: "Permission denied by user.", diff: null });
              await stream(DENIED, false);
              break;
            }
          }
          const total = t.ms + Math.random() * 400;
          if (t.kind === "bash" && t.output) {
            // A command's output arrives as it runs, line by line.
            const lines = t.output.split(/(?<=\n)/);
            for (const line of lines) {
              await sleep(total / (lines.length + 1));
              emit({ type: "toolOutput", id, delta: line });
            }
            await sleep(total / (lines.length + 1));
          } else {
            await sleep(total);
          }
          emit({ type: "toolEnd", id, status: "ok", output: t.output, diff: t.diff ?? null });
        }
        await sleep(140);
      }
      emit({ type: "done", stopReason: "endTurn", usage: { inputTokens: 1850 + Math.round(req.prompt.length / 4), outputTokens: Math.round(out / 4) } });
    } catch (e) {
      if (e instanceof Cancelled) {
        emit({ type: "done", stopReason: "cancelled", usage: { inputTokens: 1850, outputTokens: Math.round(out / 4) } });
      } else {
        emit({ type: "error", message: String(e) });
      }
    } finally {
      runs.delete(runId);
    }
  })();

  return runId;
}

export async function cancelRun(runId: string) {
  const r = runs.get(runId);
  if (r) r.cancelled = true;
}

export async function respondPermission(id: string, allow: boolean) {
  const resolve = permissions.get(id);
  if (!resolve) throw new Error(`permission request ${id} is unknown or expired`);
  permissions.delete(id);
  resolve(allow);
}
