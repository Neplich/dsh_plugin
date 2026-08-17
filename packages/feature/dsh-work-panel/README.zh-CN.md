# @neplich/dsh-work-panel

中文 · [English](README.md)

Web GUI 插件：为 dsh 浏览器界面提供右侧**工作面板**，视觉与交互参考 Codex Desktop 右栏。通过会话头部 `Session log` 右侧的开关按钮（或全局快捷键 `Option+J` / `Alt+J`）打开停靠在右侧的面板，内含两个工具：

- **文件**——左侧文件预览、右侧可筛选懒加载目录树的分栏工作区。目录树按钮可隐藏或恢复目录树，让预览占满当前标签；Markdown 可切换渲染预览与纯文件源码面，其他文本也使用同一源码面，不显示对话样式的语言标题、复制栏、卡片或气泡。常见图片格式内联显示；PDF 使用完整 PDF.js 查看栈，支持翻页、缩放、搜索、文字选择、表单和下载。现代 Office 文件（`.docx`、`.xlsx`、`.pptx`）通过 OOXML WASM/Canvas 查看器直接在浏览器内渲染，支持文档/幻灯片导航、工作表切换、缩放与适应宽度。两类查看器都只在打开对应文件时加载。每个文件工作标签各自记忆目录树显隐、筛选词、展开目录、打开文件与预览模式。
- **终端**——在会话工作目录中通过 harness 的 subprocess 能力打开的交互式 PTY（xterm.js）。每个终端工作标签拥有独立进程与输出缓冲。进程退出后可一键重启。

标签栏属于整个工作面板，不属于某个工具。文件和终端标签可以混排，可用鼠标或方向键切换并独立关闭。标签、新建标签与面板控制共用最顶部的单行栏，不再保留重复的工具标题行。点击 `+` 会打开只有“文件、终端”的选择页，不会移除已有标签。切换标签、关闭重开面板或切换会话都会保留各文件视图和终端进程；重新挂载终端时回放保留的输出。

面板停靠在 shell 的全局悬浮层右侧，因此无需修改 dsh 本体即可在原版安装中运行。打开面板时会覆盖会话区的右侧，而不会改变 shell 的列布局；切换工具不会改变面板宽度。从左边缘拖拽调宽（或将焦点移到拖拽柄上用方向键调整），面板头部提供展开/恢复按钮。窗口宽度低于自动收起断点时，面板会自动收起，优先保证会话区可用。面板与 shell 自带的工具详情栏共用右边缘、互斥存在：打开其中一个会关闭另一个，因此现有工具详情始终可以访问。

所有文案随 dsh 界面语言切换（中文/English），颜色全部取自 `--dsw-*` 主题 token（深色、浅色主题均正常），过渡动画控制在 150–300ms 并遵循 `prefers-reduced-motion`，每个图标按钮都有 tooltip、`aria-label` 和可见的焦点态。

## 工作方式

host 半在 Web GUI 服务器（`ctx.webServer`）上注册六个同源 HTTP 路由和一个 WebSocket 路由：

| 路由 | 用途 |
|---|---|
| `GET /work-panel/list?session=<id>&path=<rel>` | 列出一个目录的直接子项（目录在前），限制行数，约束在会话 cwd 内 |
| `GET /work-panel/read?session=<id>&path=<rel>` | 读取一个文本文件内容，限制大小，拒绝二进制 |
| `GET /work-panel/raw?session=<id>&path=<rel>` | 输出允许的图片、PDF 或现代 Office 文件用于内联预览，限制大小 |
| `GET /work-panel/pdfjs/*` | 输出白名单内的 PDF.js 运行时、Worker、Viewer、字体、字符映射、WASM 与图片资源 |
| `GET /work-panel/ooxml/*` | 输出白名单内的 OOXML 查看器模块与解析器 WASM 资源 |
| `POST /work-panel/terminal/close?session=<id>&terminal=<id>` | 关闭一个终端标签对应的 PTY |
| `WS /work-panel/terminal?session=<id>&terminal=<id>&cols=<n>&rows=<n>` | 一个终端标签的交互式 PTY 流 |

会话 cwd 优先取 live Agent，其次取内存中的会话头（空白会话尚无 Agent，但已带有工作区）。路径同时做词法与 realpath 双重约束，所有路由拒绝跨域浏览器请求（Origin/Host 校验）。

终端池按 GUI 会话 id 与终端标签 id 管理 PTY（`ctx.subprocess.spawnTerminal`）。WebSocket 可自由断开重连；每个 PTY 的环形缓冲（`terminalScrollbackBytes`）保留最近输出用于回放。关闭标签只终止对应 PTY；关闭会话会终止该会话的全部 PTY；插件卸载会清理整个终端池。

client 半注册到两个 slot：面板本体进 `shell.overlay`，开关按钮进 `conversation.session.header.utilities`，顺序位于 `Session log` 之后。面板状态（开关、宽度、按会话保存的混合标签栏，以及每个文件标签的浏览状态）保存在一个 root 作用域的 slot store 中。

## 配置项

| 键 | 类型 | 默认值 | 用途 |
|---|---|---|---|
| `maxListEntries` | natural | `2000` | 单次目录列表的最大行数 |
| `maxFileBytes` | natural | `262144` | 文本预览的最大文件字节数 |
| `maxImageBytes` | natural | `10485760` | 图片、PDF 或现代 Office 预览的最大字节数（保留旧键名以兼容现有配置） |
| `terminalScrollbackBytes` | natural | `524288` | 每个终端标签保留的输出（回放来源） |
| `terminalGraceMs` | natural | `4000` | PTY 从 TERM 到 KILL 的清理宽限 |
| `shell` | string | `''` | 终端 shell 可执行文件；为空时读 `$SHELL`，再回落 `/bin/bash` |

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-work-panel   # 或本地路径：./packages/feature/dsh-work-panel
dsh web --profile <name>
```

然后打开任意会话，点击会话头部的面板按钮，或按 `Option+J`（macOS）/ `Alt+J`。

## 卸载

```sh
dsh plugin --profile <name> remove @neplich/dsh-work-panel
```

插件不写任何文件和 settings：移除包即完成全部清理。存活 PTY 在插件卸载时终止。

## 开发

在仓库根的多插件工作区中构建：`pnpm run build` 产出 `lib/`（tsc），`pnpm --filter @neplich/dsh-work-panel run bundle` 产出浏览器 bundle `lib/client.js`（tsdown；react 与平台 client 库经 GUI 模块表解析，xterm 内联），`pnpm run test` 运行包级 vitest 测试。PDF.js 与 OOXML JS/WASM 资源不进入客户端首屏包，只在打开对应文件时从插件同源路由加载。

## Model Experience

无：不提供工具、不改系统提示、不产生会话事件。面板是面向人的 UI；终端输入输出与文件预览都不会进入模型上下文。

## 已知限制与后续工作

- **PTY 不可改尺寸。** subprocess 能力在创建时确定终端行列数；xterm 界面会贴合面板宽度，但 shell 自身的换行宽度保持创建时的值，重启终端后采用当前尺寸（全屏 curses 应用如 vim、htop 建议在面板调整到目标宽度后再启动）。seam 级 resize 需要 harness 本体贡献。
- **回放保真度。** 关闭面板会销毁浏览器侧 xterm；重开时回放 host 保留的缓冲（受 `terminalScrollbackBytes` 上限约束）。超出上限的早期输出丢失，长跑的全屏应用在回放后画面可能有装饰性差异；进程本身不受影响。
- **标签信息保存在浏览器内存。** 切换标签、关闭重开面板、切换会话都会保留文件/终端混合标签和 PTY；完整刷新浏览器页面会重建可见标签栏，host PTY 仍会在 dsh 会话关闭或插件卸载时清理。
- **PDF 编辑不会落盘。** PDF.js 会渲染批注和交互表单，但工作面板不会把修改后的 PDF 写回工作区；下载按钮返回原文件。
- **Office 预览只读且按能力尽量还原。** `.docx`、`.xlsx`、`.pptx` 全部在本地渲染，不依赖 LibreOffice 或云服务。复杂宏、嵌入对象、少见字体和高级版式可能与 Microsoft Office 有差异；旧二进制格式 `.doc`、`.xls`、`.ppt` 不支持。
- **悬浮层定位。** 原版 dsh 为附加的全局界面提供 `shell.overlay`，但没有独立的右侧布局列，因此面板会悬浮覆盖会话区右侧，而不会让会话区缩窄。
