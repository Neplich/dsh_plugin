# dsh-chat-navigator

[English](README.md) · 中文版

dsh Web GUI 插件：紧贴中栏左边缘的窄型对话轨道——每轮用户请求对应一条短横线标记——帮你快速理解长对话结构，并跳转到任意一轮。

**建议搭配 [dsh-chat-autoload](../dsh-chat-autoload/README.zh-CN.md)**：有 `chatAutoload` 服务时，轨道索引始终覆盖完整历史。没有它轨道也能正常工作——只索引当前已加载的窗口，轨道上的「…」提示表示还有更早历史（手动加载更早消息或安装 dsh-chat-autoload 后自动补全）。

## 功能

- **轮次标记**：每一轮「用户请求 + 后续助手响应」对应一条左对齐短横线（思考、工具调用不单独生成标记）。标记紧凑成簇、整体垂直居中；会话不足两轮时不显示，避免视觉噪音。
- **滚动联动**：当前阅读位置所在轮次的标记保持高亮，随滚动自动切换。
- **鱼眼悬停**：悬停的标记长度翻倍，相邻标记按距离递减。
- **预览卡片**：悬停或键盘聚焦标记时浮出卡片，显示你的请求摘要（加粗主文本）、助手回复摘要（次要文本）和轮次状态——运行中显示与聊天区「Deep diving...」同款的扫光「运行中…」。手动停止或平台侧结束的轮次按已完成处理——没有「失败」标记。摘要是现有消息文本的确定性截取：不调用模型、不改上下文、不落盘。
- **点击跳转**：点击标记或卡片，聊天区滚动到对应用户消息并短暂高亮该行。
- **会话绑定**：索引严格从当前会话快照重建；切换会话即重置，页面刷新或恢复历史会话后从同一份 session 数据重新推导。

## 无障碍与主题

- 每个标记都是带 `aria-label`（轮次号 + 标题）的真实按钮；轨道是带标签的 `navigation`  landmark；焦点环可见；Enter/Space 跳转，Escape 关闭卡片。
- 通过 `--dsw-*` 令牌适配深色、浅色主题；支持 `prefers-reduced-motion`（扫光和高亮动画退化为静态）。

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-chat-navigator
# 可选，让历史始终完整：
dsh plugin --profile <name> add @neplich/dsh-chat-autoload
```

## 卸载

```sh
dsh plugin --profile <name> remove @neplich/dsh-chat-navigator
```

本插件不写文件、不写 settings 字段，卸载无残留。dsh-chat-autoload 可单独保留。

## 模型体验

无：插件不发送模型请求、不修改 session 日志、不新增工具。摘要完全由现有 session 数据确定性截取渲染。
