# @neplich/dsh-config-skills

[English](README.md) · 中文版

dsh Web GUI 插件：在设置面板中新增「技能」分区，只读浏览个人级与项目级的技能（Skills）。

## 功能

- 「个人 / 项目」横向切换：个人级 = `~/.dsh/skills` + `~/.agents/skills`；项目级 = `<项目根>/.dsh/skills` + `<项目根>/.agents/skills`（项目根 = 最近含 `.git` 的祖先目录）
- 项目页带项目根下拉：选项来自已注册工作区，按工作区排序（与侧边栏一致）
- 合并列表展示名称、描述、来源徽章（个人/项目 .dsh 或 .agents）、调用方式（仅手动 / 不可手动）与同名覆盖关系（低优先级来源标记「被覆盖」）；软链接形式的技能目录与 Markdown 单文件会和普通条目一样被发现
- 点击行展开查看完整 SKILL.md 文档
- 只读设计：技能内容以文件系统为准，目录变化由 dsh 自身 watcher 自动生效

## 国际化

全部界面文案（分区标题、导航项、来源徽章、状态提示）通过 `config-skills` locale namespace 提供中英双语，随 dsh 设置中的语言切换即时自适应。服务端返回的错误消息保持英文（协议层中立文案）。

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-config-skills
dsh web --profile <name>     # 插件集变化需重启生效
```

仅在 `dsh web` profile 中可用（依赖 `ctx.webServer`）。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `maxFileBytes` | 524288 | 单个 SKILL.md 的读取上限 |

## 安全

全部路由仅接受同源请求；项目级读取校验 root 必须来自工作区注册表；文件路径由服务端推导。

## 已知限制

- 技能为只读；新建/删除技能请直接操作目录（个人：`~/.dsh/skills` 与 `~/.agents/skills`；项目：`<项目根>/.dsh/skills` 与 `<项目根>/.agents/skills`，同名时 .dsh 优先）
