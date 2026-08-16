# @neplich/dsh-config-skills

[中文版](README.zh-CN.md) · English

dsh Web GUI plugin: adds a "Skills" section to the settings panel for read-only browsing of personal- and project-level skills.

## Features

- "Personal / Project" toggle: personal level = `~/.dsh/skills` + `~/.agents/skills`; project level = `<project root>/.dsh/skills` + `<project root>/.agents/skills` (project root = nearest ancestor directory containing `.git`)
- The project page carries a project-root dropdown: options come from the registered workspaces, ordered by workspace (same as the sidebar)
- Merged list showing name, description, source badge (personal/project .dsh or .agents), invocation mode (manual-only / not manual), and same-name shadowing relationships (lower-priority sources marked "shadowed"); symlinked skill directories and flat Markdown files are discovered like their direct counterparts
- Clicking a row expands to show the full SKILL.md document
- Read-only by design: skill content follows the filesystem; directory changes take effect automatically through dsh's own watcher

## Internationalization

All UI copy (section title, navigation items, source badges, status hints) ships in zh and en through the `config-skills` locale namespace and adapts live to the language set in dsh settings. Server-returned error messages stay in English (protocol-level neutral copy).

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-config-skills
dsh web --profile <name>     # plugin-set changes require a restart
```

Available only in a `dsh web` profile (depends on `ctx.webServer`).

## Config

| Field | Default | Description |
|---|---|---|
| `maxFileBytes` | 524288 | Read size cap for a single SKILL.md |

## Security

All routes accept same-origin requests only; project-level reads verify the root comes from the workspace registry; file paths are derived server-side.

## Known Limitations

- Skills are read-only; create/delete skills by editing the directories directly (personal: `~/.dsh/skills` and `~/.agents/skills`; project: `<project root>/.dsh/skills` and `<project root>/.agents/skills`; `.dsh` wins on same-name collisions)
