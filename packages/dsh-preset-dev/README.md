# @neplich/dsh-preset-dev

dsh agent preset 安装插件：把「开发模式」（dev）agent preset —— 标准编码 Agent 的全部能力 + cordis 工具集（活体运行时检查与实验）—— 安装到用户预设根目录。

## 功能

- 安装 `dev`（开发模式）agent preset：`agent.cordis.yml`（standard 全量 + 末尾 `tool-cordis` 行）、`preset.yml`（name: 开发模式，order: 5）
- 随包携带 `editing-cordis-compositions` 技能（preset 的 `customSkillDirs` 指向包内 skills 目录的副本，`baseUrl` 相对 preset 所在目录解析）
- **幂等安装**：目标已存在时不覆盖（保留本地编辑）；`DSH_PRESET_DEV_FORCE=1` 强制刷新为包内版本
- 启动时自动安装；roster 每次重读磁盘，安装后立即可见（`trust: user`）

## 配置

无配置项。环境变量：

| 变量 | 作用 |
|---|---|
| `DSH_PRESET_DEV_FORCE=1` | 启动时强制用包内版本覆盖已安装的 preset 副本 |

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-preset-dev   # npm 发布后
# 或本地开发：dsh plugin --profile <name> add ./packages/dsh-preset-dev
```

重启 dsh 后，预设选择器中可见「开发模式」。

## 卸载

```sh
dsh plugin --profile <name> remove @neplich/dsh-preset-dev
```

已安装的 preset 文件**不会**被自动删除（你可能正在使用该模式）；如需清理：

```sh
rm -rf ~/.dsh/.agent-presets/dev
```

## 升级 / 刷新

已安装的 preset 文件是独立的（可能被本地编辑）。包升级后，用以下任一方式刷新：

```sh
DSH_PRESET_DEV_FORCE=1 dsh --profile <name>   # 强制覆盖为包内版本
# 或删除 ~/.dsh/.agent-presets/dev 后重启
```

## 注意事项

- dev preset 内含 `tool-cordis`（cordis 工具集），其 Inspect Provider 注册在进程级单例注册表上：**同一进程内不要同时挂载 cordis（创造模式）与 dev（开发模式）**。
- 插件本身在 host 平面运行，只负责落盘文件，不注册模型工具；模型可见影响全部来自被安装的 preset 本身。

## Model Experience

本插件不注册模型工具、提示段或事件。安装后，dev 会话的工具列表中多出 `cordis_inspect_list` / `cordis_inspect_query` / `cordis_inspect_self` / `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine`，技能目录中多出 `editing-cordis-compositions`。
