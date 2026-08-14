/**
 * Skills plugin, browser half: registers the 技能 settings section into the
 * settings shell's settings.section list slot, waiting on the slot's runtime
 * declaration via ctx.slots.inject.
 *
 * @module @neplich/dsh-config-skills/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings shell's SlotMap merge (the settings.section entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SectionShell } from '@neplich/dsh-config-shared/client'
import { SkillsPage } from './SkillsPage.tsx'

/** Required services (cordis fiber inject). */
export const inject = ['slots']

/** 技能 section: read-only personal/project skills browser. */
function SkillsSection() {
  return (
    <SectionShell
      heading="技能"
      intro="浏览个人级与项目级发现的技能（Skills），含来源、调用方式与同名覆盖关系。技能内容以文件系统为准，此处只读；目录变化由 dsh 自动生效。"
    >
      <SkillsPage />
    </SectionShell>
  )
}

/**
 * Mount the 技能 settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'config-skills',
    order: 20,
    label: '技能',
  }, SkillsSection))
}
