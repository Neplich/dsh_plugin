# dsh-chat-autoload

English · [中文版](README.zh-CN.md)

dsh Web GUI plugin: when a session becomes current, automatically page its **full history** into the client — the equivalent of clicking "load older" until the log head is reached — and expose the `chatAutoload` service so other plugins can depend on (and re-trigger) that behavior.

## Why

The Web GUI pages long conversations 50 messages at a time. Features that index the whole conversation (e.g. [dsh-chat-navigator](../dsh-chat-navigator/README.md)) need the complete window. The host places no upper bound on the page size, so this plugin simply drives the session's own `loadOlder()` to completion — existing session data stays the single source; nothing is persisted, no model request is made.

## Behavior

- On every session switch, pages older history until the window reaches the log head, sequentially (one page per request, with a no-progress stall guard).
- After a reconnect resync truncates the window back to the tail page, re-arms and pages again automatically.
- Provides the `chatAutoload` service:
  - `ensureLoaded(id)` — start/re-arm full-history paging for a session (idempotent).
  - `isComplete(id)` — whether the session's full history is currently paged in.

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-chat-autoload
```

## Uninstall

```sh
dsh plugin --profile <name> remove @neplich/dsh-chat-autoload
```

The plugin writes no files and no settings fields, so removal leaves no residue. Consumer plugins that read `chatAutoload` (e.g. dsh-chat-navigator) degrade gracefully once it is removed — they index only the loaded window instead of the complete history.

## Model Experience

None: the plugin never sends model requests and never touches the session log; it only reads history through the existing paging RPC.
