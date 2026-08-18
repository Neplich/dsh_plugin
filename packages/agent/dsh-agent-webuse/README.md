# @neplich/dsh-agent-webuse

[中文文档](README.zh-CN.md)

Browser-use (computer-use style) tools for the dsh agent: a Playwright-driven automation Chrome the model can navigate, inspect, click, type into, and screenshot.

## Features

Twelve model-facing tools, served by one long-lived driver process that owns a persistent Chrome instance:

| Tool | Purpose |
|---|---|
| `webuse_launch` | Start (or attach to) the automation browser |
| `webuse_navigate` | Open a URL, optionally in a new tab |
| `webuse_snapshot` | Number the page's interactive elements (stable until the next navigation) |
| `webuse_click` / `webuse_fill` | Act on a numbered element |
| `webuse_press` / `webuse_scroll` / `webuse_back` | Keyboard, scrolling, history |
| `webuse_tabs` | List / switch / open tabs |
| `webuse_eval` | Run a JavaScript expression in the page for data extraction |
| `webuse_screenshot` | PNG screenshot into model context via the attachment service |
| `webuse_close` | Shut the browser and driver down |

The browser is **headed by default** so you can watch the agent work. Element numbers are pinned onto the live DOM (`data-dsh-webuse-idx` attributes) and stay valid across tool calls until the page changes.

### Screenshot degradation

`webuse_screenshot` never hard-fails on image-less deployments:

- **Normal path** — the PNG is committed through the durable attachment service and returned as an image block the model can see.
- **Degraded path** — when no attachment service is mounted, or the routed model does not declare image input, the PNG is saved to a temp file instead and the result carries the file path plus a page text summary (first 3000 characters), so the model keeps a textual "view" of the page and the user has a file to open.

## Requirements

- macOS/Linux/Windows with a Chrome-compatible browser installed (located through the Playwright `channel` config, default `chrome`).
- `playwright-core` is a runtime dependency and installs with the plugin; no browser binaries are downloaded.

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-agent-webuse
```

## Config (cordis.yml)

| Key | Default | Meaning |
|---|---|---|
| `port` | `9334` | Loopback port for the driver HTTP server |
| `headless` | `false` | Run Chrome headless instead of headed |
| `channel` | `chrome` | Playwright channel used to locate the browser |
| `profileDir` | `$DSH_HOME/webuse/chrome-profile` | Chrome user-data dir (cookies and logins persist here) |
| `viewportWidth` / `viewportHeight` | `1280` / `800` | Browser viewport |
| `fallbackDir` | `<os-tmp>/dsh-webuse-fallback` | Where degraded screenshots are written |

## Uninstall

```sh
dsh plugin --profile <name> remove @neplich/dsh-agent-webuse
```

Removing the plugin stops the driver and the browser. Artifacts it writes are **not** removed automatically:

| Artifact | Default location | Cleanup |
|---|---|---|
| Chrome profile (cookies, logins) | `$DSH_HOME/webuse/` | Delete the directory manually |
| Degraded screenshots | `<os-tmp>/dsh-webuse-fallback/` | Left to OS temp cleanup, or delete manually |

## Known limitations

- One browser instance per plugin load; all tool calls serialize against it.
- Element numbers from `webuse_snapshot` are invalidated by navigation and DOM changes — re-snapshot before acting.
- The display of screenshots inside the Web GUI chat stream is a separate concern; pair with `@neplich/dsh-agent-imagevault` for stable chat-renderable image URLs.
