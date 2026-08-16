/**
 * Skills settings-section dictionaries: the shared scope-widget copy spread in
 * from dsh-config-shared plus this plugin's own keys.
 */

import { sharedScopeEn, sharedScopeZh } from '@neplich/dsh-config-shared/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills settings section copy (own keys + shared scope-widget keys). */
    'config-skills': ConfigSkillsKey
  }
}

/** Simplified Chinese Skills section messages. */
const skillsZh = {
  'nav.label': '技能',
  'section.heading': '技能',
  'section.intro': '浏览个人级与项目级发现的技能（Skills），含来源、调用方式与同名覆盖关系。技能内容以文件系统为准，此处只读；目录变化由 dsh 自动生效。',
  'source.project-dsh': '项目 .dsh',
  'source.project-agents': '项目 .agents',
  'source.user-dsh': '个人 .dsh',
  'source.user-agents': '个人 .agents',
  'chip.modelOnly': '仅手动',
  'chip.notUserInvocable': '不可手动',
  'chip.shadowed': '被覆盖',
  'detail.whenToUse': '适用场景：{text}',
  'loading': '加载中…',
  'empty.personal': '还没有技能。将 SKILL.md 放入 ~/.dsh/skills 或 ~/.agents/skills 即可被 dsh 发现。',
  'empty.project': '还没有技能。将 SKILL.md 放入项目 .dsh/skills 或 .agents/skills 即可被 dsh 发现。',
} satisfies Record<string, string>

/** English Skills section messages. */
const skillsEn = {
  'nav.label': 'Skills',
  'section.heading': 'Skills',
  'section.intro': 'Browse skills discovered at the personal and project levels, including source, invocation mode, and same-name shadowing. Skill content is owned by the filesystem — this page is read-only; directory changes take effect in dsh automatically.',
  'source.project-dsh': 'Project .dsh',
  'source.project-agents': 'Project .agents',
  'source.user-dsh': 'Personal .dsh',
  'source.user-agents': 'Personal .agents',
  'chip.modelOnly': 'Model only',
  'chip.notUserInvocable': 'Not user-invocable',
  'chip.shadowed': 'Shadowed',
  'detail.whenToUse': 'When to use: {text}',
  'loading': 'Loading…',
  'empty.personal': 'No skills yet. Put a SKILL.md into ~/.dsh/skills or ~/.agents/skills for dsh to discover it.',
  'empty.project': 'No skills yet. Put a SKILL.md into the project .dsh/skills or .agents/skills for dsh to discover it.',
} satisfies Record<string, string>

/** Skills settings-section namespace. */
export const NS = 'config-skills'

/** Complete zh dictionary (shared scope copy + Skills copy). */
export const zh = { ...sharedScopeZh, ...skillsZh }

/** Complete en dictionary (shared scope copy + Skills copy). */
export const en = { ...sharedScopeEn, ...skillsEn }

/** Key union of the merged dictionary (the namespace's LocaleNamespaceMap entry). */
export type ConfigSkillsKey = keyof typeof zh
