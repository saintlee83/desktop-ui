# Agent Desktop

A desktop UI for AI coding agents (in the spirit of Claude, Codex, Gemini, Amp), built with **Tauri 2 (Rust)** and **React + TypeScript**.

## Features

- **Three sections**, switched with the Chat / Work / Code control at the top of the sidebar (or `⌘1` / `⌘2` / `⌘3`), each with its own session list. With the sidebar hidden, the same control sits under the chat box on the home screen:
  - **Chat**: plain conversation with any model, no tools
  - **Work**: agent tasks in a workspace
  - **Code**: coding sessions in a repository
  - Work and Code are the agent sections: both have the mode menu, the terminal and the Changes/Commands/Context panel. The list lives in `src/lib/sections.ts`
- **Mode menu** in the composer, next to the model menu: **Agent** (reads, edits and runs commands) or **Plan** (read-only, proposes a plan); `⇧⌘M` flips between them. In Code it has a third entry, **Terminal**
- **Terminal mode** (Code only, `⇧⌘T`): the chat gives way to a full-window terminal running a command-line agent (Claude Code, Codex, Gemini CLI, Amp, or a plain shell), picked from a menu in its top bar. The app opens your login shell in your home directory and types the CLI's command into it, so the CLI has to be installed and on your `PATH`. Switching back to the chat keeps the terminal running. The list lives in `src/lib/clis.ts`
- **Multiple windows** (`⇧⌘N`): each window has its own layout, section and open session; sessions, settings and the profile are shared and update live. A session that is running in one window is read-only in the others until it finishes
- **Centered composer** on a new session, with starter prompts beneath it; it docks to the bottom after the first message. Drop or paste files to attach them, and press `↑` in an empty composer to bring back your last prompt
- **Sessions sidebar**: grouped by date, searchable (matches are highlighted), live "running" indicator. Rename with a double-click or `F2`; delete with the hover button or `⌘⌫`, with **Undo** in a toast. Arrow keys move through the list
- **Resizable columns**: drag the edge of the sidebar or side panel; double-click the edge to reset
- **Account menu** (bottom-left of the sidebar): profile, settings, shortcuts, theme switch, log out. The profile is local until a real identity provider is wired in (`Account` in `src/lib/store.ts`)
- **Streaming thread**: markdown, GFM tables, syntax-highlighted code with copy, collapsible "thinking"
- **Tool cards**: search, read, edit (inline diff), and bash, with running/ok/error/denied states
- **Permission prompts**: Allow (`⌘↵`) / Deny (`⌘⌫`) for edits and shell commands. In settings, choose *Ask*, *Auto-accept edits*, or *Full auto*
- **Model picker**: Anthropic, OpenAI, Google, and local models
- **Integrated terminal** (Work and Code, ``Ctrl+` ``): real login-shell sessions in a PTY, rendered with xterm.js. Multiple tabs (``Ctrl+Shift+` ``), resizable drawer, follows the app theme. Shells keep running while the drawer is hidden
- **Side panel** (`⌘J`): aggregated **Changes** (diffs), **Commands** (the agent's command output), **Context** (token usage, files)
- **Command palette** (`⌘K`), **Settings** (`⌘,`), light/dark/system theme (`⇧⌘L`), macOS overlay title bar
- **Keyboard shortcuts** for the rest (`⌘/` lists them all): search sessions `⌘F`, previous/next session `⇧⌘[` / `⇧⌘]`, delete the open session `⇧⌘⌫`, focus the message box `⌘L`, copy the last response `⇧⌘C`. On Windows and Linux, `⌘` is `Ctrl`
- **Tooltips with shortcuts** on every icon button, and motion that respects *Reduce motion*
- Sessions and settings persist locally

## Running

```bash
pnpm install
pnpm tauri dev      # native app (Rust backend)
pnpm dev            # browser only, uses an in-page mock agent at http://localhost:1420
pnpm tauri build    # release bundle
```

Requires Node 20+, pnpm, and a Rust toolchain.

## Architecture

```
src-tauri/src/
  protocol.rs   wire types (AgentEvent, RunRequest, ModelInfo), with serde tests
  lib.rs        app setup and the new_window command
  agent.rs      commands: list_models, run_agent, cancel_agent, respond_permission
                streams AgentEvents to the UI over a tauri::ipc::Channel
  mock.rs       scripted provider so the UI works without API keys
  pty.rs        interactive terminals: pty_spawn / pty_write / pty_resize / pty_kill
src/
  lib/types.ts  mirror of protocol.rs
  lib/sections.ts  the Chat / Work / Code sections (label, icon, shortcut)
  lib/agent.ts  IPC client (falls back to lib/mock.ts outside Tauri)
  lib/pty.ts    terminal client (mock shell in a plain browser)
  lib/clis.ts   the command-line agents terminal mode can run
  lib/store.ts  Zustand store + applyEvent reducer (event stream → message parts);
                also keeps windows in step through localStorage `storage` events
  lib/actions.ts  commands shared by shortcuts, the palette and buttons
  lib/windows.ts  opening a window, and cleaning up when one closes
  lib/toast.ts  transient notifications (`toast("Deleted", { label: "Undo", run })`)
  components/   TitleBar, Sidebar, SectionSwitch, Thread, MessageView, ToolCard,
                DiffView, Composer, ModePicker, RightPanel, CommandPalette,
                SettingsDialog
  components/TerminalView.tsx  one xterm.js terminal on a PTY, used by
                TerminalDrawer (the drawer) and CliView (terminal mode)
  components/Picker.tsx  the pill + menu behind the model, mode and CLI menus
  components/ui.tsx  shared pieces: IconButton, Keys, Segmented (sliding thumb),
                Collapse (animated height), CopyButton, ColResizer
  components/Tooltip.tsx, Toaster.tsx  the single tooltip and toast layers
```

A run streams events like this:
`run_agent` → `thinking`/`text` deltas → `toolStart` → (`permissionRequest` → `respond_permission`) → `toolEnd` → … → `done`.

### Plugging in a real provider

Replace `mock::script` in `agent.rs` with code that calls a provider API and
maps its stream chunks to `AgentEvent`s. The UI depends only on the event
protocol, so it needs no changes.
