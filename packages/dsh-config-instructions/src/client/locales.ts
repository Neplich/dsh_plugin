/**
 * Instructions settings-section dictionaries: the shared scope-widget copy
 * spread in from dsh-config-shared plus this plugin's own keys.
 */

import { sharedScopeEn, sharedScopeZh } from '@neplich/dsh-config-shared/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Instructions settings section copy (own keys + shared scope-widget keys). */
    'config-instructions': ConfigInstructionsKey
  }
}

/** Simplified Chinese Instructions section messages. */
const instructionsZh = {
  'nav.label': '指令文档',
  'section.heading': '指令文档',
  'section.intro': '查看并编辑个人级与项目根级的 AGENTS.md 指令文档（含 *.local.md 本地覆盖）。保存即时生效；子目录中的 AGENTS.md 随 Agent 探索目录时按需加载，不在此管理。',
  'file.localTitle': '{name}（本地覆盖）',
  'file.notCreated': '尚未创建',
  'file.tooLarge': '文件过大，仅显示部分内容，保存将覆盖为当前内容',
  'editor.placeholder.base': '编写该级别对所有会话生效的指令…',
  'editor.placeholder.local': '编写仅本机生效、不入库的覆盖指令…',
  'toast.saved': '已保存',
  'toast.created': '已创建 {title}',
  'action.saving': '保存中…',
  'action.save': '保存',
  'action.create': '创建文件',
  'action.revert': '还原',
  'claude.readonly': '{title}（只读，与 AGENTS.md 同链加载）',
  'hint.personal': '个人级指令对所有项目的所有会话生效。',
  'hint.project': '项目根级指令对该仓库下的所有会话生效；子目录中的 AGENTS.md 由 Agent 在探索目录时按需加载，不在此管理。',
  'hint.liveEffect': '保存后即时生效：进行中的会话会收到更新提示，新会话直接加载最新内容。',
  'loading': '加载中…',
} satisfies Record<string, string>

/** English Instructions section messages. */
const instructionsEn = {
  'nav.label': 'Instructions',
  'section.heading': 'Instructions',
  'section.intro': 'View and edit the personal- and project-root-level AGENTS.md instruction files (including *.local.md local overlays). Saving takes effect immediately; AGENTS.md files in subdirectories are loaded on demand as the agent explores, and are not managed here.',
  'file.localTitle': '{name} (local override)',
  'file.notCreated': 'Not created yet',
  'file.tooLarge': 'The file is too large and is only partially shown; saving will overwrite it with the current content',
  'editor.placeholder.base': 'Write instructions that apply to every session at this level…',
  'editor.placeholder.local': 'Write local-only overrides that stay out of the repository…',
  'toast.saved': 'Saved',
  'toast.created': 'Created {title}',
  'action.saving': 'Saving…',
  'action.save': 'Save',
  'action.create': 'Create file',
  'action.revert': 'Revert',
  'claude.readonly': '{title} (read-only, loaded alongside AGENTS.md)',
  'hint.personal': 'Personal-level instructions apply to every session of every project.',
  'hint.project': 'Project-root instructions apply to every session under this repository; AGENTS.md files in subdirectories are loaded on demand as the agent explores and are not managed here.',
  'hint.liveEffect': 'Saving takes effect immediately: running sessions receive an update notice, and new sessions load the latest content.',
  'loading': 'Loading…',
} satisfies Record<string, string>

/** Instructions settings-section namespace. */
export const NS = 'config-instructions'

/** Complete zh dictionary (shared scope copy + Instructions copy). */
export const zh = { ...sharedScopeZh, ...instructionsZh }

/** Complete en dictionary (shared scope copy + Instructions copy). */
export const en = { ...sharedScopeEn, ...instructionsEn }

/** Key union of the merged dictionary (the namespace's LocaleNamespaceMap entry). */
export type ConfigInstructionsKey = keyof typeof zh
