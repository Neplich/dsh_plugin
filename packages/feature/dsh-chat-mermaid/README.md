# @neplich/dsh-chat-mermaid

[中文版](README.zh-CN.md) · English

A dsh Web GUI plugin that renders ```` ```mermaid ```` code fences in the conversation as SVG diagrams instead of plain code blocks, with a full-screen pan/zoom viewer for reading complex diagrams.

## Features

- **Diagram cards**: every settled mermaid fence (assistant messages, tool cards, the details panel) becomes a rendered diagram card; the original source stays one click away behind a *View source* toggle, and render failures fall back to showing the source plus the error.
- **Full-screen viewer**: click the diagram (or the expand icon) to open a viewer with wheel zoom around the cursor, drag panning, zoom in/out, fit-to-window, and close via Esc, the close icon, or a backdrop click.
- **Theme and language aware**: diagrams follow the GUI's light/dark theme (mermaid `default`/`dark`) and every visible string follows the dsh interface language (zh/en).
- **Safe rendering**: mermaid runs with `securityLevel: 'strict'`; the engine is the self-contained UMD build served by the plugin's host half over a same-origin loopback route — no CDN, works offline.

## How it works

The markdown pipeline has no fence extension slot, so the browser half upgrades fences in the DOM: a MutationObserver scans `.md-code-block` surfaces, reads the fence language from the banner's infostring cell, and swaps mermaid blocks for diagram cards. Streaming fences are left untouched until the block settles (the shell only stamps the language then). The host half serves `mermaid/dist/mermaid.min.js` from the plugin's own dependency at `GET /dsh-chat-mermaid/mermaid.min.js` (loopback, same-origin only), so the client bundle stays small.

## Configuration

No configuration.

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-chat-mermaid
dsh --profile <name> web
```

From a source checkout of this repository:

```sh
pnpm install && pnpm run build
dsh plugin --profile <name> add ./packages/feature/dsh-chat-mermaid
```

The host half needs `ctx.webServer`, so install it in profiles booted through `dsh web`.

## Uninstall

```sh
dsh plugin --profile <name> remove @neplich/dsh-chat-mermaid
```

The plugin writes no files and no settings; removing the bundle is the complete cleanup. Stopping the plugin removes every diagram card and restores the original code blocks in place.

## Model Experience

None. The plugin changes only how the Web GUI presents mermaid fences; it adds no tools, prompt sections, or events, and the model-visible conversation text is untouched.
