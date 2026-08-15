# @neplich/dsh-config-mcp

[中文版](README.zh-CN.md) · English

dsh Web GUI plugin: adds an "MCP Servers" section to the settings panel for full management of MCP servers.

## Features

- Live listing of all MCP servers (from Cordis Loader entries): connection state (running/connecting/failed/disabled), transport (stdio/http), command or address summary, registered tool count
- Add / edit / delete "managed" servers (written as `insert` rows into `~/.dsh/cordis.patch.yml`; AST-level editing preserves comments and other rows)
- Any server can be enabled / disabled (externally sourced servers via appended `{ id, disabled }` override rows)
- After saving, dsh's patch watch + HMR hot-reloads automatically (disconnect/reconnect) — no restart needed
- Supported fields: serverName, transport, command/args/env/cwd (stdio), url/headers (http), toolCallTimeoutMs, failOnStartupError

## Internationalization

All UI copy (section title, navigation items, status labels, forms, buttons, hints) ships in zh and en through the `config-mcp` locale namespace and adapts live to the language set in dsh settings. Server-returned error messages stay in English (protocol-level neutral copy).

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-config-mcp
dsh web --profile <name>     # plugin-set changes require a restart
```

Available only in a `dsh web` profile (depends on `ctx.webServer`).

## Config

| Field | Default | Description |
|---|---|---|
| `maxBodyBytes` | 1048576 | JSON body cap for mutation requests |

## Known Limitations

- The edit dialog does not support `!!js` expression values (edit the patch file directly if needed) or `reconnect.*` fields
- Renaming serverName requires delete + recreate (the tool namespace binds to the entry id)
- Edit/delete apply only to servers managed by the user-level patch file; servers provided by other layers can only be disabled
