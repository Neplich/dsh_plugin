/**
 * SkillsPage: read-only listing of the scope's skills. Discovery sources
 * merge into one table, each row carrying its source badge; same-name
 * skills in lower-rank sources are marked 被覆盖. Row expansion fetches
 * the full SKILL.md document. The list renders in a fixed-height panel
 * sized from the viewport (8-15 rows), so the empty and populated states
 * occupy the identical box. Writes stay out of this page by design — the
 * filesystem (and the harness's own watchers) owns skill content.
 */
import { useEffect, useState } from 'react'
import { ScopeBar, styles, useRoots } from '@neplich/dsh-config-shared/client'
import { api } from './api.ts'
import type { Scope, SkillItem, SkillSourceId, SkillsResponse } from '../shared.ts'
import css from './SkillsPage.module.css'

/** Source display labels. */
const SOURCE_LABEL: Record<SkillSourceId, string> = {
  'project-dsh': '项目 .dsh',
  'project-agents': '项目 .agents',
  'user-dsh': '个人 .dsh',
  'user-agents': '个人 .agents',
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
function InvocationChips({ item }: { item: SkillItem }) {
  return (
    <span className={css.chips}>
      {!item.modelInvocable && <span className={css.chip}>仅手动</span>}
      {!item.userInvocable && <span className={css.chip} data-tone="warn">不可手动</span>}
      {item.shadowed && <span className={css.chip} data-tone="warn">被覆盖</span>}
    </span>
  )
}

/** One expanded row's full document. */
function SkillDetail({ scope, root, item }: { scope: Scope, root: string | undefined, item: SkillItem }) {
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
      {item.whenToUse !== undefined && <span className={styles.hint}>适用场景：{item.whenToUse}</span>}
      <span className={styles.pathNote}>{item.path}</span>
      {error !== undefined && <span className={styles.error}>{error}</span>}
      {content === undefined && error === undefined && <span className={styles.hint}>加载中…</span>}
      {content !== undefined && <pre className={css.detailBody}>{content}</pre>}
    </div>
  )
}

/** Render the skills page. */
export function SkillsPage() {
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
      <ScopeBar scope={scope} onScope={setScope} rootsState={rootsState} root={root} onRoot={setRoot} />
      {error !== undefined && <p className={styles.error}>{error}</p>}
      {data === undefined && error === undefined && <p className={css.loading}>加载中…</p>}
      {data !== undefined && data.skills.length === 0 && (
        <p className={css.empty} style={{ height: rows * PANEL_ROW_PX }}>
          {scope === 'personal'
            ? '还没有技能。将 SKILL.md 放入 ~/.dsh/skills 或 ~/.agents/skills 即可被 dsh 发现。'
            : '还没有技能。将 SKILL.md 放入项目 .dsh/skills 或 .agents/skills 即可被 dsh 发现。'}
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
                    <span className={css.chip}>{SOURCE_LABEL[item.source]}</span>
                  </span>
                  <InvocationChips item={item} />
                </button>
                {open && <SkillDetail scope={scope} root={effectiveRoot} item={item} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}