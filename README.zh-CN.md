# dsh_plugin

[English](README.md) · 中文版

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件集合仓库。`packages/` 下的每个包都是一个可安装的 dsh 插件；本仓库只是把它们放在一起管理——它本身不是插件。

## 目录结构

```
packages/
  agent/                 agent 策略与预设插件
  feature/               功能插件：模型适配器、Web GUI 设置分区、输入框与界面功能
  <group>/dsh-<name>/    每个目录一个插件，命名 dsh-<作用区间>-<插件名>（如 dsh-chat-filemention；作用区间：agent | chat | config | web，插件名无连字符），发布为 @neplich/dsh-<name>
    package.json         npm manifest + dsh.bundle 声明
    cordis.patch.yml     profile 安装该 bundle 时应用的层
    src/index.ts         function plugin：name / inject / Config / apply
    README.md            英文文档
    README.zh-CN.md      中文文档（顶部互链）
    tests/               包级 vitest 测试
```

一个包通过在 manifest 中声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 成为可安装的 **bundle**；patch 行按名称引用包，Node 解析即可找到已安装的构建产物。完整的 bundle/profile 模型参见官方教程 [Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)。

## 插件清单

### Agent 插件

| 包 | 描述 | README |
|---|---|---|
| `@neplich/dsh-agent-presetdev` | Agent preset 安装器：把「开发模式」(dev) preset —— 标准编码 Agent 加 cordis 工具集 —— 安装到用户预设根目录；内置「先动态验证、后沉淀」开发策略（默认用动态 Cordis 插件快速验证，确认后再沉淀到插件仓库） | [README](packages/agent/dsh-agent-presetdev/README.md) |

### 功能插件

| 包 | 描述 | README |
|---|---|---|
| `@neplich/dsh-chat-autofold` | Web GUI 插件：assistant 开始输出正文时，自动把正文之前的思考与工具调用记录折叠到一条常驻展开/收起条之后（条文案随 dsh 界面语言中英双语） | [README](packages/feature/dsh-chat-autofold/README.md) |
| `@neplich/dsh-chat-filemention` | Web GUI 插件：输入框中的 `@` 文件引用（本地缓存子串过滤、图标标记 chip、多文件引用）；被引用文件以内联 `<file path="...">...</file>` 形式进入提示词 | [README](packages/feature/dsh-chat-filemention/README.md) |
| `@neplich/dsh-web-workpanel` | Web GUI 插件：右侧工作面板（Option/Alt+J），支持文件/终端混合标签、保留状态的文件浏览、交互式 PTY，以及按需加载的 PDF.js 与 OOXML Office 预览；界面随 dsh 语言中英双语 | [README](packages/feature/dsh-web-workpanel/README.md) |
| `@neplich/dsh-chat-mermaid` | Web GUI 插件：把 mermaid 代码块渲染为 SVG 图表卡片（可切换源码），并提供全屏缩放查看器（滚轮缩放/拖拽平移）；图表跟随明暗主题，界面随 dsh 语言中英双语，引擎经回环路由提供、不依赖 CDN | [README](packages/feature/dsh-chat-mermaid/README.md) |
| `@neplich/dsh-config-skills` | Web GUI 插件：「技能」设置分区——个人（`~/.dsh`/`~/.agents`）与项目（`<root>/.dsh`/`<root>/.agents`）技能的只读浏览器，带来源徽章与同名覆盖关系（界面随 dsh 语言中英双语） | [README](packages/feature/dsh-config-skills/README.md) |
| `@neplich/dsh-config-instructions` | Web GUI 插件：「指令文档」设置分区——查看与编辑个人及项目根的 AGENTS.md / AGENTS.local.md（原子写、即时生效；界面随 dsh 语言中英双语） | [README](packages/feature/dsh-config-instructions/README.md) |
| `@neplich/dsh-config-mcp` | Web GUI 插件：「MCP 服务」设置分区——实时服务器状态、增删改查写入用户级 cordis.patch.yml 并自动 HMR 热重载（界面随 dsh 语言中英双语） | [README](packages/feature/dsh-config-mcp/README.md) |
| `@neplich/dsh-chat-annotations` | Web GUI 插件：在历史助手回复中框选文字并作为待发送注释附加到输入框，随下一条消息一起发送（消息持续高亮、计数胶囊、详情浮层；界面随 dsh 语言中英双语） | [README](packages/feature/dsh-chat-annotations/README.md) |

三个 config 插件通过 `packages/feature/dsh-config-shared`（`@neplich/dsh-config-shared`）共享代码，这是一个构建时内联的内部库——本身不是插件。其共享的 scope 组件文案以字典形式发布（`sharedScopeZh`/`sharedScopeEn`），各消费插件 spread 进自己的 locale namespace。

每个完成的插件都会在包目录下提供英文 `README.md` 与对应的中文 `README.zh-CN.md`（顶部互链），描述其功能（功能说明、配置、安装）；上表链接到英文版。表格必须与 `packages/` 保持同步：任何插件的新增、删除或重大更新，都必须同一次改动中更新插件 README 与本表格。

## 命令

```sh
pnpm install     # pnpm workspaces，node ^22.19 || >=24
pnpm run build   # tsc project-references 构建，产出 packages/<group>/*/lib
pnpm run test    # vitest
pnpm run clean   # 清理构建产物
```

## 新增插件

1. 创建 `packages/<group>/dsh-<name>/`（插件统一命名为 `dsh-<作用区间>-<插件名>`——作用区间取 `agent`/`chat`/`config`/`web`，插件名为无连字符的一段，如 `dsh-chat-filemention`；目录名必须与包后缀一致；agent 策略与预设插件放 `agent/`，LLM 适配器、Web GUI 与其他功能插件放 `feature/`），包含 `package.json`（`name: @neplich/dsh-<name>` 加 `dsh.bundle` 声明）、`src/index.ts`、`tsconfig.json`、`tests/`、`README.md` 与 `README.zh-CN.md`。
2. 更新 `cordis.patch.yml` 中的插件行（`id` 与 `name`）以及 `src/index.ts` 中的 `name`。
3. 在根 `tsconfig.json` 的 references 中添加 `{ "path": "packages/<group>/dsh-<name>" }`。
4. 编写 `packages/<group>/dsh-<name>/README.md`（英文）与中文版 `README.zh-CN.md`（顶部互链），描述插件功能、配置与安装，并在上方 [插件清单](#插件清单) 中链接英文版。
5. `pnpm install && pnpm run build && pnpm run test`。

> **可安装性**：插件源码必须保证克隆后在任意环境下可直接安装构建。对 harness 包的依赖一律写 npm registry 的 semver 范围（与 `peerDependencies` 一致），禁止 `link:../../../deepseek-harness/...` 这类指向 sibling checkout 的路径；仓库内依赖使用 pnpm `workspace:` 协议。改动依赖后必须重新执行完整 `pnpm install`（不能只靠现有 `node_modules`）。

写代码前先用 `dsh-plugin-development` agent skill 与上游 [extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md) 确定扩展点——tool、hook、LLM adapter、command、能力缝——再动手。

## 本地试用插件

```sh
pnpm run build
dsh plugin --profile demo add ./packages/<group>/dsh-<name>   # 把 checkout 链接进 profile
dsh --profile demo                                   # 启动 profile
```

针对 deepseek-harness 源码 checkout 做活跃开发时，`--patch` 覆盖可以直接加载 `src/index.ts` 而无需构建；参见 [Your first plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)。

## 发布

`pnpm run build && pnpm -r publish --access public` 发布预构建的 `lib/`；使用者通过 `dsh plugin --profile <name> add @neplich/dsh-<name>` 安装。为提升可发现性，为本仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic。
