# @neplich/dsh-config-instructions

dsh Web GUI 插件：在设置面板中新增「指令文档」分区，查看并编辑各层级的 AGENTS.md 指令文档。

## 功能

- 「个人 / 项目」横向切换：个人级 = `~/.dsh/AGENTS.md` + `~/.dsh/AGENTS.local.md`；项目级 = `<项目根>/AGENTS.md` + `<项目根>/AGENTS.local.md`
- 项目页带项目根下拉（按工作区排序）
- 在线编辑、保存（原子写）、未创建时可一键创建
- CLAUDE.md / CLAUDE.local.md 若存在则以只读方式展示
- 保存即时生效：进行中的会话会收到指令更新提示，新会话直接加载
- 子目录级 AGENTS.md 不在此管理——它随 Agent 探索目录层级渐进式加载

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-config-instructions
dsh web --profile <name>     # 插件集变化需重启生效
```

仅在 `dsh web` profile 中可用（依赖 `ctx.webServer`）。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `maxFileBytes` | 524288 | 单个指令文件的读写上限 |
| `maxBodyBytes` | 1048576 | 写入请求的 JSON body 上限 |

## 安全

全部路由仅接受同源请求；项目级写入校验 root 必须来自工作区注册表；仅 AGENTS.md / AGENTS.local.md 可写，路径由服务端推导。
