# dsh-chat-autoload

[English](README.md) · 中文版

dsh Web GUI 插件：会话切换为当前会话时，自动把**完整历史**分页拉取到客户端——相当于替你点完所有「加载更早」——并对外提供 `chatAutoload` 服务，让其他插件可以依赖（或再次触发）这个行为。

## 背景

Web GUI 对长对话按每页 50 条分页加载。需要索引完整对话的功能（如 [dsh-chat-navigator](../dsh-chat-navigator/README.md)）依赖完整窗口。服务端对页大小没有上限，因此本插件只是驱动会话自身的 `loadOlder()` 直到读尽——现有 session 数据仍是唯一来源，不落盘、不触发模型请求。

## 行为

- 每次会话切换，逐页拉取更早历史直到日志头部（串行请求，带无进展停滞保护）。
- 断线重连后窗口被重置回尾页时，自动重新拉取。
- 提供 `chatAutoload` 服务：
  - `ensureLoaded(id)` —— 为指定会话启动/重新武装完整历史拉取（幂等）。
  - `isComplete(id)` —— 该会话的完整历史当前是否已拉取完。

## 安装

```sh
dsh plugin --profile <name> add @neplich/dsh-chat-autoload
```

## 卸载

```sh
dsh plugin --profile <name> remove @neplich/dsh-chat-autoload
```

本插件不写文件、不写 settings 字段，卸载无残留。读取 `chatAutoload` 的下游插件（如 dsh-chat-navigator）在卸载后会优雅降级——只索引已加载的窗口，而不是完整历史。

## 模型体验

无：插件不发送任何模型请求、不改动 session 日志，只通过现有分页 RPC 读取历史。
