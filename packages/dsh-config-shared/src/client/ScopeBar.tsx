/**
 * ScopeBar: the 个人/项目 segmented control plus the project-root selector
 * shared by the scoped config pages. Root options arrive in durable
 * workspace-registry order; when the host reports the order is not
 * workspace-backed the list falls back to a pinyin-aware collation
 * (Intl.Collator zh-Hans-CN sorts Chinese by pinyin).
 */
import { useEffect, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RootEntry, RootsResponse, Scope } from '../wire.ts'
import type { SharedScopeTranslate } from './locales.ts'
import { styles } from './styles.ts'

/** Pinyin-aware fallback collation for unordered root lists. */
const zhCollator = new Intl.Collator(['zh-Hans-CN', 'en'], { sensitivity: 'base' })

/** Loaded roots state shared by the scoped pages. */
export interface RootsState {
  readonly roots: readonly RootEntry[]
  readonly loading: boolean
  readonly error: string | undefined
}

/**
 * Load the root list once per mount.
 * @param fetchRoots - the owning plugin's roots route (each plugin mounts its own).
 */
export function useRoots(fetchRoots: () => Promise<RootsResponse>): RootsState {
  const [state, setState] = useState<RootsState>({ roots: [], loading: true, error: undefined })
  useEffect(() => {
    let cancelled = false
    fetchRoots().then(
      (data) => { if (!cancelled) setState({ roots: data.roots, loading: false, error: undefined }) },
      (error: unknown) => { if (!cancelled) setState({ roots: [], loading: false, error: String(error) }) },
    )
    return () => { cancelled = true }
  }, [fetchRoots])
  return state
}

/** Order root options: workspace order as-is; pinyin collation only as the unordered fallback. */
export function orderRoots(roots: readonly RootEntry[], workspaceOrdered: boolean): readonly RootEntry[] {
  if (workspaceOrdered) return roots
  return [...roots].sort((a, b) => zhCollator.compare(a.label, b.label))
}

export interface ScopeBarProps {
  readonly scope: Scope
  readonly onScope: (scope: Scope) => void
  readonly rootsState: RootsState
  readonly root: string | undefined
  readonly onRoot: (root: string) => void
  /** Translate seat for the shared scope copy (the owning plugin's t). */
  readonly t: SharedScopeTranslate
}

/** Render the scope segmented control and, for project scope, the root dropdown. */
export function ScopeBar({ scope, onScope, rootsState, root, onRoot, t }: ScopeBarProps) {
  const hasRoots = rootsState.roots.length > 0
  const projectDisabled = !rootsState.loading && !hasRoots
  return (
    <div className={styles.toolbar}>
      <div className={styles.segments} role="tablist" aria-label={t('scope.level')}>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'personal'}
          className={styles.segment}
          data-active={scope === 'personal' ? 'true' : undefined}
          onClick={() => { onScope('personal') }}
        >
          {t('scope.personal')}
        </button>
        <Tooltip label={t('scope.projectDisabledTip')} disabled={!projectDisabled} side="bottom">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'project'}
            className={styles.segment}
            data-active={scope === 'project' ? 'true' : undefined}
            disabled={projectDisabled}
            onClick={() => { onScope('project') }}
          >
            {t('scope.project')}
          </button>
        </Tooltip>
      </div>
      {scope === 'project' && hasRoots && (
        <select
          className={styles.rootSelect}
          aria-label={t('scope.rootAria')}
          value={root ?? ''}
          onChange={(event) => { onRoot(event.target.value) }}
        >
          {root === undefined && <option value="" disabled>{t('scope.rootPlaceholder')}</option>}
          {rootsState.roots.map((entry) => (
            <option key={entry.root} value={entry.root} title={entry.root}>
              {entry.label}（{entry.root}）
            </option>
          ))}
        </select>
      )}
      {rootsState.error !== undefined && <span className={styles.error}>{t('scope.rootsFailed')}</span>}
    </div>
  )
}
