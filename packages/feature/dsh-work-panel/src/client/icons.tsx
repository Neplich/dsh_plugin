/**
 * Linear icons for the work panel: 16×16 stroke icons matching the shell's
 * line style (1.5px currentColor strokes, round caps and joins).
 *
 * @module @neplich/dsh-work-panel/client/icons
 */
import type { ReactElement } from 'react'

interface IconProps {
  readonly size?: number
}

function base(size: number) {
  return {
    viewBox: '0 0 16 16',
    width: size,
    height: size,
    'aria-hidden': true as const,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

/** Folder outline. */
export function IconFolder({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 2h5.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7Z" />
    </svg>
  )
}

/** Stacked folders (directory-tree visibility). */
export function IconFolders({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M2 10.5v-6a1 1 0 0 1 1-1h3l1.5 2H11a1 1 0 0 1 1 1V7" />
      <path d="M4 8a1 1 0 0 1 1-1h3l1.5 2H13a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Z" />
    </svg>
  )
}

/** File outline. */
export function IconFile({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M4 2.5h5L12.5 6v7.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
      <path d="M9 2.5V6h3.5" />
    </svg>
  )
}

/** Terminal prompt. */
export function IconTerminal({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M4.5 6.5 6.5 8l-2 1.5M8 10.5h3.5" />
    </svg>
  )
}

/** Right chevron (collapsed directory). */
export function IconChevronRight({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="m6 4 4 4-4 4" />
    </svg>
  )
}

/** Down chevron (expanded directory). */
export function IconChevronDown({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

/** Up chevron (previous search match). */
export function IconChevronUp({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="m4 10 4-4 4 4" />
    </svg>
  )
}

/** Left chevron (previous page / match). */
export function IconChevronLeft({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="m10 4-4 4 4 4" />
    </svg>
  )
}

/** Close cross. */
export function IconClose({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

/** Plus (new work tab). */
export function IconPlus({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

/** Minus (zoom out). */
export function IconMinus({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M3 8h10" />
    </svg>
  )
}

/** Fit the document to the available width. */
export function IconFitWidth({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M2.5 5V2.5H5M11 2.5h2.5V5M2.5 11v2.5H5M11 13.5h2.5V11" />
      <path d="M5 8h6M5 8l1.5-1.5M5 8l1.5 1.5M11 8 9.5 6.5M11 8 9.5 9.5" />
    </svg>
  )
}

/** Rotate clockwise. */
export function IconRotate({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M12.5 6A5 5 0 1 0 13 9" />
      <path d="M10 3.5h2.5V6" />
    </svg>
  )
}

/** Download arrow. */
export function IconDownload({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M8 2.5v7M5.5 7.5 8 10l2.5-2.5" />
      <path d="M3 11.5v2h10v-2" />
    </svg>
  )
}

/** Expand (maximize the panel). */
export function IconMaximize({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
    </svg>
  )
}

/** Restore (leave the maximized state). */
export function IconRestore({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M6.5 2.5h-4v4M9.5 13.5h4v-4M2.5 2.5 7 7M13.5 13.5 9 9" />
    </svg>
  )
}

/** Right-docked panel (the header toggle). */
export function IconPanelRight({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M10 3v10" />
    </svg>
  )
}

/** Circular arrow (refresh / restart). */
export function IconRefresh({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.8v2.4h-2.4" />
    </svg>
  )
}

/** Magnifier (directory-tree filter). */
export function IconSearch({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...base(size)}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  )
}
