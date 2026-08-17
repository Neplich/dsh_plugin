# dsh_plugin

[中文版](README.zh-CN.md) · English

A collection of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin bundles. Each package under `packages/` is one installable dsh plugin; this repository only manages them together — it is not itself a plugin.

## Layout

```
packages/
  agent/                 agent strategy and preset plugins
  feature/               feature plugins: model adapters, Web GUI settings sections, composer and UI features
  <group>/dsh-<name>/    one plugin per directory (dir name starts with dsh-), published as @neplich/dsh-<name>
    package.json         npm manifest + dsh.bundle declaration
    cordis.patch.yml     the layer applied when a profile installs this bundle
    src/index.ts         function plugin: name / inject / Config / apply
    README.md            English doc
    README.zh-CN.md      Chinese doc (mutually linked at the top)
    tests/               package-level vitest tests
```

A package becomes an installable **bundle** by declaring `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` in its manifest; the patch rows reference the package by name so Node resolution finds the installed build. See the official [Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) tutorial for the full bundle/profile model.

## Plugins

### Agent plugins

| Package | Description | README |
|---|---|---|
| `@neplich/dsh-preset-dev` | Agent preset installer: installs the Development Mode (dev) preset — standard coding agent plus the cordis toolset — into the user preset root; carries a "validate dynamically first, then land" development strategy (validate quickly with dynamic Cordis plugins by default, sink into a plugin repository once confirmed) | [README](packages/agent/dsh-preset-dev/README.md) |

### Feature plugins

| Package | Description | README |
|---|---|---|
| `@neplich/dsh-auto-fold` | Web GUI plugin: when the assistant starts outputting body text, auto-collapse the thinking and tool-call records above it behind one persistent expand/collapse bar (bilingual zh/en bar copy following dsh's UI language) | [README](packages/feature/dsh-auto-fold/README.md) |
| `@neplich/dsh-file-mention` | Web GUI plugin: `@` file mentions in the composer (cached local substring filter, icon-marked chips, multi-file references); mentioned files are inlined into the prompt as `<file path="...">...</file>` | [README](packages/feature/dsh-file-mention/README.md) |
| `@neplich/dsh-work-panel` | Web GUI plugin: a right-side work panel (Option/Alt+J) with mixed file/terminal tabs, state-preserving browsing, interactive PTYs, and lazy PDF.js plus OOXML Office previews (bilingual zh/en UI following dsh's language) | [README](packages/feature/dsh-work-panel/README.md) |
| `@neplich/dsh-mermaid` | Web GUI plugin: renders mermaid code fences as SVG diagram cards with a source toggle, plus a full-screen pan/zoom viewer (theme- and language-following; engine served over a loopback route, no CDN) | [README](packages/feature/dsh-mermaid/README.md) |
| `@neplich/dsh-config-skills` | Web GUI plugin: a Skills settings section — read-only browser of personal (`~/.dsh`/`~/.agents`) and project (`<root>/.dsh`/`<root>/.agents`) skills with source badges and shadowing (bilingual zh/en UI following dsh's language) | [README](packages/feature/dsh-config-skills/README.md) |
| `@neplich/dsh-config-instructions` | Web GUI plugin: an Instruction Documents settings section — view and edit personal and project-root AGENTS.md / AGENTS.local.md files (atomic writes, live effect; bilingual zh/en UI following dsh's language) | [README](packages/feature/dsh-config-instructions/README.md) |
| `@neplich/dsh-config-mcp` | Web GUI plugin: an MCP Servers settings section — live server status, add/edit/toggle/delete written to the user-level cordis.patch.yml with automatic HMR reload (bilingual zh/en UI following dsh's language) | [README](packages/feature/dsh-config-mcp/README.md) |
| `@neplich/dsh-annotations` | Web GUI plugin: select text in a historical assistant reply and attach it to the composer as pending annotations that ride along with your next message (persistent message highlight, count pill, detail popover; bilingual zh/en UI following dsh's language) | [README](packages/feature/dsh-annotations/README.md) |

The three config plugins share code through `packages/feature/dsh-config-shared` (`@neplich/dsh-config-shared`), an internal library inlined at build time — not itself a plugin. Its shared scope-widget copy ships as dictionaries (`sharedScopeZh`/`sharedScopeEn`) that each consumer spreads into its own locale namespace.

Every finished plugin ships an English `README.md` and a matching Chinese `README.zh-CN.md` (mutually linked at the top) in its package directory describing its function (features, config, install); the table above links to the English one. Keep the table in sync with `packages/`: any plugin addition, removal, or major update must update the plugin READMEs and this table in the same change.

## Commands

```sh
pnpm install     # pnpm workspaces, node ^22.19 || >=24
pnpm run build   # tsc project-references build, emits packages/<group>/*/lib
pnpm run test    # vitest
pnpm run clean   # remove build outputs
```

## Add a plugin

1. Create `packages/<group>/dsh-<name>/` (directory name must start with `dsh-` and match the package suffix; choose `agent/` for agent strategy and preset plugins, `feature/` for LLM adapters, Web GUI, and other feature plugins) with `package.json` (`name: @neplich/dsh-<name>` plus the `dsh.bundle` declaration), `src/index.ts`, `tsconfig.json`, `tests/`, `README.md` and `README.zh-CN.md`.
2. Update the plugin row in `cordis.patch.yml` (both `id` and `name`) and `name` in `src/index.ts`.
3. Add `{ "path": "packages/<group>/dsh-<name>" }` to the root `tsconfig.json` references.
4. Write `packages/<group>/dsh-<name>/README.md` (English) and its Chinese counterpart `README.zh-CN.md` (mutually linked at the top) describing the plugin's function, config, and install, and link the English one from the [Plugins](#plugins) table above.
5. `pnpm install && pnpm run build && pnpm run test`.

> **Installability**: plugin source must install and build in any environment after cloning. Depend on harness packages with npm-registry semver ranges in `devDependencies` (matching `peerDependencies`), never `link:../../../deepseek-harness/...` sibling-checkout paths; use the pnpm `workspace:` protocol for in-repo dependencies. Re-run a full `pnpm install` (not just the existing `node_modules`) after any dependency change.

Choose the extension point before writing code — tool, hook, LLM adapter, command, capability seam — with the `dsh-plugin-development` agent skill and the upstream [extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md).

## Try a plugin locally

```sh
pnpm run build
dsh plugin --profile demo add ./packages/<group>/dsh-<name>   # links the checkout into the profile
dsh --profile demo                                   # boot the profile
```

During active development against a source checkout of deepseek-harness, a `--patch` overlay can load `src/index.ts` directly without building; see [Your first plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md).

## Publish

`pnpm run build && pnpm -r publish --access public` ships the prebuilt `lib/`; consumers install with `dsh plugin --profile <name> add @neplich/dsh-<name>`. Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to this repository for discoverability.
