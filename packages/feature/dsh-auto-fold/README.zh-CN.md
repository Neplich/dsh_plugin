# @neplich/dsh-auto-fold

[English](README.md) · 中文版

Web GUI 插件：当 assistant 消息开始输出正文时，插件自动折叠同一轮内正文之前的全部**思考**（Think）行与**工具调用**行，并在其位置插入一条细小的展开条。点击展开条可在「折叠 ↔ 展开」之间切换；展开条常驻，展开后仍作为「再次收起」的按钮使用。

行内状态被完整保留：折叠只切换行可见性（`display`）并通过 CSS 隐藏 Think 子树——绝不重建、替换或改写工具调用卡片，因此已经展开的工具详情或用户手动展开过的 Think 内容，展开后仍保持原状。

策略是纯粹基于聊天流 DOM 的：不改 harness、不抢占 slot、不依赖服务。插件运行于**原生** deepseek-harness 之上，跟随官方渲染结构（`[data-chat-flow]` 行与 `data-chat-flow-kind`，Think 为 `[data-variant="think"]`）。

## 工作原理

- **仅浏览器半**（`src/client/index.ts`）：`MutationObserver` 监视页面上的聊天流。当某条 assistant 正文行（`assistant-step` 行，且其 Think 子树之外的文本非空）首次出现时，插件计算折叠计划：正文之上、同轮之内（以最近的 user 行为界）的全部 `tool-call` 行与无正文的纯思考行。这些行被隐藏，并在其中第一行的上方插入一条展开条。
- **常驻切换条**：点击展开条切换折叠 ↔ 展开（文案随之变化）。用户展开过的轮次会被记录，流式更新不会再次自动折叠；展开条保留为显式的「再次收起」控件。
- **React 安全**：行通过内联 `display` 隐藏（React 不管理它——官方行渲染器不声明 `style`），Think 隐藏使用 React 不持有的 `data-dsh-hide-think` 属性。每次扫描时展开条会被钉在其首个目标行上方，React 自身的列表移动不会使它错位。
- **干净的生命周期**：卸载时观察器断开、所有隐藏行恢复、全部展开条与注入样式被移除。
- 折叠决策是导出的纯函数 `computeFolds`（有单元测试）；DOM 映射位于 `apply`。

需要 `dsh web` profile（这是纯浏览器表面插件；host 半为空 apply，仅让行挂载进 Loader）。

## 国际化

展开条文案（折叠/展开计数）通过 `auto-fold` locale namespace 提供中英双语，并在 dsh 界面语言切换时实时重绘（`ctx.locale` revision 订阅会重绘所有已挂载的展开条）。

## 配置

无——没有任何可调项；插件总是折叠每一轮正文之上的思考 + 工具调用记录。

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-auto-fold   # 或本地路径：./packages/feature/dsh-auto-fold
dsh web --profile <name>
```

然后发送一条会产生思考与工具调用的消息：正文开始输出后，正文之上的记录即折叠到展开条之后。

## 开发

使用仓库根部的多插件工作区构建：`pnpm run build` 产出 `lib/`（tsc），`pnpm --filter @neplich/dsh-auto-fold run bundle` 产出浏览器 bundle `lib/client.js`（tsdown），`pnpm run test` 运行包级 vitest 套件。

## Model Experience

无工具、无 system-prompt 变更、无模型可见输入。插件是纯表现层：只读取已渲染的聊天 DOM 并切换可见性。会话日志、提示词、工具 schema 与输出均不受影响，模型视角下的对话没有任何变化。

## 已知限制与后续工作

- **渲染结构耦合** —— 策略依赖官方 DOM 标记（`data-chat-flow`、`data-chat-flow-kind`、`data-variant="think"`）以及行不携带 React 管理的 `style` prop；未来 harness 若重设计聊天流可能失效，需要同步更新选择器。
- **仅 Web GUI** —— TUI/ACP 入口不渲染聊天 DOM，插件在那里无效。
- **按正文行折叠，而非按轮** —— 一轮正文分多条 assistant 行输出时，每条正文行各自折叠其前记录；展开条相互独立（不合并）。
- **运行中的工具行也会被折叠** —— 正文开始后，其前的工具行即使仍在流式输出也会被隐藏；展开条计数包含它们，展开后可见实时行。
- **展开状态按页面加载存续** —— 「用户已展开此轮」的记忆只存在于页面内；重新打开或刷新会话后同一轮会再次自动折叠（这是默认策略，不是缺陷）。
