# @neplich/dsh-agent-imagevault

[English](README.md)

工具结果图片的归档与聊天流展示。两件独立的事：

1. **归档**——任何工具结果（截图、`read_image`、用户上传……）里的图片块，都会从持久附件库复制成普通文件放进导出目录。与来源无关：任何产生图片的工具都覆盖。
2. **展示**——一个回环 HTTP 服务器按 `GET /sha256:<hex>.<ext>` 直接从内容寻址附件库读字节，让每张会话图片都有稳定 URL，寿命与会话历史一致。Web GUI 的 Markdown 渲染器接受 http(s) 图片直链，智能体嵌入链接（`![截图](http://127.0.0.1:9335/sha256:….png)`）即可在聊天流中显示图片。

另注册一个工具：`imagevault_dir`，返回展示 URL 的拼法与导出目录。

## 为什么不直接用文件？

会话图片（用户上传和工具截图）本就持久存在 `$DSH_HOME/attachments/v1/objects/` 的内容寻址附件库里，寿命与会话历史一致。展示 URL 直接从这里读，零冗余，链接不会被临时目录清理打断。导出的普通文件只是本地打开的便利副本，放在系统临时目录，被清理也不影响聊天展示。

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-agent-imagevault
```

## 配置（cordis.yml）

| 键 | 默认值 | 含义 |
|---|---|---|
| `port` | `9335` | 展示 HTTP 服务的回环端口 |
| `exportDir` | `<系统临时目录>/dsh-image-vault` | 归档图片文件的保存目录 |
| `storeDir` | `$DSH_HOME/attachments/v1/objects` | 本地附件后端的对象根目录 |

## 卸载

```sh
dsh plugin --profile <name> remove @neplich/dsh-agent-imagevault
```

移除插件会停止展示服务器与归档监听。产物说明：

| 产物 | 默认位置 | 清理方式 |
|---|---|---|
| 归档图片文件 | `<系统临时目录>/dsh-image-vault/` | 交给系统临时目录清理，或手动删除 |
| 附件库对象 | `$DSH_HOME/attachments/` | **不动**——那是附件服务持有的共享会话数据，不属于本插件 |

## 已知限制

- 展示路由读取的是**本地**附件后端的文件布局（`objects/<hex[:2]>/<hex>`）；挂载非本地后端时返回 404（归档仍走公开的 `readImage` 契约，不受影响）。
- 归档文件是副本——删除它们不影响会话自身的图片。
