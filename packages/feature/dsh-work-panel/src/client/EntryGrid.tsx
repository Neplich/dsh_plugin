/**
 * The entry page: the two tool cards (files, terminal), vertically centered.
 * Cards are single-line real buttons (icon + label) following the reference's
 * compact, layered look; the panel header stays visible above them.
 */
import type { ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelTool } from './store.ts'
import { IconFolder, IconTerminal } from './icons.tsx'

/** Entry-grid props: the store's action seat and the locale share. */
export interface EntryGridProps {
  readonly onPick: (tool: PanelTool) => void
  readonly t: PropsLocale<'workPanel'>['t']
}

/** The two-entry tool grid. */
export function EntryGrid({ onPick, t }: EntryGridProps): ReactElement {
  const pick = (tool: PanelTool) => () => { onPick(tool) }
  return (
    <div className="dshwp-entries">
      <button type="button" className="dshwp-entry" onClick={pick('files')}>
        <span className="dshwp-entryIcon"><IconFolder size={16} /></span>
        <span className="dshwp-entryName">{t('entry.files')}</span>
      </button>
      <button type="button" className="dshwp-entry" onClick={pick('terminal')}>
        <span className="dshwp-entryIcon"><IconTerminal size={16} /></span>
        <span className="dshwp-entryName">{t('entry.terminal')}</span>
      </button>
    </div>
  )
}
