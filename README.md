# dsh_plugin

A collection of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin bundles. Each package under `packages/` is one installable dsh plugin; this repository only manages them together — it is not itself a plugin.

## Layout

```
packages/<name>/       one plugin per directory, published as @neplich/dsh-<name>
  package.json         npm manifest + dsh.bundle declaration
  cordis.patch.yml     the layer applied when a profile installs this bundle
  src/index.ts         function plugin: name / inject / Config / apply
  tests/               package-level vitest tests
```

A package becomes an installable **bundle** by declaring `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` in its manifest; the patch rows reference the package by name so Node resolution finds the installed build. See the official [Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) tutorial for the full bundle/profile model.

## Plugins

| Package | Description | README |
|---|---|---|
| `@neplich/dsh-greet` | Example plugin: a minimal `greet` tool — the starting template for new packages | [README](packages/greet/README.md) |
| `@neplich/dsh-file-mention` | Web GUI plugin: `@` file mentions in the composer (cached local substring filter, icon-marked chips, multi-file references); mentioned files are inlined into the prompt as `<file path="...">...</file>` | [README](packages/file-mention/README.md) |
| `@neplich/dsh-config-skills` | Web GUI plugin: a 技能 settings section — read-only browser of personal (`~/.dsh`/`~/.agents`) and project (`<root>/.dsh`/`<root>/.agents`) skills with source badges and shadowing | [README](packages/config-skills/README.md) |
| `@neplich/dsh-config-instructions` | Web GUI plugin: an 指令文档 settings section — view and edit personal and project-root AGENTS.md / AGENTS.local.md files (atomic writes, live effect) | [README](packages/config-instructions/README.md) |
| `@neplich/dsh-config-mcp` | Web GUI plugin: an MCP 服务 settings section — live server status, add/edit/toggle/delete written to the user-level cordis.patch.yml with automatic HMR reload | [README](packages/config-mcp/README.md) |
| `@neplich/dsh-preset-dev` | Agent preset installer: installs the 开发模式 (dev) preset — standard coding agent plus the cordis toolset — into the user preset root | [README](packages/dsh-preset-dev/README.md) |

The three config plugins share code through `packages/config-shared` (`@neplich/dsh-config-shared`), an internal library inlined at build time — not itself a plugin.

Every finished plugin ships a `README.md` in its package directory describing its function (features, config, install); the table above links to it. Keep the table in sync with `packages/`: any plugin addition, removal, or major update must update the plugin README and this table in the same change.

## Commands

```sh
pnpm install     # pnpm workspaces, node ^22.19 || >=24
pnpm run build   # tsc project-references build, emits packages/*/lib
pnpm run test    # vitest
pnpm run clean   # remove build outputs
```

## Add a plugin

1. Copy `packages/greet` to `packages/<name>` and rename the package to `@neplich/dsh-<name>` in `package.json`.
2. Update the plugin row in `cordis.patch.yml` (both `id` and `name`) and `name` in `src/index.ts`.
3. Add `{ "path": "packages/<name>" }` to the root `tsconfig.json` references.
4. Write `packages/<name>/README.md` describing the plugin's function, config, and install, and link it from the [Plugins](#plugins) table above.
5. `pnpm install && pnpm run build && pnpm run test`.

> **Installability**: plugin source must install and build in any environment after cloning. Depend on harness packages with npm-registry semver ranges in `devDependencies` (matching `peerDependencies`), never `link:../../../deepseek-harness/...` sibling-checkout paths; use the pnpm `workspace:` protocol for in-repo dependencies. Re-run a full `pnpm install` (not just the existing `node_modules`) after any dependency change.

Choose the extension point before writing code — tool, hook, LLM adapter, command, capability seam — with the `dsh-plugin-development` agent skill and the upstream [extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md).

## Try a plugin locally

```sh
pnpm run build
dsh plugin --profile demo add ./packages/greet   # links the checkout into the profile
dsh --profile demo                               # boot; ask the model to greet someone
```

During active development against a source checkout of deepseek-harness, a `--patch` overlay can load `src/index.ts` directly without building; see [Your first plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md).

## Publish

`pnpm run build && pnpm -r publish --access public` ships the prebuilt `lib/`; consumers install with `dsh plugin --profile <name> add @neplich/dsh-<name>`. Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to this repository for discoverability.
