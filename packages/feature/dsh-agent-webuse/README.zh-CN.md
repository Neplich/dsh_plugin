# @neplich/dsh-agent-webuse

[English](README.md)

面向 dsh 智能体的浏览器操作（computer-use 风格）工具：由 Playwright 驱动的自动化 Chrome，模型可以导航、检查、点击、输入和截图。

## 功能

十二个模型可见工具，由一个常驻驱动进程持有同一个 Chrome 实例：

| 工具 | 作用 |
|---|---|
| `webuse_launch` | 启动（或连接）自动化浏览器 |
| `webuse_navigate` | 打开 URL，可选新标签页 |
| `webuse_snapshot` | 给页面可交互元素编号（编号在下次导航前有效） |
| `webuse_click` / `webuse_fill` | 按编号点击 / 输入 |
| `webuse_press` / `webuse_scroll` / `webuse_back` | 键盘、滚动、历史后退 |
| `webuse_tabs` | 列出 / 切换 / 新建标签页 |
| `webuse_eval` | 在页面里执行 JavaScript 提取数据 |
| `webuse_screenshot` | PNG 截图经附件服务进入模型上下文 |
| `webuse_close` | 关闭浏览器与驱动 |

浏览器**默认有头**，你可以实时看着智能体操作。元素编号钉在活 DOM 上（`data-dsh-webuse-idx` 属性），页面变化前跨工具调用保持有效。

### 截图降级

`webuse_screenshot` 在无图片能力的部署上不会硬报错：

- **正常路径**——PNG 经持久附件服务提交，以图片块返回，模型直接可见。
- **降级路径**——附件服务未挂载、或当前路由模型不支持图片输入时，PNG 改存临时文件，结果带文件路径和页面文字摘要（前 3000 字符），模型保留文字"视野"，用户也有文件可打开。

## 环境要求

- macOS/Linux/Windows，装有 Chrome 兼容浏览器（通过 Playwright `channel` 配置定位，默认 `chrome`）。
- `playwright-core` 是运行时依赖，随插件安装；不下载浏览器二进制。

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-agent-webuse
```

## 配置（cordis.yml）

| 键 | 默认值 | 含义 |
|---|---|---|
| `port` | `9334` | 驱动 HTTP 服务的回环端口 |
| `headless` | `false` | 无头模式运行 Chrome |
| `channel` | `chrome` | 定位浏览器的 Playwright channel |
| `profileDir` | `$DSH_HOME/webuse/chrome-profile` | Chrome 用户数据目录（Cookie、登录态存这里） |
| `viewportWidth` / `viewportHeight` | `1280` / `800` | 浏览器视口 |
| `fallbackDir` | `<系统临时目录>/dsh-webuse-fallback` | 降级截图的保存目录 |

## 卸载

```sh
dsh plugin --profile <name> remove @neplich/dsh-agent-webuse
```

移除插件会停止驱动与浏览器。插件写入的产物**不会**自动清理：

| 产物 | 默认位置 | 清理方式 |
|---|---|---|
| Chrome 用户数据（Cookie、登录态） | `$DSH_HOME/webuse/` | 手动删除目录 |
| 降级截图 | `<系统临时目录>/dsh-webuse-fallback/` | 交给系统临时目录清理，或手动删除 |

## 已知限制

- 每次插件加载对应一个浏览器实例，所有工具调用串行执行。
- `webuse_snapshot` 的元素编号在导航或 DOM 变化后失效——操作前重新取快照。
- 截图在 Web GUI 聊天流中的展示是另一件事；需要稳定的聊天可渲染图片 URL 时配合 `@neplich/dsh-agent-imagevault` 使用。
