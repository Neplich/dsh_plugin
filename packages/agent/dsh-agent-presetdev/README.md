# @neplich/dsh-agent-presetdev

[中文版](README.zh-CN.md) · English

dsh agent-preset installer plugin: installs the "Development Mode" (dev) agent preset — the full standard coding agent plus the cordis toolset (fast dynamic-plugin validation) — into the user preset root. The preset carries a built-in development strategy of "validate dynamically first, then land": by default, features are validated quickly with dynamic Cordis plugins in the running process, and only after the feature is revised and confirmed do they get sunk into a proper package in a dsh plugin repository.

## Features

- Installs the `dev` (Development Mode) agent preset: `agent.cordis.yml` (full standard + trailing `tool-cordis` rows), `preset.yml` (name: Development Mode, order: 5)
- Ships the `editing-cordis-compositions` skill with the package (the preset's `customSkillDirs` points to a copy of the in-package skills directory; `baseUrl` resolves relative to the preset's directory)
- **Built-in development strategy** (persona prompt): by default, validate quickly with dynamic Cordis plugins (`cordis_define` / `cordis_run` / `cordis_inspect_*`), then sink the confirmed feature into a proper package in the target plugin repository (target and placement per that repository's maintenance docs); remove dynamic plugins when done (`cordis_stop` / `cordis_undefine`)
- **Idempotent install**: existing targets are not overwritten (local edits preserved); `DSH_PRESET_DEV_FORCE=1` forces a refresh to the in-package version
- Installs automatically at startup; the roster re-reads the disk on each read, so the preset is visible right after install (`trust: user`)

## Config

No config options. Environment variable:

| Variable | Effect |
|---|---|
| `DSH_PRESET_DEV_FORCE=1` | At startup, force-overwrite the installed preset copy with the in-package version |

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-agent-presetdev   # after npm publish
# or local dev: dsh plugin --profile <name> add ./packages/agent/dsh-agent-presetdev
```

After restarting dsh, the "Development Mode" preset appears in the picker.

## Uninstall

```sh
dsh plugin --profile <name> remove @neplich/dsh-agent-presetdev
```

Installed preset files are **not** removed automatically (you may still be using the mode); full cleanup:

1. Delete the preset directory: `rm -rf ~/.dsh/.agent-presets/dev`
2. If "Development Mode" was set as the default (`agent-presets.default: dev` in `$DSH_HOME/settings.yaml`), reset or remove that field as well — otherwise new sessions fail to create because the default preset cannot be resolved (GUI: Settings → Agent Presets → set another preset as default).
3. Restart `dsh` and confirm "Development Mode" no longer appears in the preset picker and new sessions create normally.

## Upgrade / Refresh

Installed preset files are independent (possibly locally edited). After a package upgrade, refresh with either:

```sh
DSH_PRESET_DEV_FORCE=1 dsh --profile <name>   # force-overwrite with the in-package version
# or delete ~/.dsh/.agent-presets/dev and restart
```

## Notes

- The dev preset contains `tool-cordis` (cordis toolset), whose Inspect Provider registers on the process-level singleton registry: **do not mount cordis (creation mode) and dev (development mode) in the same process at the same time**.
- Dynamic Cordis plugins exist only in the current process and write nothing to disk: after validation or landing, remove them explicitly with `cordis_stop` / `cordis_undefine` instead of relying on process exit; after removing development packages, also clean up on-disk artifacts per the target environment's plugin cleanup conventions (development presets never enter production deployments).
- The plugin itself runs on the host plane and only writes files; it registers no model tools; all model-visible effects come from the installed preset itself.

## Model Experience

This plugin registers no model tools, prompt segments, or events. After installation, dev sessions gain `cordis_inspect_list` / `cordis_inspect_query` / `cordis_inspect_self` / `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine` in the tool list and `editing-cordis-compositions` in the skill directory; the persona carries the "validate dynamically first, then land" strategy: by default, validate features quickly with dynamic Cordis plugins, and only after the feature is revised and confirmed sink it into a proper package in a dsh plugin repository.
