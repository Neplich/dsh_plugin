/**
 * Instructions plugin, browser half: registers the 指令文档 settings section
 * into the settings shell's settings.section list slot, waiting on the
 * slot's runtime declaration via ctx.slots.inject.
 *
 * @module @neplich/dsh-config-instructions/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings shell's SlotMap merge (the settings.section entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SectionShell } from '@neplich/dsh-config-shared/client'
import { InstructionsPage } from './InstructionsPage.tsx'

/** Required services (cordis fiber inject). */
export const inject = ['slots']

/** 指令文档 section: editable AGENTS.md files per level. */
function InstructionsSection() {
  return (
    <SectionShell
      heading="指令文档"
      intro="查看并编辑个人级与项目根级的 AGENTS.md 指令文档（含 *.local.md 本地覆盖）。保存即时生效；子目录中的 AGENTS.md 随 Agent 探索目录时按需加载，不在此管理。"
    >
      <InstructionsPage />
    </SectionShell>
  )
}

/**
 * Mount the 指令文档 settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'config-instructions',
    order: 21,
    label: '指令文档',
  }, InstructionsSection))
}
