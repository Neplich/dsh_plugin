# @neplich/dsh-greet

Example dsh tool plugin: registers a `greet` tool that answers `Hello, <name>!` (configurable).

## Config

| Key | Type | Default | Description |
|---|---|---|---|
| `greeting` | `string` | `'Hello'` | Greeting prefix the tool responds with. |

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-greet
```

## Develop

Built with the multi-plugin workspace at the repository root: `pnpm run build` emits `lib/`, `pnpm run test` runs the package-level vitest suite.

## Model Experience

Adds one tool, `greet`, to the system prompt: one required string parameter, one string result. No persistent state, no background work.
