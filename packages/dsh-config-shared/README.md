# @neplich/dsh-config-shared

[中文版](README.zh-CN.md) · English

Internal shared code package for the `@neplich/dsh-config-*` plugins: HTTP route helpers, platform path resolution (`$DSH_HOME` / `$DSH_AGENTS_HOME`), the workspace project-root list, plus the client-side ScopeBar (personal/project toggle + project-root dropdown), SectionShell and shared styles.

**This is not a plugin** and is not installed standalone; each config-* plugin inlines it at build time as a devDependency (the host half is bundled into `lib/index.js` by tsdown, the client half into `lib/client.js`).

## Internationalization

ScopeBar UI copy (personal/project toggle, project-root dropdown, error hints) ships through this package's exported `sharedScopeZh` / `sharedScopeEn` dictionaries (keys prefixed `scope.`); each consuming plugin spreads them into its own locale namespace (single source of truth) and passes them in via ScopeBar's `t` prop.
