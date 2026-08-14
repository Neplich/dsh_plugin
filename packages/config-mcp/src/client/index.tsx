/**
 * MCP plugin, browser half: registers the MCP 服务 settings section into the
 * settings shell's settings.section list slot, waiting on the slot's runtime
 * declaration via ctx.slots.inject.
 *
 * @module @neplich/dsh-config-mcp/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings shell's SlotMap merge (the settings.section entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SectionShell } from '@neplich/dsh-config-shared/client'
import { McpPage } from './McpPage.tsx'

/** Required services (cordis fiber inject). */
export const inject = ['slots']

/** MCP 服务 section: full server management over the user-level patch file. */
function McpSection() {
  return (
    <SectionShell
      heading="MCP 服务"
      intro="管理 MCP 服务器：查看连接状态与已注册工具，添加、编辑、启停、删除。变更写入用户级 cordis.patch.yml，由 dsh 自动热重载生效。"
    >
      <McpPage />
    </SectionShell>
  )
}

/**
 * Mount the MCP 服务 settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'config-mcp',
    order: 22,
    label: 'MCP 服务',
  }, McpSection))
}
