/**
 * Shared browser widgets for the @neplich/dsh-config-* settings sections.
 * Inlined into each consumer's client bundle; the shared sheet self-injects
 * on module evaluation (idempotent per document).
 * @module @neplich/dsh-config-shared/client
 */
export { orderRoots, ScopeBar, useRoots } from './ScopeBar.tsx'
export type { RootsState, ScopeBarProps } from './ScopeBar.tsx'
export { SectionShell } from './SectionShell.tsx'
export type { SectionShellProps } from './SectionShell.tsx'
export { ensureSharedStyles, styles } from './styles.ts'
export type { RootEntry, RootsResponse, Scope } from '../wire.ts'
