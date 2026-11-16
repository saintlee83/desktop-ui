# Agent Desktop

A desktop UI for AI coding agents (in the spirit of Claude, Codex, Gemini, Amp), built with **Tauri 2 (Rust)** and **React + TypeScript**.

## Features

- **Two sections**, switched with the Chat / Code control in the title bar, left of the new-session button (or `⌘1` / `⌘2`), each with its own session list:
  - **Chat**: the default. Plain conversation with any model, no tools, until it has a folder
  - **Code**: coding sessions in a repository, always agentic
  - The list lives in `src/lib/sections.ts`
- **A folder turns a chat into work**: choose one from the composer (`⌘O`), drop one on it, or pick a recent one. From then on the agent works in that folder: the mode menu, the terminal and the Changes/Commands/Context panel appear, and the folder's git branch shows next to its name. Remove the folder and it is a plain chat again
- **Projects** (sidebar): a named place for related sessions, with an optional folder and standing instructions that are sent with every message. Choosing a project narrows the sidebar to it; new sessions start in it, in its folder. Move a session with the row's `⋯` menu or a right-click; edit a project with a double-click or `F2`; deleting one keeps its sessions (with **Undo**)
- **Mode menu** in the composer, next to the model menu: **Agent** (reads, edits and runs commands) or **Plan** (read-only, proposes a plan); `⇧⌘M` flips between them. A chat gets it once it has a folder; Code always has it, with a third entry, **Terminal**
- **Terminal mode** (Code only, `⇧⌘T`): the chat gives way to a full-window terminal showing **the same session as a CLI**. The conversation so far is written out the way a command-line agent prints it (prompts, replies, tool calls with their output and diffs), and it stays live while the agent works. What you type there goes to the same session, so you can switch back and forth with `⇧⌘T` and carry on in either view. In the terminal: `↵` sends, `⌥↵` (or a trailing `\`) starts a new line, `↑`/`↓` recall earlier prompts, `⇧⇥` switches Agent/Plan, `y`/`n` answer a permission prompt, `esc` stops the agent, `⌘N` starts a new session in place. Moving to another session keeps the view
  - The CLI menu in its top bar can instead run another command-line agent (Claude Code, Codex, Gemini CLI, Amp) or a plain shell, in a session of its own. The app opens your login shell in the session's folder (your home directory when there is none; the folder menu in its top bar changes it) and types the CLI's command into it, so the CLI has to be installed and on your `PATH`. Switching back to the chat keeps it running. The list lives in `src/lib/clis.ts`
- **Multiple windows** (`⇧⌘N`): each window has its own layout, section, project and open session; sessions, projects, settings and the profile are shared and update live. A session that is running in one window is read-only in the others until it finishes
- **Centered composer** on a new session, with starter prompts beneath it; it docks to the bottom after the first message. Press `↑` in an empty composer to bring back your last prompt
  - **Attachments**: drop, paste or choose files. Files on disk go by path; pasted ones carry their content (text, or an image with a preview)
  - **`@` mentions** a file of the session's folder (fuzzy-matched); **`/`** runs a command (`/plan`, `/agent`, `/new`, `/folder`, `/terminal`, `/model …`, `/help`) or inserts a **snippet** (saved in Settings › Snippets)
  - **Queue**: a message sent while the agent runs waits and goes when it finishes (shown above the box, with a way to drop it)
  - **Send key**: `↵` (default) or `⌘↵`, in Settings
- **Per-session model and mode**: each session keeps the model and Agent/Plan mode it runs with; the ones chosen on the new-session screen (or in Settings) are the defaults for new sessions
- **Message actions**: edit a prompt and send it again (what came after it is replaced), branch a session from any message, retry the last reply (also with another model), and **Run this plan** under a finished plan. Times show beside each message
- **Sessions sidebar**: grouped by date, searchable by title and message text (with an excerpt where it matched), live "running" indicator, a dot on replies that finished while you weren't looking, and a folder mark on chats that have one. Rename with a double-click or `F2`; **pin** to the top; **archive** (folded away at the bottom); delete with the hover button or `⌘⌫`, with **Undo** in a toast. `⌘`-click or `⇧`-click picks several to archive or delete at once. Arrow keys move through the list
- **Resizable columns**: drag the edge of the sidebar or side panel; double-click the edge to reset
- **Account menu** (bottom-left of the sidebar): profile, settings, shortcuts, theme switch, log out. The profile is local until a real identity provider is wired in (`Account` in `src/lib/store.ts`)
- **Streaming thread**: markdown, GFM tables, syntax-highlighted code with copy, collapsible "thinking"
- **Tool cards**: search, read, edit (inline diff), and bash, with running/ok/error/denied states. A command's output streams in as it runs; a file can be opened in your editor from its card
- **Permission prompts**: Allow (`⌘↵`) / Deny (`⌘⌫`) for edits and shell commands, or **Always allow** it for the rest of the session (all edits, or that exact command). In settings, choose *Ask*, *Auto-accept edits*, or *Full auto*; a project can override it
- **Model picker**: Anthropic, OpenAI, Google, and local models
- **Integrated terminal** (chats with a folder, and Code; ``Ctrl+` ``): real login-shell sessions in a PTY, opened in the session's folder and rendered with xterm.js. Each session has its own tabs (``Ctrl+Shift+` `` for another; double-click one to rename it), resizable drawer, follows the app's theme, color scheme and text size. Find with `⌘F`, open links with `⌘`-click. Shells keep running while the drawer is hidden or another session is open
- **Side panel** (`⌘J`): aggregated **Changes** (diffs; per file: open in editor, reveal in Finder, copy the diff, **revert** or reapply), **Commands** (the agent's command output, live), **Context** (token usage, files)
- **Attention**: a system notification when a run finishes or needs approval while the app is in the background, a dock badge for sessions waiting or unread, a menu bar icon that shows how many agents are running or waiting (with **New Chat**), and an optional global shortcut that brings the app up into a new chat
- **Data** (Settings): how much storage the sessions take, a JSON backup of everything and importing one back, deleting all sessions (with Undo), and exporting one session as Markdown (its `⋯` menu or the palette)
- **Korean and English**: the interface follows the system language, or the one picked in Settings
- **Command palette** (`⌘K`), **Settings** (`⌘,`), light/dark/system theme (`⇧⌘L`), macOS overlay title bar
- **Color schemes** (in Settings, or from the palette): Ink, Graphite, Mono, Sand, Sage and Slate, each with a light and a dark side
- **Keyboard shortcuts** for the rest (`⌘/` lists them all): search sessions `⌘F`, previous/next session `⇧⌘[` / `⇧⌘]`, delete the open session `⇧⌘⌫`, focus the message box `⌘L`, copy the last response `⇧⌘C`. On Windows and Linux, `⌘` is `Ctrl`
- **Tooltips with shortcuts** on every icon button, and motion that respects *Reduce motion*
- Sessions and settings persist locally (saved in batches while a reply streams, and at once when the window hides or closes; a full storage is reported instead of breaking the run). API keys are kept in the OS keychain, not with the settings

### Look

Ink on paper: neutrals with no accent hue. Filled controls are ink (near-black in the light theme, bone in the dark one); the only colors are muted status tones and the code palette. The window is chrome (title bar and sidebar) with the conversation and side panel as rounded sheets laid on it, and large headings use a serif (New York on macOS).

A color scheme changes the temperature of those neutrals, not the idea: **Ink** is warm paper, **Graphite** even gray, **Mono** pure black and white, **Sand** parchment, **Sage** gray with a green cast, **Slate** gray with a blue cast. The theme and scheme are the `data-theme` and `data-scheme` attributes on `<html>`. Each scheme is two short blocks (light and dark) at the top of `src/styles.css` that set the surfaces, the text colors and `--ink`; borders, hovers and shadows are derived from `--ink`. Adding a scheme means writing those two blocks and listing it in `src/lib/theme.ts`.

The terminal's ANSI palette is in `src/components/TerminalView.tsx`, and the app icon is `app-icon.svg` (regenerate `src-tauri/icons` with `pnpm tauri icon app-icon.svg`).

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
  folders.rs    folder_info: whether a path is a folder, and its git branch
  agent.rs      commands: list_models, run_agent, cancel_agent, respond_permission
                streams AgentEvents to the UI over a tauri::ipc::Channel
  mock.rs       scripted provider so the UI works without API keys
  pty.rs        interactive terminals: pty_spawn / pty_write / pty_resize / pty_kill
  workspace.rs  a folder's files (for @ mentions), opening one in an editor, applying a
                change's diff backwards or forwards (revert / reapply), writing exports
  secrets.rs    provider API keys in the OS keychain (stored and removed from the UI,
                read only on the Rust side)
  tray.rs       the menu bar icon and its menu
src/
  lib/types.ts  mirror of protocol.rs
  lib/sections.ts  the Chat / Code sections (label, icon, shortcut)
  lib/theme.ts  color schemes, and applying the theme and scheme to the page
  lib/folders.ts  choosing a folder (native dialog, or the browser's) and reading its info
  lib/agent.ts  IPC client (falls back to lib/mock.ts outside Tauri)
  lib/pty.ts    terminal client (mock shell in a plain browser)
  lib/clis.ts   what terminal mode runs: the session itself, or another CLI
  lib/console.ts  a session written out as terminal output (used by SessionConsole)
  lib/store.ts  Zustand store + applyEvent reducer (event stream → message parts);
                also keeps windows in step through localStorage `storage` events
  lib/actions.ts  commands shared by shortcuts, the palette and buttons
  lib/windows.ts  opening a window, and cleaning up when one closes
  lib/toast.ts  transient notifications (`toast("Deleted", { label: "Undo", run })`)
  lib/native.ts  what the app asks of the OS (links, files, keychain, notifications,
                badge, menu bar, global shortcut), with stand-ins for the browser preview
  lib/attention.ts  dock badge, menu bar status, the global shortcut, marking replies seen
  lib/attach.ts  turning dropped, pasted and chosen files into attachments
  lib/suggest.ts  @ and / completions in the composer
  lib/data.ts   Markdown export, JSON backup and import, storage used
  lib/i18n.ts, lib/i18n/  `t()` / `useT()` and the Korean dictionary (by English text)
  components/   TitleBar, Sidebar, SectionSwitch, Thread, MessageView, ToolCard,
                DiffView, Composer, ModePicker, FolderPicker, RightPanel,
                CommandPalette, SettingsDialog, ProjectDialog
  components/TerminalView.tsx  one xterm.js terminal on a PTY, used by
                TerminalDrawer (the drawer) and CliView (terminal mode)
  components/SessionConsole.tsx  terminal mode's default: the open session as a
                CLI, in xterm.js with no shell behind it
  components/Picker.tsx  the pill + menu behind the model, mode, folder and CLI menus
  components/ContextMenu.tsx  the menu at the pointer (right-click, or a row's ⋯ button)
  components/ui.tsx  shared pieces: IconButton, Keys, Segmented (sliding thumb),
                Collapse (animated height), CopyButton, ColResizer
  components/Tooltip.tsx, Toaster.tsx  the single tooltip and toast layers
```

A run streams events like this:
`run_agent` → `thinking`/`text` deltas → `toolStart` → (`permissionRequest` → `respond_permission`) → `toolEnd` → … → `done`.

### Plugging in a real provider

Replace `mock::script` in `agent.rs` with code that calls a provider API and
maps its stream chunks to `AgentEvent`s. The UI depends only on the event
protocol, so it needs no changes. A `RunRequest` carries the session's `folder`
(none for a plain chat, which runs in `chat` mode without tools) and the
project's `instructions`; the mock only mentions them in its replies.
