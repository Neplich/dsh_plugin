# @neplich/dsh-auto-fold

Web GUI plugin: when an assistant message starts outputting its body text, the plugin automatically collapses every **thinking** (Think) row and **tool-call** row that precedes the body within the same turn, and inserts one slim expand bar in their place. Clicking the bar toggles the records between collapsed and expanded; the bar stays mounted and serves as the "collapse again" button after expanding.

Row-internal state is preserved exactly: folding only flips row visibility (`display`) and hides a Think subtree via CSS — it never rebuilds, replaces, or rewrites the tool-call cards, so an already-expanded tool detail or a user-opened Think disclosure comes back in the same state after expanding.

The strategy is pure DOM over the shipped chat flow: no harness change, no slot takeover, no services. It works against a **stock** deepseek-harness and follows the shipped rendering structure (`[data-chat-flow]` rows with `data-chat-flow-kind`, Think disclosures as `[data-variant="think"]`).

## How it works

- **Browser half only** (`src/client/index.ts`): a `MutationObserver` watches the page for chat flows. When an assistant body row (an `assistant-step` row whose text outside the Think subtree is non-empty) first appears, the plugin computes the fold plan: every `tool-call` row and every bodiless think-only assistant row above it, bounded by the nearest user row (a turn). Those rows are hidden, and one expand bar is inserted above the first of them.
- **Persistent toggle bar**: the bar's click flips collapsed ↔ expanded state (label changes to match). A turn the user expanded is recorded so streaming updates never re-collapse it automatically; the bar remains as the explicit "collapse again" control.
- **React-safe**: rows are hidden through inline `display`, which React never manages (the shipped row renderers declare no `style`), and the Think-hiding uses a `data-dsh-hide-think` attribute React does not own. The bar is pinned above its first target row on every scan, so React's own list moves cannot strand it.
- **Clean lifecycle**: on unload the observer disconnects, every hidden row is restored, and all bars and injected styles are removed.
- The fold decision is the exported pure function `computeFolds` (unit-tested); the DOM mapping lives in `apply`.

Requires a `dsh web` profile (it is a browser-only surface plugin; the host half is an empty apply so the row mounts in the Loader).

## Config

None — no tunables; the plugin always collapses thinking + tool-call records above the body of each turn.

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-auto-fold   # or a local path: ./packages/dsh-auto-fold
dsh web --profile <name>
```

Then send a message that produces thinking and tool calls: once the body text starts, the records above it collapse behind the expand bar.

## Develop

Built with the multi-plugin workspace at the repository root: `pnpm run build` emits `lib/` (tsc), `pnpm --filter @neplich/dsh-auto-fold run bundle` emits the browser bundle `lib/client.js` (tsdown), `pnpm run test` runs the package-level vitest suites.

## Model Experience

No tools, no system-prompt change, no model-visible input. The plugin is pure presentation: it reads only the rendered chat DOM and toggles visibility. The session log, prompts, tool schemas, and outputs are untouched, so nothing about the model's view of the conversation changes.

## Known Limitations and Deferred Work

- **Rendering-structure coupling** — the strategy depends on the shipped DOM markers (`data-chat-flow`, `data-chat-flow-kind`, `data-variant="think"`) and on rows not carrying a React-managed `style` prop; a future harness redesign of the chat flow could break it and would need the selectors updated.
- **Web GUI only** — TUI/ACP entry points render no chat DOM, so the plugin has no effect there.
- **Auto-fold is per body row, not per turn** — a turn whose body arrives in several assistant rows folds each body row's own preceding records; the bars stay independent (no merging).
- **Running tool rows are folded too** — once body text starts, preceding tool rows are hidden even if one is still streaming; the bar's count includes them and expanding shows the live row.
- **Expand state is per page load** — the "user expanded this turn" memory lives in the page; reopening or refreshing the session auto-folds the same turn again (this is the default policy, not a bug).
