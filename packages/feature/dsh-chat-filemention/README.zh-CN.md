# @neplich/dsh-chat-filemention

[English](README.md) · 中文版

> **状态：已由 dsh v0.1.0-rc.8 原生实现（Achieved）。** 原生 Web 界面现已支持 `@` 文件与会话引用。本地 `web` Profile 已停用本插件，先观察原生 `@` 的实际使用效果。插件源码继续保留；只有确认仍需要“发送时内联文件全文”后，才考虑把它作为原生 `@` 的可选补充。

Web GUI 插件：在 dsh 输入框中输入 `@` 会打开 input-trigger 菜单，其中包含一个**文件**分组，列出会话工作区的文件；选中一个文件会在草稿中插入 chip 样式引用。一条提示中可以引用多个文件。发送时，每个引用在 host 侧序列化：文件文本内容被内联进提示词，形如 `<file path="...">...</file>`，因此模型收到的是实际内容，而不仅仅是路径。

交互细节：查询按不区分大小写的纯子串过滤（basename 前缀 → basename 包含 → 路径包含，无模糊层级）。每个菜单行带 `📄` 图标、文件 **basename**（页面冲突时带 ` (dir)` 后缀），目录显示在描述列。输入框的引用 chip 显示 `📄 ` 加 basename，按 canvas 实测宽度尾部省略，确保标记与名称前部字符在 chip 的固定宽度单元格内始终可见（否则 CSS 会切掉中间随机一段）。每个会话首次拉取列表后，后续每次按键都在本地过滤已定稿的快照（ui-skill 缓存模式），细化搜索无需等待网络；超过 `maxListed` 的大目录树回退为每次按键的服务端排序。

插件运行于**原生** deepseek-harness 之上——它不拥有的菜单行为保持管线设计：菜单保持设计宽度、无匹配查询会关闭菜单、CJK 字符后直接跟 `@` 不打开触发菜单（先输入空格，例如 `请读取 @文件`）。

## 工作原理

- **Host 半**（`src/index.ts`）：在 Web GUI 服务器（`ctx.webServer`）上注册两个同源路由：
  - `GET /chat-filemention/search?session=<id>&q=<query>` — 遍历会话 cwd（有边界、有忽略清单、按 cwd 单飞缓存），返回列表（空查询：上限 `maxListed`，带 `complete` 标志，客户端据此转为本地过滤）或排序后的 top 匹配（非空查询：超大目录树的客户端回退方案）。
  - `GET /chat-filemention/read?session=<id>&path=<relative>` — 返回单个文件的文本，限定在会话 cwd 内（词法 + realpath 逃逸检查）、大小受限、拒绝二进制。
- **浏览器半**（`src/client/index.ts`）：在 input-trigger 管线（`ctx.inputTriggers`）上注册 `@` 来源 `file`。首次交互（或 scope 诞生时的 `warm`）为每个会话拉取一次列表；随后候选在本地过滤已定稿的快照，仅当列表被截断时才回退到服务端。选中后插入 `ReferenceInsert` occurrence（完整路径经由以候选 key 索引的侧表携带，因为菜单按显示名作为行 key）；来源 codec 的 `serialize` 在提交时内联文件内容，读取失败会阻止发送（绝不会静默降级为裸 `@path`）。
- 会话 cwd 由其活体 Agent（`ctx.agents`）解析；没有活体 Agent 的会话返回 404（输入框总是面向打开的会话）。两个路由都拒绝跨域浏览器请求（Origin/Host 不匹配）。

需要 `dsh web` profile：插件声明 `inject: ['agents', 'webServer']`，因此在不含 Web GUI 服务器的 profile 中组合该插件时，fiber 会等待注入。

## 配置

| Key | Type | Default | Description |
|---|---|---|---|
| `maxResults` | `number` | `20` | 单次服务端（回退）搜索返回的最大菜单候选数。 |
| `maxListed` | `number` | `5000` | 客户端为本地过滤缓存的最大列表行数；更大的目录树回退为按键级服务端搜索。 |
| `maxFileBytes` | `number` | `131072` | 单个引用内联的最大文件字节数。 |
| `maxWalkEntries` | `number` | `20000` | 每次 cwd 扫描访问的最大条目数（文件 + 目录）。 |
| `cacheTtlMs` | `number` | `3000` | 每个 cwd 遍历缓存的存活毫秒数。 |
| `ignoreDirs` | `string[]` | `node_modules`, `.git`, … | 遍历完全跳过的目录 basename。 |

## 重新启用以比较

请先实际使用 dsh 原生 `@`。仅在需要比较或验证“发送时内联文件全文”时重新启用本插件：

```sh
dsh plugin --profile <name> add @neplich/dsh-chat-filemention   # 或本地路径：./packages/feature/dsh-chat-filemention
dsh web --profile <name>
```

然后在输入框中输入 `@`，从 **文件** 分组中选择文件。

再次停用：

```sh
dsh plugin --profile <name> remove @neplich/dsh-chat-filemention
```

## 开发

使用仓库根部的多插件工作区构建：`pnpm run build` 产出 `lib/`（tsc），`pnpm --filter @neplich/dsh-chat-filemention run bundle` 产出浏览器 bundle `lib/client.js`（tsdown），`pnpm run test` 运行包级 vitest 套件。对未发布的 `@deepseek-ai/dsh-client-*` / `dsh-host-webserver` 包的类型级依赖在 `devDependencies` 中以 `link:` 指向本地 deepseek-harness checkout——checkout 在其他位置时请调整这些路径；发布产物运行时不需要它们（host 值导入只有 cordis + schemastery，浏览器 bundle 自包含）。

## Model Experience

无工具、无 system-prompt 变更。一条用户手势驱动的上下文路径：每个选中的文件引用向该条用户消息追加一个包含文件全文（上限 `maxFileBytes`）的 `<file path="...">` 块。内容在发送时获取，因此模型看到的是提示词发出时文件的状态。后续消息中重复引用同一文件会重新内联当时的最新内容；跨轮的提示缓存除消息自身文本外不受影响。

## 已知限制与后续工作

- **仅 Web GUI** —— TUI/ACP 入口没有 `@` 菜单（mention 管线是浏览器功能）；其他入口手打的 `@path` 作为字面文本发送，不做内容注入。
- **仅活体会话** —— 候选与读取都经由会话的活体 Agent 解析；没有活体 Agent 的会话返回 404，文件分组为空（原生管线会关闭菜单）。
- **无 Tab 路径补全** —— Tab 仲裁与补全钩子需要改动 input-trigger 管线的冻结跨包契约；按插件集规则（降级，绝不 fork harness）该功能被放弃。输入路径分段可以同样方式收窄菜单。
- **`@` 前需要边界** —— 管线的词边界规则（由 `user@host`/URL 测试钉住）把 `@` 前的 CJK 字符视为词中，因此 `请读取@文件` 不会打开菜单；请先输入空格。修改该规则属 harness 所有。
- **菜单宽度与无匹配关闭是管线设计** —— 菜单保持设计宽度上限；零匹配查询关闭菜单而非显示「无匹配」行；两者均由原生管线文档化的设计决定。
- **chip 无法显示任意长的名称** —— 输入框的引用 chip 是固定 4em 单元格（约 57px 标签窗口），其推进宽度必须与 textarea 的 U+FFFC 推进宽度完全一致；加宽会导致 chip 之后每个字形漂移。该对齐设计属 harness 所有，因此标签被预先省略以适配（如 `📄 getti…`）；完整路径在选择时仍可见于菜单和剪贴板投影（`@path`）。
- **缓存列表可能过期** —— 会话列表拉取后新建/删除的文件，只在缓存重置后（新会话或连接重置）出现/消失；超过 `maxListed` 的目录树始终实时服务端排序。
- **无 `.gitignore` 支持** —— 遍历只遵循配置的 `ignoreDirs` basename 清单。
- **仅文本文件** —— 二进制文件在读取时被拒绝（发送被阻止并说明原因）；超过 `maxFileBytes` 的大文件被拒绝而非截断。
- **回环信任模型** —— 路由依赖开发服务器的回环绑定加上 Origin 栅栏；把服务器绑定到 `0.0.0.0` 会把工作区文件读取暴露到网络。
