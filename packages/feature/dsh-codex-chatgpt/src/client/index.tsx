/**
 * Codex plugin, browser half: registers the Codex
 * settings section into the settings shell's settings.section list slot,
 * waiting on the slot's runtime declaration via ctx.slots.inject. All copy
 * comes from the 'codex-chatgpt' locale namespace, so the section follows
 * dsh's active language.
 *
 * @module @neplich/dsh-codex-chatgpt/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings shell's SlotMap merge (the settings.section entry)
// and the ctx.locale service declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { SectionShell } from '@neplich/dsh-config-shared/client'
import { en, NS, zh } from './locales.ts'
import { CodexPage } from './CodexPage.tsx'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/** Codex section: subscription login and live models. */
function CodexSection({ t }: PropsLocale<typeof NS>) {
  return (
    <SectionShell heading={t('section.heading')}>
      <CodexPage t={t} />
    </SectionShell>
  )
}

/**
 * Mount the Codex settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'codex-chatgpt: dictionaries')

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'codex-chatgpt',
    order: 11,
    label: () => t('nav.label'),
    locale: NS,
  }, CodexSection))
}
