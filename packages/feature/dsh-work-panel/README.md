# @neplich/dsh-work-panel

[中文版](README.zh-CN.md) · English

Web GUI plugin: a right-side **work panel** for the dsh browser GUI, modeled on the Codex Desktop right rail. One toggle after Session log in the session header (or the global `Option+J` / `Alt+J` shortcut) opens a docked panel with two tools:

- **Files** — a split workspace with the file preview on the left and a lazy-loaded, filterable directory tree on the right. The folder button hides or restores the tree so the preview can fill the tab. Markdown switches between rendered preview and a plain file-source surface; all other text uses the same source surface without conversation-style language banners, copy bars, cards, or bubbles. Common image formats display inline. PDFs use the complete PDF.js viewing stack with navigation, zoom, search, selectable text, forms, and download. Modern Office files (`.docx`, `.xlsx`, `.pptx`) render directly in the browser through the OOXML WASM/Canvas viewer, including document/slide navigation, worksheet tabs, zoom, and fit-to-width. Both viewers load only when their file type opens. Every file work tab remembers its own tree visibility, filter, expanded directories, open file, and preview mode.
- **Terminal** — an interactive PTY (xterm.js) spawned in the session's working directory through the harness's subprocess seam. Every terminal work tab owns an independent process and scrollback buffer. An exited terminal offers one-click restart.

The tab strip belongs to the whole work panel, not to either tool. File and terminal tabs can be mixed, selected with the mouse or arrow keys, and closed independently. It occupies the panel's single top bar alongside the new-tab and panel controls, without a redundant tool-title row. The `+` button opens the two-item chooser without removing existing tabs. Switching tabs, closing and reopening the panel, or switching sessions preserves every file view and terminal process; a reattached terminal view replays its retained buffer.

The panel occupies the shell's dedicated right workbench column, so opening it narrows the conversation instead of covering it. Switching tools does not change the column width. Width drags from the left edge (or arrow keys on the focused handle), with an expand/restore button in the panel header. Below the shell's own auto-collapse breakpoint the panel closes itself instead of squeezing the conversation. The panel and the shell's tool-details column share the right edge by mutual exclusion: opening one closes the other, so the shipped tool details stay fully accessible.

All copy follows the dsh interface language (中文/English), all colors come from the `--dsw-*` theme tokens (dark and light both supported), transitions stay within 150–300ms and honor `prefers-reduced-motion`, and every icon button carries a tooltip, an `aria-label`, and a visible focus ring.

## How it works

The host half registers six same-origin HTTP routes plus one WebSocket route on the Web GUI server (`ctx.webServer`):

| Route | Purpose |
|---|---|
| `GET /work-panel/list?session=<id>&path=<rel>` | One directory's children (dirs first), capped, confined to the session cwd |
| `GET /work-panel/read?session=<id>&path=<rel>` | One text file's content, size-bounded, binary-refused |
| `GET /work-panel/raw?session=<id>&path=<rel>` | One allowlisted image, PDF, or modern Office file for inline preview, size-bounded |
| `GET /work-panel/pdfjs/*` | Allowlisted PDF.js runtime, worker, viewer, font, color-map, WASM, and image resources |
| `GET /work-panel/ooxml/*` | Allowlisted OOXML viewer modules and parser WASM resources |
| `POST /work-panel/terminal/close?session=<id>&terminal=<id>` | Close one terminal tab's PTY |
| `WS /work-panel/terminal?session=<id>&terminal=<id>&cols=<n>&rows=<n>` | One terminal tab's interactive PTY stream |

The session's cwd resolves from its live Agent first, then the in-memory session header (blank sessions have no Agent yet but already carry a workspace). Paths are confined lexically and through realpath, and every route rejects cross-origin browser requests (Origin/Host fence).

The terminal pool keys PTYs by GUI session and terminal-tab id (`ctx.subprocess.spawnTerminal`). Sockets attach and detach freely; each PTY has a ring buffer (`terminalScrollbackBytes`) for replay. Closing a tab terminates only its PTY; disposing a session terminates all of that session's PTYs; plugin unload terminates the complete pool.

The client half registers into two slots: the panel surface into `shell.workbench` and the toggle button into `conversation.session.header.utilities`, after Session log. Panel state (open flag, width, per-session mixed tab strip, and per-file-tab browser state) lives in one root-scoped slot store.

## Config

| Key | Type | Default | Purpose |
|---|---|---|---|
| `maxListEntries` | natural | `2000` | Maximum rows one directory listing answers |
| `maxFileBytes` | natural | `262144` | Maximum file size one text read answers |
| `maxImageBytes` | natural | `10485760` | Maximum image, PDF, or modern Office file size the raw route serves (legacy key retained for compatibility) |
| `terminalScrollbackBytes` | natural | `524288` | Retained terminal output per terminal tab (replay source) |
| `terminalGraceMs` | natural | `4000` | PTY TERM-to-KILL cleanup grace |
| `shell` | string | `''` | Terminal shell executable; empty reads `$SHELL`, then `/bin/bash` |

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-work-panel   # or a local path: ./packages/feature/dsh-work-panel
dsh web --profile <name>
```

Then open any session and click the panel button in the session header, or press `Option+J` (macOS) / `Alt+J`.

## Uninstall

```sh
dsh plugin --profile <name> remove @neplich/dsh-work-panel
```

The plugin writes no files and no settings: removing the package row is the complete cleanup. Live PTYs are terminated when the plugin unloads.

## Develop

Built with the multi-plugin workspace at the repository root: `pnpm run build` emits `lib/` (tsc), `pnpm --filter @neplich/dsh-work-panel run bundle` emits the browser bundle `lib/client.js` (tsdown; react and the platform client libraries resolve through the GUI's module table, xterm inlines), `pnpm run test` runs the package-level vitest suites. PDF.js and the OOXML JS/WASM assets stay outside the initial client bundle and load from the plugin's same-origin routes only when their file types open.

## Model Experience

None: no tools, no prompt sections, no session events. The panel is human-facing UI; terminal I/O and file previews never enter the model's context.

## Known Limitations and Deferred Work

- **No PTY resize.** The subprocess seam fixes terminal rows/cols at spawn; the xterm surface fits the panel, but the shell's own wrap width stays at the spawn geometry until the terminal is restarted (restart adopts the current fit). Full-screen curses apps (vim, htop) should be started after the panel reaches its working width. A seam-level resize would need a harness contribution.
- **Replay fidelity.** Closing the panel disposes the browser-side xterm; reopening replays the retained host buffer (capped by `terminalScrollbackBytes`). Output older than the cap is gone, so a long-running full-screen app's redrawn screen can differ cosmetically after replay; the process itself is unaffected.
- **Tab metadata is browser-memory state.** Tab switches, panel close/reopen, and session switches preserve mixed file/terminal tabs and PTYs. A full browser-page reload recreates the visible tab strip; host PTYs are still cleaned up when the dsh session closes or the plugin unloads.
- **PDF editing is not persisted.** PDF.js renders annotations and interactive forms, but the work panel does not write modified PDFs back to the workspace. The download action returns the original file.
- **Office preview is read-only and best-effort.** `.docx`, `.xlsx`, and `.pptx` are rendered locally without LibreOffice or a cloud service. Complex macros, embedded objects, uncommon fonts, and advanced layout features can differ from Microsoft Office. Legacy binary `.doc`, `.xls`, and `.ppt` files are not supported.
- **Workbench slot requirement.** The panel requires a dsh shell that exposes the `shell.workbench` slot. Older builds only expose a floating overlay and cannot provide a true fourth layout column to an external plugin.
