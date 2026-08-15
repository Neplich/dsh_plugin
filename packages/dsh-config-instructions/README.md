# @neplich/dsh-config-instructions

[中文版](README.zh-CN.md) · English

dsh Web GUI plugin: adds an "Instruction Documents" section to the settings panel for viewing and editing the AGENTS.md instruction documents at every level.

## Features

- "Personal / Project" toggle: personal level = `~/.dsh/AGENTS.md` + `~/.dsh/AGENTS.local.md`; project level = `<project root>/AGENTS.md` + `<project root>/AGENTS.local.md`
- The project page carries a project-root dropdown (ordered by workspace)
- Inline editing, save (atomic write), one-click creation when the file does not exist yet
- CLAUDE.md / CLAUDE.local.md, when present, are shown read-only
- Changes take effect immediately: running sessions receive an instruction-update notice, new sessions load them directly
- Subdirectory-level AGENTS.md is not managed here — it loads progressively as the agent explores the directory hierarchy

## Internationalization

All UI copy (section title, navigation items, editor hints, buttons) ships in zh and en through the `config-instructions` locale namespace and adapts live to the language set in dsh settings. Server-returned error messages stay in English (protocol-level neutral copy).

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-config-instructions
dsh web --profile <name>     # plugin-set changes require a restart
```

Available only in a `dsh web` profile (depends on `ctx.webServer`).

## Config

| Field | Default | Description |
|---|---|---|
| `maxFileBytes` | 524288 | Read/write size cap for a single instruction file |
| `maxBodyBytes` | 1048576 | JSON body cap for write requests |

## Security

All routes accept same-origin requests only; project-level writes verify the root comes from the workspace registry; only AGENTS.md / AGENTS.local.md are writable, with paths derived server-side.
