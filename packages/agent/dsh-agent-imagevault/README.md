# @neplich/dsh-agent-imagevault

[中文文档](README.zh-CN.md)

Image archiving and chat-stream display for tool results. Two independent jobs:

1. **Archive** — every image block in any tool result (screenshots, `read_image`, uploads, …) is copied out of the durable attachment store into a plain-file export directory. Source-agnostic: it works with any tool that produces images.
2. **Display** — a loopback HTTP server answers `GET /sha256:<hex>.<ext>` straight from the content-addressed attachment store, giving every session image a stable URL that lives exactly as long as the session history. The Web GUI's markdown renderer accepts http(s) image URLs, so the agent can embed them (`![shot](http://127.0.0.1:9335/sha256:….png)`) to show images in the chat stream.

Also registers one tool: `imagevault_dir`, which reports the display URL pattern and the export directory.

## Why not just files?

Chat images (uploads and tool screenshots alike) already live durably in the content-addressed attachment store at `$DSH_HOME/attachments/v1/objects/` — that store's lifetime matches the session history. Serving display URLs directly from it means zero duplication and links that never expire with temp-cleanups. The exported plain files are a convenience for opening images locally; they live in a temp directory the OS may clean, which never breaks chat display.

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-agent-imagevault
```

## Config (cordis.yml)

| Key | Default | Meaning |
|---|---|---|
| `port` | `9335` | Loopback port for the display HTTP server |
| `exportDir` | `<os-tmp>/dsh-image-vault` | Directory receiving archived image files |
| `storeDir` | `$DSH_HOME/attachments/v1/objects` | Attachment object root of the local backend |

## Uninstall

```sh
dsh plugin --profile <name> remove @neplich/dsh-agent-imagevault
```

Removing the plugin stops the display server and the archive listener. Artifacts:

| Artifact | Default location | Cleanup |
|---|---|---|
| Exported image files | `<os-tmp>/dsh-image-vault/` | Left to OS temp cleanup, or delete manually |
| Attachment objects | `$DSH_HOME/attachments/` | **Not touched** — shared session data owned by the attachment service, not by this plugin |

## Known limitations

- The display route reads the **local** attachment backend's file layout (`objects/<hex[:2]>/<hex>`); with a non-local backend mounted it answers 404 (archiving still works through the public `readImage` contract).
- Archived files are a copy — deleting them never affects the session's own images.
