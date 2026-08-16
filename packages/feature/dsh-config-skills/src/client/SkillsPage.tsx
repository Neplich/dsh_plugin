/**
 * SkillsPage: read-only listing of the scope's skills. Discovery sources
 * merge into one table, each row carrying its source badge; same-name
 * skills in lower-rank sources are marked 被覆盖. Row expansion fetches
 * the full SKILL.md document. The list renders in a fixed-height panel
 * sized from the viewport (8-15 rows), so the empty and populated states
 * occupy the identical box. Writes stay out of this page by design — the
 * filesystem (and the harness's own watchers) owns skill content. All copy
 * goes through the plugin's 'config-skills' translate seat.
 */
import { useEffect, useState } from 'react'
import { ScopeBar, styles, useRoots } from '@neplich/dsh-config-shared/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { api } from './api.ts'
import type { Scope, SkillItem, SkillSourceId, SkillsResponse } from '../shared.ts'
import type { ConfigSkillsKey } from './locales.ts'
import css from './SkillsPage.module.css'

/** Translate seat of the 'config-skills' namespace (own keys + shared scope keys). */
type SkillsTranslate = TranslateNS<'config-skills'>

/** Source badge key per source id (typed indirection for the t seat). */
const SOURCE_KEY: Record<SkillSourceId, ConfigSkillsKey> = {
  'project-dsh': 'source.project-dsh',
  'project-agents': 'source.project-agents',
  'user-dsh': 'source.user-dsh',
  'user-agents': 'source.user-agents',
}

/** Fixed page chrome above and below the panel (heading, intro, toolbar, gaps). */
const PANEL_CHROME_PX = 260
/** One merged-table row's rendered height (padding + one text line + row border). */
const PANEL_ROW_PX = 40
/** Viewport-derived visible rows: 8 on short displays, up to 15 on tall ones. */
const PANEL_MIN_ROWS = 8
const PANEL_MAX_ROWS = 15

/** Row count the fixed-height panel can show on the current viewport. */
function panelRows(): number {
  if (typeof window === 'undefined') return PANEL_MIN_ROWS
  const rows = Math.floor((window.innerHeight - PANEL_CHROME_PX) / PANEL_ROW_PX)
  return Math.min(PANEL_MAX_ROWS, Math.max(PANEL_MIN_ROWS, rows))
}

/** Non-default invocation and shadow markers for one row. */
function InvocationChips({ item, t }: { item: SkillItem, t: SkillsTranslate }) {
  return (
    <span className={css.chips}>
      {!item.modelInvocable && <span className={css.chip}>{t('chip.modelOnly')}</span>}
      {!item.userInvocable && <span className={css.chip} data-tone="warn">{t('chip.notUserInvocable')}</span>}
      {item.shadowed && <span className={css.chip} data-tone="warn">{t('chip.shadowed')}</span>}
    </span>
  )
}

/** One expanded row's full document. */
function SkillDetail({ scope, root, item, t }: { scope: Scope, root: string | undefined, item: SkillItem, t: SkillsTranslate }) {
  const [content, setContent] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let cancelled = false
    api.readSkill(scope, root, item.name).then(
      (data) => { if (!cancelled) setContent(data.content) },
      (err: unknown) => { if (!cancelled) setError(String(err)) },
    )
    return () => { cancelled = true }
  }, [scope, root, item.name])
  return (
    <div className={css.detail}>
      {item.whenToUse !== undefined && <span className={styles.hint}>{t('detail.whenToUse', { text: item.whenToUse })}</span>}
      <span className={styles.pathNote}>{item.path}</span>
      {error !== undefined && <span className={styles.error}>{error}</span>}
      {content === undefined && error === undefined && <span className={styles.hint}>{t('loading')}</span>}
      {content !== undefined && <pre className={css.detailBody}>{content}</pre>}
    </div>
  )
}

/** Render the skills page. */
export function SkillsPage({ t }: { t: SkillsTranslate }) {
  const rootsState = useRoots(api.roots)
  const [scope, setScope] = useState<Scope>('personal')
  const [root, setRoot] = useState<string>()
  const [data, setData] = useState<SkillsResponse>()
  const [error, setError] = useState<string>()
  const [expanded, setExpanded] = useState<string>()
  const [rows, setRows] = useState<number>(panelRows)

  // Re-derive the panel row count when the viewport height changes.
  useEffect(() => {
    const onResize = () => { setRows(panelRows()) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [])

  // Auto-pick the first workspace-ordered root when entering project scope.
  useEffect(() => {
    if (scope === 'project' && root === undefined && rootsState.roots.length > 0) {
      setRoot(rootsState.roots[0]?.root)
    }
  }, [scope, root, rootsState.roots])

  const effectiveRoot = scope === 'project' ? root : undefined
  useEffect(() => {
    if (scope === 'project' && effectiveRoot === undefined) return
    let cancelled = false
    setData(undefined)
    setError(undefined)
    setExpanded(undefined)
    api.skills(scope, effectiveRoot).then(
      (result) => { if (!cancelled) setData(result) },
      (err: unknown) => { if (!cancelled) setError(String(err)) },
    )
    return () => { cancelled = true }
  }, [scope, effectiveRoot])

  return (
    <div>
      <ScopeBar scope={scope} onScope={setScope} rootsState={rootsState} root={root} onRoot={setRoot} t={t} />
      {error !== undefined && <p className={styles.error}>{error}</p>}
      {data === undefined && error === undefined && <p className={css.loading}>{t('loading')}</p>}
      {data !== undefined && data.skills.length === 0 && (
        <p className={css.empty} style={{ height: rows * PANEL_ROW_PX }}>
          {scope === 'personal' ? t('empty.personal') : t('empty.project')}
        </p>
      )}
      {data !== undefined && data.skills.length > 0 && (
        <div className={css.table} style={{ height: rows * PANEL_ROW_PX }}>
          {data.skills.map((item) => {
            const key = item.source + ':' + item.name
            const open = expanded === key
            return (
              <div key={key}>
                <button
                  type="button"
                  className={css.row}
                  data-shadowed={item.shadowed ? 'true' : undefined}
                  aria-expanded={open}
                  onClick={() => { setExpanded(open ? undefined : key) }}
                >
                  <span className={css.name}>{item.name}</span>
                  <span className={css.desc} title={item.description}>{item.description}</span>
                  <span className={css.chips}>
                    <span className={css.chip}>{t(SOURCE_KEY[item.source])}</span>
                  </span>
                  <InvocationChips item={item} t={t} />
                </button>
                {open && <SkillDetail scope={scope} root={effectiveRoot} item={item} t={t} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
