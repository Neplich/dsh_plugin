# dsh-codex-chatgpt

[English](README.md) · 中文版

一个 dsh LLM 适配器插件：驱动 **ChatGPT Codex 后端**（`chatgpt.com/backend-api/codex/responses`），消耗你的 **ChatGPT 订阅（Plus/Pro）Codex 额度** —— 不需要 OpenAI API key，也不按 token 计费。

它复用官方 Codex CLI 的登录：先执行一次 `codex login` 并用 ChatGPT 登录，本插件像 CLI 一样读取、刷新并回写 `~/.codex/auth.json`。

## 功能

- 在 dsh 的 Models 页面新增 `codex-chatgpt` 提供商，可像其他提供商一样选择。
- 新增独立的 **设置 → Codex** 页面，用于登录、查看账号状态和管理实时模型可见性。
- 通过与官方 Codex CLI 相同的 `/models` 目录发现当前账号可用模型。
- 通过 Responses API 支持文本流式输出、工具调用和思考（reasoning）输出，并翻译成 dsh 原生流协议。
- 自动刷新 token：access token 过期时通过 Codex CLI 同款 Auth0 端点换新，并把新 token 写回 auth 文件。
- 401 自动恢复：每次请求最多刷新一次并重试（与 Codex CLI 行为一致）。
- 限流与额度错误映射到 dsh 错误分类（`RATE_LIMIT`、`QUOTA`、`AUTH` 等）。

## 前置条件

- 有 Codex 权限的 ChatGPT 账号（Plus/Pro 套餐或开通了 Codex 的工作区）。
- 安装官方 Codex CLI 并用 ChatGPT 登录一次：

  ```sh
  brew install codex      # 或你的包管理器
  codex login             # 选择 "Sign in with ChatGPT"，完成浏览器流程
  ```

  这会生成 `~/.codex/auth.json`。插件从不索取你的密码，只使用 CLI 已持有的 token。

> 同一时间只应有一个消费者使用 refresh token：和 OpenClaw 的 token-sink 设计一样，ChatGPT 会轮换 refresh token，两个工具（如 Codex CLI 与本插件）同时刷新会互相登出。建议每个账号每台机器只用一个客户端。

## 安装

```sh
dsh plugin --profile <name> add /path/to/dsh_plugin/packages/feature/dsh-codex-chatgpt
# 或从 npm registry
dsh plugin --profile <name> add @neplich/dsh-codex-chatgpt
```

安装后打开 Web GUI 的 **设置 → Codex** 登录并选择要暴露的账号模型；随后可在 **设置 → Models** 和模型选择器中使用该提供商。

## 配置

所有字段都可选，可在 `cordis.yml` 的插件条目里配置。Codex 设置页仅开放账号登录和模型可见性；连接参数与默认思考预算保留为配置文件设置。

| 键 | 默认值 | 含义 |
|---|---|---|
| `authJsonPath` | `~/.codex/auth.json`（遵循 `CODEX_HOME`） | Codex CLI auth 文件路径 |
| `baseURL` | `https://chatgpt.com/backend-api/codex` | 端点基址；自动追加 `/responses` |
| `reasoningEffort` | 模型默认值 | `none` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max` \| `ultra`；`none` 关闭思考 |
| `maxTokens` | `64000` | 每次请求默认输出上限 |
| `defaultContextWindow` | `400000` | 所选模型无精确值时的上下文容量 |
| `models` | `gpt-5.6-sol`、`gpt-5.5`、`gpt-5.4`、`gpt-5.4-mini` | 仅在无法读取登录账号实时目录时使用的回退模型目录 |
| `enabledModels` | 账号全部模型 | 应用于账号实时目录的可选允许列表 |
| `clientVersion` | `0.147.0` | 获取账号模型目录时发送的 Codex 客户端版本 |
| `streamIdleTimeoutMs` | `300000` | 单次流读取的最长空闲时间 |
| `retryPolicy` | harness 默认 | 提供商侧请求重试策略 |

`cordis.yml` 示例：

```yaml
plugins:
  codex-chatgpt:
    reasoningEffort: high
    models:
      - id: gpt-5.4
        name: GPT-5.4
```

## 模型体验

- **模型**：实时读取已登录 ChatGPT 账号的可用模型；仅在实时发现不可用时使用一组可配置的回退目录。
- **思考**：思考输出以 `reasoning` 块呈现；每个模型可选择 `off` 或该模型声明支持的强度，未设置时沿用模型默认值。
- **工具调用**：完整支持；工具参数全程保持原始 JSON 字符串，符合 dsh 协议。
- **输入**：仅文本。图片块与 `stop` 序列会被拒绝（`UNSUPPORTED` 错误）。
- **流式**：后端发 delta 时按 token 流式输出，否则用完整条目兜底 —— 两种事件都不重复输出。
- **用量**：每次调用报告完成响应中的 token 数；计费由你的 ChatGPT 套餐 Codex 额度覆盖。

## 错误行为

- 无 auth 文件 / 缺 token → `MISSING_CREDENTIAL`，提示先执行 `codex login`。
- refresh token 被拒 → `AUTH`（重新 `codex login`）。
- 请求中途 401 → 自动刷新并重试一次；再次 401 报 `AUTH`。
- 429 / 529（过载）→ `RATE_LIMIT`，遵循 `Retry-After`；额度耗尽 → `QUOTA`。
- 流未以 `response.completed` 结束 → `STREAM_CLOSED`；流空闲 → `TIMEOUT`；调用方取消 → `ABORTED`。

## 已知限制与后续工作

- **ToS 灰色地带**：用订阅额度调用第三方客户端很常见（OpenClaw、CodexBar、langchain-codex-plus、deer-flow 都在做），但 OpenAI 原则上可能限制此类用法。请仅个人自用、控制用量。这是你自己的账号与机器。
- **内部端点**：`chatgpt.com/backend-api` 不是公开文档化的 API，可能变化；插件遵循 Codex CLI 自身协议（对照 `openai/codex` 源码核实）并对瞬时故障重试。
- **共享登录态**：内置 PKCE 登录与 `codex login` 共用 Codex CLI auth 文件，并发刷新可能互相轮换 refresh token。
- **无原生回放状态**：重试时从历史重建请求（无状态），因此不发射 `finish.replayState`。
- **auth 文件同步**：Codex CLI 与本插件同时使用会互相轮换 refresh token，见上文前置条件说明。

## 开发

```sh
pnpm run build   # tsc project references
pnpm run test    # vitest（单元测试，不调用真实 API）
```

真实冒烟测试需要真实的 `~/.codex/auth.json` 与 ChatGPT 账号：在 dsh profile 中运行插件，然后在 Web GUI 发一条请求。

## 实现结构

| 模块 | 文件 |
|---|---|
| 插件入口、配置 schema、设置区 | `src/index.ts` |
| 适配器（fetch、401 恢复、错误映射） | `src/adapter.ts` |
| auth 文件读取/刷新/写回（单飞并发） | `src/auth.ts` |
| 请求序列化（Messages → Responses API） | `src/serialize.ts` |
| SSE 解析 | `src/sse.ts` |
| SSE 事件 → `StreamChunk` 翻译 | `src/translate.ts` |
