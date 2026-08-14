/**
 * MCP plugin, browser half: registers the MCP 服务 settings section into the
 * settings shell's settings.section list slot, waiting on the slot's runtime
 * declaration via ctx.slots.inject. All copy comes from the 'config-mcp'
 * locale namespace, so the section follows dsh's active language.
 *
 * @module @neplich/dsh-config-mcp/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings shell's SlotMap merge (the settings.section entry)
// and the ctx.locale service declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { SectionShell } from '@neplich/dsh-config-shared/client'
import { en, NS, zh } from './locales.ts'
import { McpPage } from './McpPage.tsx'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/** MCP 服务 section: full server management over the user-level patch file. */
function McpSection({ t }: PropsLocale<typeof NS>) {
  return (
    <SectionShell heading={t('section.heading')} intro={t('section.intro')}>
      <McpPage t={t} />
    </SectionShell>
  )
}

/**
 * Mount the MCP 服务 settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'config-mcp: dictionaries')

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'config-mcp',
    order: 22,
    label: () => t('nav.label'),
    locale: NS,
  }, McpSection))
}
