/** SectionShell: the shared settings-section chrome (heading + intro) for the config-* sections. */
import type { ReactNode } from 'react'
import { styles } from './styles.ts'

export interface SectionShellProps {
  readonly heading: string
  readonly intro: string
  readonly children?: ReactNode
}

/** Render one settings section's heading copy and body. */
export function SectionShell({ heading, intro, children }: SectionShellProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.intro}>{intro}</p>
      <div className={styles.page}>{children}</div>
    </div>
  )
}
