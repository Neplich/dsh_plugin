# @neplich/dsh-config-shared

`@neplich/dsh-config-*` 插件的内部共享代码包：HTTP 路由助手、平台路径解析（`$DSH_HOME` / `$DSH_AGENTS_HOME`）、工作区项目根列表，以及客户端的 ScopeBar（个人/项目切换 + 项目根下拉）、SectionShell 与共享样式。

**这不是插件**，不单独安装；作为 devDependency 被各 config-* 插件在构建时内联（host 半侧由 tsdown 打包进 lib/index.js，client 半侧打包进 lib/client.js）。

## 国际化

ScopeBar 的界面文案（个人/项目切换、项目根下拉、错误提示）通过本包导出的 `sharedScopeZh` / `sharedScopeEn` 字典（key 前缀 `scope.`）提供，各消费插件把字典 spread 进自己的 locale namespace（保持单一来源），并通过 ScopeBar 的 `t` prop 传入。
