# @neplich/dsh-config-mcp

dsh Web GUI 插件：在设置面板中新增「MCP 服务」分区，完整管理 MCP 服务器。

## 功能

- 实时列出所有 MCP 服务器（来自 Cordis Loader 条目）：连接状态（运行中/连接中/失败/已禁用）、传输方式（stdio/http）、命令或地址摘要、已注册工具数
- 添加 / 编辑 / 删除「受管理」服务器（写入 `~/.dsh/cordis.patch.yml` 的 insert 行，AST 级编辑保留注释与其他行）
- 任意服务器可启用 / 禁用（外部来源服务器通过追加 `{ id, disabled }` 覆盖行实现）
- 保存后由 dsh 的 patch watch + HMR 自动热重载（断连重连），无需重启
- 支持字段：serverName、transport、command/args/env/cwd（stdio）、url/headers（http）、toolCallTimeoutMs、failOnStartupError

## 国际化

全部界面文案（分区标题、导航项、状态标签、表单、按钮、提示）通过 `config-mcp` locale namespace 提供中英双语，随 dsh 设置中的语言切换即时自适应。服务端返回的错误消息保持英文（协议层中立文案）。

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-config-mcp
dsh web --profile <name>     # 插件集变化需重启生效
```

仅在 `dsh web` profile 中可用（依赖 `ctx.webServer`）。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `maxBodyBytes` | 1048576 | 变更请求的 JSON body 上限 |

## 已知限制

- 编辑对话框不支持 `!!js` 表达式值（如需要请直接编辑 patch 文件）与 reconnect.* 字段
- 重命名 serverName 需删除后重新创建（工具命名空间与条目 id 绑定）
- 编辑/删除仅适用于用户级补丁文件管理的服务器；其他层提供的服务器仅可禁用
