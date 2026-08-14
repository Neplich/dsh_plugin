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
4. `pnpm install && pnpm run build && pnpm run test`.

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
