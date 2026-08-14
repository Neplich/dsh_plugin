# @neplich/dsh-file-mention

Web GUI plugin: typing `@` in the dsh composer opens the input-trigger menu with a **file** group listing the session workspace's files; picking one inserts a chip-style reference into the draft. A single prompt can mention several files. On send, each mention is serialized host-side: the file's text content is inlined into the prompt as `<file path="...">...</file>`, so the model receives the actual content, not just a path.

## How it works

- **Host half** (`src/index.ts`): registers two same-origin routes on the Web GUI server (`ctx.webServer`):
  - `GET /file-mention/search?session=<id>&q=<query>` — walks the session's cwd (bounded, ignore-listed, briefly cached per cwd) and answers the ranked top matches.
  - `GET /file-mention/read?session=<id>&path=<relative>` — answers one file's text, confined to the session cwd (lexical + realpath escape checks), size-bounded, binary-refused.
- **Browser half** (`src/client/index.ts`): registers the `@` source `file` on the input-trigger pipeline (`ctx.inputTriggers`). Candidates ride the search route per keystroke; a pick inserts a `ReferenceInsert` occurrence; the source codec's `serialize` inlines the file content at submit, and a failed read blocks the send (never a silent downgrade to the bare `@path`).
- The session's cwd resolves from its live Agent (`ctx.agents`); a session with no live Agent answers 404 (the composer always addresses an open session). Both routes reject cross-origin browser fetches (Origin/Host mismatch).

Requires a `dsh web` profile: the plugin declares `inject: ['agents', 'webServer']`, so composing it in a profile without the Web GUI server leaves its fiber waiting on the injection.

## Config

| Key | Type | Default | Description |
|---|---|---|---|
| `maxResults` | `number` | `20` | Maximum menu candidates one search answers. |
| `maxFileBytes` | `number` | `131072` | Maximum file size in bytes one mention inlines. |
| `maxWalkEntries` | `number` | `20000` | Maximum entries (files + directories) visited per cwd scan. |
| `cacheTtlMs` | `number` | `3000` | Per-cwd walk cache lifetime in milliseconds. |
| `ignoreDirs` | `string[]` | `node_modules`, `.git`, … | Directory basenames the walk skips entirely. |

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-file-mention   # or a local path: ./packages/file-mention
dsh web --profile <name>
```

Then type `@` in the composer and pick files from the **file** group.

## Develop

Built with the multi-plugin workspace at the repository root: `pnpm run build` emits `lib/` (tsc), `pnpm --filter @neplich/dsh-file-mention run bundle` emits the browser bundle `lib/client.js` (tsdown), `pnpm run test` runs the package-level vitest suites. Type-only dependencies on unpublished `@deepseek-ai/dsh-client-*` / `dsh-host-webserver` packages are `link:`ed to a local deepseek-harness checkout in `devDependencies` — adjust those paths when the checkout lives elsewhere; the published artifact needs none of them at runtime (host value imports are cordis + schemastery only, the browser bundle is self-contained).

## Model Experience

No tools, no system-prompt change. One user-gesture-driven context path: each picked file mention adds one `<file path="...">` block containing the file's full text (up to `maxFileBytes`) to that single user message. Content is fetched at send time, so the model sees the file as it stands when the prompt ships. Repeatedly mentioning the same file in later messages re-inlines the then-current content; prompt caching across turns is unaffected beyond the message's own text.

## Known Limitations and Deferred Work

- **Web GUI only** — TUI/ACP entry points get no `@` menu (the mention pipeline is a browser feature); a hand-typed `@path` elsewhere ships as literal text with no content injection.
- **Live sessions only** — candidates and reads resolve through the session's live Agent, so the menu stays empty for a cold session (the composer never addresses one).
- **No `.gitignore` support** — the walk honors only the configured `ignoreDirs` basename list.
- **Text files only** — binary files are refused at read time (the send is blocked with the reason); very large files are refused past `maxFileBytes` rather than truncated.
- **Loopback trust model** — the routes rely on the dev server's loopback bind plus the Origin fence; binding the server to `0.0.0.0` exposes workspace file reads to the network.
