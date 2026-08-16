# @neplich/dsh-file-mention

[中文版](README.zh-CN.md) · English

Web GUI plugin: typing `@` in the dsh composer opens the input-trigger menu with a **file** group listing the session workspace's files; picking one inserts a chip-style reference into the draft. A single prompt can mention several files. On send, each mention is serialized host-side: the file's text content is inlined into the prompt as `<file path="...">...</file>`, so the model receives the actual content, not just a path.

Interaction details: the query filters by plain case-insensitive substring (basename prefix → basename containment → path containment, no fuzzy tier). Each menu row carries a `📄` icon, the file **basename** (with a ` (dir)` suffix when the page collides), and its directory in the description column. The composer's reference chip shows `📄 ` plus the basename, tail-elided against a canvas-measured width so the marker and the name's leading characters always survive the chip's fixed-width cell (its CSS would otherwise cut a random middle slice). After one per-session listing fetch, every keystroke filters the settled snapshot locally (the ui-skill cache pattern), so refinement never waits on the network; trees bigger than `maxListed` fall back to per-keystroke server-side ranking.

The plugin runs against a **stock** deepseek-harness — menu behavior it does not own keeps the pipeline's design: the menu keeps its design width, a no-match query closes the menu, and `@` directly after a CJK character does not open the trigger (type a space first, e.g. `请读取 @文件`).

## How it works

- **Host half** (`src/index.ts`): registers two same-origin routes on the Web GUI server (`ctx.webServer`):
  - `GET /file-mention/search?session=<id>&q=<query>` — walks the session's cwd (bounded, ignore-listed, single-flight cached per cwd) and answers either the listing (empty query: capped at `maxListed`, with a `complete` flag the client turns into local filtering) or the ranked top matches (non-empty query: the client fallback for huge trees).
  - `GET /file-mention/read?session=<id>&path=<relative>` — answers one file's text, confined to the session cwd (lexical + realpath escape checks), size-bounded, binary-refused.
- **Browser half** (`src/client/index.ts`): registers the `@` source `file` on the input-trigger pipeline (`ctx.inputTriggers`). The first interaction (or the scope-birth `warm`) fetches the listing once per session; candidates then filter the settled snapshot locally and only fall back to the server when the listing was cut. A pick inserts a `ReferenceInsert` occurrence (the full path rides a candidate-keyed side table because the menu keys rows by display name); the source codec's `serialize` inlines the file content at submit, and a failed read blocks the send (never a silent downgrade to the bare `@path`).
- The session's cwd resolves from its live Agent (`ctx.agents`); a session with no live Agent answers 404 (the composer always addresses an open session). Both routes reject cross-origin browser fetches (Origin/Host mismatch).

Requires a `dsh web` profile: the plugin declares `inject: ['agents', 'webServer']`, so composing it in a profile without the Web GUI server leaves its fiber waiting on the injection.

## Config

| Key | Type | Default | Description |
|---|---|---|---|
| `maxResults` | `number` | `20` | Maximum menu candidates one server-side (fallback) search answers. |
| `maxListed` | `number` | `5000` | Maximum listing rows the client caches for local filtering; bigger trees fall back to per-keystroke server search. |
| `maxFileBytes` | `number` | `131072` | Maximum file size in bytes one mention inlines. |
| `maxWalkEntries` | `number` | `20000` | Maximum entries (files + directories) visited per cwd scan. |
| `cacheTtlMs` | `number` | `3000` | Per-cwd walk cache lifetime in milliseconds. |
| `ignoreDirs` | `string[]` | `node_modules`, `.git`, … | Directory basenames the walk skips entirely. |

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-file-mention   # or a local path: ./packages/feature/dsh-file-mention
dsh web --profile <name>
```

Then type `@` in the composer and pick files from the **file** group.

## Develop

Built with the multi-plugin workspace at the repository root: `pnpm run build` emits `lib/` (tsc), `pnpm --filter @neplich/dsh-file-mention run bundle` emits the browser bundle `lib/client.js` (tsdown), `pnpm run test` runs the package-level vitest suites. Type-only dependencies on unpublished `@deepseek-ai/dsh-client-*` / `dsh-host-webserver` packages are `link:`ed to a local deepseek-harness checkout in `devDependencies` — adjust those paths when the checkout lives elsewhere; the published artifact needs none of them at runtime (host value imports are cordis + schemastery only, the browser bundle is self-contained).

## Model Experience

No tools, no system-prompt change. One user-gesture-driven context path: each picked file mention adds one `<file path="...">` block containing the file's full text (up to `maxFileBytes`) to that single user message. Content is fetched at send time, so the model sees the file as it stands when the prompt ships. Repeatedly mentioning the same file in later messages re-inlines the then-current content; prompt caching across turns is unaffected beyond the message's own text.

## Known Limitations and Deferred Work

- **Web GUI only** — TUI/ACP entry points get no `@` menu (the mention pipeline is a browser feature); a hand-typed `@path` elsewhere ships as literal text with no content injection.
- **Live sessions only** — candidates and reads resolve through the session's live Agent; a session with no live Agent answers 404, so the file group settles empty (the stock pipeline closes the menu).
- **No Tab path completion** — Tab arbitration and a completion hook would require changing the input-trigger pipeline's frozen cross-package contract; per the plugin-collection rule (degrade, never fork the harness) the feature is dropped. Typing path segments narrows the menu the same way.
- **`@` needs a boundary before it** — the pipeline's word-boundary rule (pinned by `user@host`/URL tests) treats a CJK character before `@` as mid-word, so `请读取@文件` does not open the menu; type a space first. Changing the rule is harness-owned.
- **Menu width and no-match close are pipeline design** — the menu keeps its design width cap, and a query with zero matches closes the menu instead of showing a "no matches" row; both are owned by the stock pipeline's documented design.
- **The chip cannot show arbitrarily long names** — the composer's reference chip is a fixed 4em cell (~57px label window) whose advance must equal the textarea's U+FFFC advance exactly; widening it would drift every glyph after the chip. That alignment design is harness-owned, so the label is pre-elided to fit (e.g. `📄 getti…`); the full path stays visible at pick time in the menu and in the clipboard projection (`@path`).
- **The cached listing can go stale** — files created or deleted after the session's listing fetch appear/disappear only after the cache resets (new session or connection reset); trees over `maxListed` always rank live server-side.
- **No `.gitignore` support** — the walk honors only the configured `ignoreDirs` basename list.
- **Text files only** — binary files are refused at read time (the send is blocked with the reason); very large files are refused past `maxFileBytes` rather than truncated.
- **Loopback trust model** — the routes rely on the dev server's loopback bind plus the Origin fence; binding the server to `0.0.0.0` exposes workspace file reads to the network.
