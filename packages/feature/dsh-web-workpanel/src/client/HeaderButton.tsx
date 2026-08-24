/**
 * The session-header toggle: one icon button in the right utility row, after
 * Session log, that opens/closes the work panel. The tooltip carries the real, working
 * shortcut (Option+J on macOS, Alt+J elsewhere).
 */
import type { ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPanelLeftOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'

/** Verbs the registration's inject face hands the button. */
export interface HeaderButtonInjected {
  readonly togglePanel: () => void
  /** Platform-appropriate shortcut label, already matching the live keydown binding. */
  readonly shortcut: string
}

/** Full props composed from the runtime share, the inject face, and locale. */
export type HeaderButtonProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & HeaderButtonInjected
  & PropsLocale<'workPanel'>

/** The header toggle button. */
export function WorkPanelButton({ togglePanel, shortcut, t }: HeaderButtonProps): ReactElement {
  const label = `${t('panel.open')} (${shortcut})`
  return (
    <Tooltip label={label} side="bottom">
      <button type="button" className="dshwp-iconbtn" aria-label={label} onClick={togglePanel}>
        <IconPanelLeftOutline16 className="dshwp-panelRightIcon" size={14} />
      </button>
    </Tooltip>
  )
}
