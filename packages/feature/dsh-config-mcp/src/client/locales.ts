/**
 * MCP settings-section dictionaries: the shared scope-widget copy spread in
 * from dsh-config-shared plus this plugin's own keys.
 */

import { sharedScopeEn, sharedScopeZh } from '@neplich/dsh-config-shared/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP settings section copy (own keys + shared scope-widget keys). */
    'config-mcp': ConfigMcpKey
  }
}

/** Simplified Chinese MCP section messages. */
const mcpZh = {
  'nav.label': 'MCP 服务',
  'section.heading': 'MCP 服务',
  'section.intro': '管理 MCP 服务器：查看连接状态与已注册工具，添加、编辑、启停、删除。变更写入用户级 cordis.patch.yml，由 dsh 自动热重载生效。',
  'status.disabled': '已禁用',
  'status.active': '运行中',
  'status.failed': '失败',
  'status.connecting': '连接中',
  'status.reloading': '重载中',
  'status.notLoaded': '未加载',
  'form.malformedLine': '{label} 存在格式错误的行：{line}',
  'field.env': '环境变量',
  'field.headers': '请求头',
  'toast.added': '已添加，正在热重载…',
  'toast.saved': '已保存，正在热重载…',
  'dialog.addTitle': '添加 MCP 服务器',
  'dialog.editTitle': '编辑 MCP 服务器',
  'action.close': '关闭',
  'dialog.addDescription': '服务器将作为插件条目写入用户级 cordis.patch.yml，保存后自动热重载生效。',
  'dialog.editDescription': '修改将整体替换该条目的配置，保存后自动热重载生效。',
  'action.cancel': '取消',
  'action.saving': '保存中…',
  'action.save': '保存',
  'loading': '加载中…',
  'field.name': '名称（工具命名空间）',
  'field.transport': '传输方式',
  'field.transportStdio': 'stdio（本地命令）',
  'field.command': '命令',
  'field.args': '参数（每行一个）',
  'field.envLines': '环境变量（每行 KEY=VALUE）',
  'field.cwd': '工作目录（可选）',
  'field.url': '服务地址',
  'field.headersLines': '请求头（每行 KEY=VALUE，可选）',
  'field.timeout': '工具调用超时（毫秒，可选）',
  'field.startup': '启动行为',
  'field.failOnStartupError': '启动连接失败时加载失败（failOnStartupError）',
  'toolbar.note': '管理写入用户级补丁文件',
  'toolbar.noteSuffix': '，保存后由 dsh 自动热重载（断连重连）。',
  'action.addServer': '添加服务器',
  'empty': '还没有配置 MCP 服务器。点击右上角「添加服务器」接入第一个。',
  'tools.count': '{count} 个工具',
  'external.tip': '由其他配置层提供，仅可在此禁用',
  'external': '外部',
  'action.disable': '禁用',
  'action.enable': '启用',
  'toast.disabled': '已禁用，正在热重载…',
  'toast.enabled': '已启用，正在热重载…',
  'action.edit': '编辑',
  'edit.unmanagedTip': '仅用户级补丁管理的服务器可编辑',
  'delete.confirm': '确认删除？',
  'toast.deleted': '已删除，正在热重载…',
  'action.delete': '删除',
  'delete.unmanagedTip': '仅用户级补丁管理的服务器可删除',
} satisfies Record<string, string>

/** English MCP section messages. */
const mcpEn = {
  'nav.label': 'MCP Servers',
  'section.heading': 'MCP Servers',
  'section.intro': 'Manage MCP servers: view connection status and registered tools; add, edit, enable/disable, and delete. Changes are written to the user-level cordis.patch.yml and applied by dsh\'s automatic hot reload.',
  'status.disabled': 'Disabled',
  'status.active': 'Running',
  'status.failed': 'Failed',
  'status.connecting': 'Connecting',
  'status.reloading': 'Reloading',
  'status.notLoaded': 'Not loaded',
  'form.malformedLine': '{label} has a malformed line: {line}',
  'field.env': 'Environment variables',
  'field.headers': 'Request headers',
  'toast.added': 'Added, hot-reloading…',
  'toast.saved': 'Saved, hot-reloading…',
  'dialog.addTitle': 'Add MCP server',
  'dialog.editTitle': 'Edit MCP server',
  'action.close': 'Close',
  'dialog.addDescription': 'The server is written as a plugin entry into the user-level cordis.patch.yml; saving applies it through automatic hot reload.',
  'dialog.editDescription': 'Saving replaces that entry\'s configuration entirely and applies it through automatic hot reload.',
  'action.cancel': 'Cancel',
  'action.saving': 'Saving…',
  'action.save': 'Save',
  'loading': 'Loading…',
  'field.name': 'Name (tool namespace)',
  'field.transport': 'Transport',
  'field.transportStdio': 'stdio (local command)',
  'field.command': 'Command',
  'field.args': 'Arguments (one per line)',
  'field.envLines': 'Environment variables (one KEY=VALUE per line)',
  'field.cwd': 'Working directory (optional)',
  'field.url': 'Server URL',
  'field.headersLines': 'Request headers (one KEY=VALUE per line, optional)',
  'field.timeout': 'Tool call timeout (ms, optional)',
  'field.startup': 'Startup behavior',
  'field.failOnStartupError': 'Load as failed when the startup connection fails (failOnStartupError)',
  'toolbar.note': 'Management writes to the user-level patch file',
  'toolbar.noteSuffix': ', then dsh hot-reloads it automatically (disconnect/reconnect).',
  'action.addServer': 'Add server',
  'empty': 'No MCP servers configured yet. Click “Add server” in the top-right corner to add the first one.',
  'tools.count': '{count} tools',
  'external.tip': 'Provided by another configuration layer; can only be disabled here',
  'external': 'External',
  'action.disable': 'Disable',
  'action.enable': 'Enable',
  'toast.disabled': 'Disabled, hot-reloading…',
  'toast.enabled': 'Enabled, hot-reloading…',
  'action.edit': 'Edit',
  'edit.unmanagedTip': 'Only servers managed by the user-level patch can be edited',
  'delete.confirm': 'Delete this server?',
  'toast.deleted': 'Deleted, hot-reloading…',
  'action.delete': 'Delete',
  'delete.unmanagedTip': 'Only servers managed by the user-level patch can be deleted',
} satisfies Record<string, string>

/** MCP settings-section namespace. */
export const NS = 'config-mcp'

/** Complete zh dictionary (shared scope copy + MCP copy). */
export const zh = { ...sharedScopeZh, ...mcpZh }

/** Complete en dictionary (shared scope copy + MCP copy). */
export const en = { ...sharedScopeEn, ...mcpEn }

/** Key union of the merged dictionary (the namespace's LocaleNamespaceMap entry). */
export type ConfigMcpKey = keyof typeof zh
