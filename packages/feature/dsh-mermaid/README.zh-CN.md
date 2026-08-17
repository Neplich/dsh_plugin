# @neplich/dsh-mermaid

中文 · [English](README.md)

一个 dsh Web GUI 插件：把会话中的 ```` ```mermaid ```` 代码块渲染成 SVG 图表（而不是纯代码块），并提供全屏缩放查看器，方便阅读复杂图表。

## 功能

- **图表卡片**：所有已完成的 mermaid 代码块（助手消息、工具卡片、详情面板）都会渲染为图表卡片；原始源码通过「查看源码」一键切换，渲染失败时自动回退为显示源码和错误信息。
- **全屏查看器**：单击图表（或展开图标）打开查看器，支持以光标为不动点的滚轮缩放、拖拽平移、放大/缩小、适应窗口，以及 Esc / 关闭图标 / 点击空白处关闭。
- **主题与语言跟随**：图表跟随 GUI 的明/暗主题（mermaid `default`/`dark`），所有可见文案跟随 dsh 界面语言（中/英）。
- **安全渲染**：mermaid 以 `securityLevel: 'strict'` 运行；引擎是插件宿主半通过同源回环路由提供的自包含 UMD 包——不依赖 CDN，可离线使用。

## 工作原理

markdown 渲染管线没有代码块的扩展插槽，因此浏览器半采用纯 DOM 升级：用 MutationObserver 扫描 `.md-code-block`，从横幅的语言标记读取代码块语言，把 mermaid 块替换为图表卡片。流式输出中的代码块在落稳（shell 此时才标注语言）之前不做处理。宿主半从插件自身依赖中读取 `mermaid/dist/mermaid.min.js`，通过 `GET /dsh-mermaid/mermaid.min.js`（仅回环、同源）提供，因此客户端 bundle 保持很小。

## 配置

无配置项。

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-mermaid
dsh --profile <name> web
```

从本仓库源码安装：

```sh
pnpm install && pnpm run build
dsh plugin --profile <name> add ./packages/feature/dsh-mermaid
```

宿主半依赖 `ctx.webServer`，请安装在通过 `dsh web` 启动的 profile 中。

## 卸载

```sh
dsh plugin --profile <name> remove @neplich/dsh-mermaid
```

插件不写任何文件、不改任何 settings；移除 bundle 即完成全部清理。停用插件会移除所有图表卡片并原位恢复代码块。

## 模型体验

无。插件只改变 Web GUI 对 mermaid 代码块的呈现方式，不新增工具、提示词段落或事件，模型可见的会话文本不受影响。
