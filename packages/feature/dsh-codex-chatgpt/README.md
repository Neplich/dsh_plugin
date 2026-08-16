# dsh-codex-chatgpt

[中文版](README.zh-CN.md) · English

A dsh LLM adapter plugin that drives the **ChatGPT Codex backend** (`chatgpt.com/backend-api/codex/responses`) with your **ChatGPT subscription (Plus/Pro) Codex quota** — no OpenAI API key or per-token billing needed.

It reuses the official Codex CLI login: run `codex login` once and sign in with ChatGPT, and this plugin reads, refreshes, and updates `~/.codex/auth.json` exactly like the CLI does.

## What it gives you

- A new model provider `codex-chatgpt` in dsh's Models page, selectable like any other provider.
- A dedicated **Settings → Codex** section for sign-in, account status, and live model visibility.
- Live account model discovery backed by the same Codex `/models` catalog used by the official CLI.
- Text streaming, tool calling, and reasoning (thinking) output through the Responses API, translated into dsh's native stream protocol.
- Automatic token refresh: expired access tokens are exchanged through the Auth0 endpoint the Codex CLI itself uses, and new tokens are written back to the auth file.
- 401 recovery: one refresh-and-retry per request, mirroring the Codex CLI.
- Rate-limit and quota errors mapped onto dsh's error taxonomy (`RATE_LIMIT`, `QUOTA`, `AUTH`, …).

## Prerequisites

- A ChatGPT account with Codex access (Plus/Pro plan or a workspace with Codex).
- The official Codex CLI installed, and logged in once with ChatGPT:

  ```sh
  brew install codex      # or your package manager
  codex login             # choose "Sign in with ChatGPT", complete the browser flow
  ```

  This creates `~/.codex/auth.json`. The plugin never asks for your password — it only uses the tokens the CLI already owns.

> Only one consumer of the refresh token should run at a time: like OpenClaw's token-sink design, ChatGPT rotates refresh tokens, so refreshing from two tools (e.g. the Codex CLI and this plugin) can log each other out. Prefer using one client per account per machine.

## Install

```sh
dsh plugin --profile <name> add /path/to/dsh_plugin/packages/feature/dsh-codex-chatgpt
# or, from the registry
dsh plugin --profile <name> add @neplich/dsh-codex-chatgpt
```

After the bundle is installed, open **Settings → Codex** in the Web GUI to sign in and choose which account models to expose. The provider is then available in **Settings → Models** and the model picker.

## Configuration

All fields are optional and can be set in `cordis.yml` under the plugin entry. The Codex settings page exposes only account login and model visibility; connection and reasoning defaults remain configuration-file settings.

| Key | Default | Meaning |
|---|---|---|
| `authJsonPath` | `~/.codex/auth.json` (honors `CODEX_HOME`) | Path of the Codex CLI auth file |
| `baseURL` | `https://chatgpt.com/backend-api/codex` | Endpoint base; `/responses` is appended |
| `reasoningEffort` | model default | `none` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max` \| `ultra`; `none` disables reasoning |
| `maxTokens` | `64000` | Default per-request output cap |
| `defaultContextWindow` | `400000` | Context capacity when the selected model has no exact value |
| `models` | `gpt-5.6-sol`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` | Fallback catalog used only while the signed-in account catalog is unavailable |
| `enabledModels` | all account models | Optional allow-list applied to the live account catalog |
| `clientVersion` | `0.147.0` | Codex client version sent while fetching the account model catalog |
| `streamIdleTimeoutMs` | `300000` | Max idle time while one stream read is outstanding |
| `retryPolicy` | harness default | Provider-owned request retry policy |

Example `cordis.yml` row:

```yaml
plugins:
  codex-chatgpt:
    reasoningEffort: high
    models:
      - id: gpt-5.4
        name: GPT-5.4
```

## Model Experience

- **Models**: fetched live from the signed-in ChatGPT account. A small configurable catalog is used only when live discovery is unavailable.
- **Reasoning**: thinking output arrives as `reasoning` blocks; effort is selectable per model (`off` plus the levels advertised by that model). When unset, the model default is used.
- **Tool calling**: full support; tool arguments stay raw JSON strings end-to-end, matching dsh's protocol.
- **Input**: text only. Image blocks and `stop` sequences are refused with an `UNSUPPORTED` error.
- **Streaming**: token-level deltas when the backend delta-streams; full assembled items otherwise — both handled without duplication.
- **Usage**: token counts from the completed response are reported per call; your ChatGPT plan's Codex quota covers billing.

## Error behavior

- No auth file / missing tokens → `MISSING_CREDENTIAL` with a hint to run `codex login`.
- Rejected refresh token → `AUTH` (re-run `codex login`).
- 401 mid-request → one automatic refresh + retry; a second 401 surfaces as `AUTH`.
- 429 / 529 (overloaded) → `RATE_LIMIT`, honoring `Retry-After`; quota exhaustion → `QUOTA`.
- Stream ends without `response.completed` → `STREAM_CLOSED`; idle stream → `TIMEOUT`; caller abort → `ABORTED`.

## Known Limitations and Deferred Work

- **Terms-of-service gray area**: using your ChatGPT subscription quota from a third-party client is common (OpenClaw, CodexBar, langchain-codex-plus, deer-flow all do it), but OpenAI can in principle restrict such usage. Keep it personal and moderate. This is your own account and your own machine.
- **Internal endpoint**: `chatgpt.com/backend-api` is not a documented public API and can change; the plugin follows the Codex CLI's own protocol (verified against `openai/codex` sources) and retries transient failures.
- **Shared login state**: the built-in PKCE flow and `codex login` use the same Codex CLI auth file, so concurrent refreshes can rotate each other's tokens.
- **No native replay state**: responses are rebuilt from history on retry (stateless), so `finish.replayState` is not emitted.
- **Auth file sync**: concurrent use of the Codex CLI and this plugin can rotate each other's refresh tokens; see the prerequisite note above.

## Development

```sh
pnpm run build   # tsc project references
pnpm run test    # vitest (unit; no live API calls)
```

A live smoke test needs a real `~/.codex/auth.json` and a ChatGPT account: run the plugin in a dsh profile and send a request in the Web GUI.

## How it works

| Piece | File |
|---|---|
| Plugin entry, config schema, settings section | `src/index.ts` |
| Adapter (fetch, 401 recovery, error mapping) | `src/adapter.ts` |
| Auth file read/refresh/persist (single-flight) | `src/auth.ts` |
| Request serialization (Messages → Responses API) | `src/serialize.ts` |
| SSE parsing | `src/sse.ts` |
| SSE events → `StreamChunk` translation | `src/translate.ts` |
