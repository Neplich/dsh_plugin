/**
 * Auto-fold records plugin, browser half: when an assistant message starts
 * outputting body text, collapse every thinking (Think) row and tool-call row
 * that precedes it within the same turn, and insert one persistent
 * expand/collapse bar in their place. The bar stays mounted: clicking toggles
 * between expanded and collapsed, and row-internal state (expanded tool
 * details, Think disclosure state) is never touched — only row visibility and
 * the Think subtree's CSS hiding flip.
 *
 * Pure DOM strategy over the shipped chat flow: no harness change, no slot
 * takeover, no services. The decision logic is the exported pure function
 * `computeFolds` (unit-tested); `apply` only maps the live DOM onto row
 * descriptors and executes the plans.
 *
 * @module @neplich/dsh-auto-fold/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.locale service declaration.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, NS, zh } from './locales.ts'

/** Expand-bar class name; also the CSS injection key. */
export const BAR_CLASS = 'dsh-collapse-bar'

/** One chat-flow row's classification, as the fold decision sees it. */
export interface RowDescriptor {
  /** `data-chat-flow-kind` value ('user' | 'tool-call' | 'assistant-step' | …). */
  kind: string
  /** Whether the row carries a Think disclosure subtree. */
  hasThink: boolean
  /** Row text outside the Think subtree (the assistant body text). */
  bodyText: string
}

/** One fold plan: the body row and the preceding rows to collapse for it. */
export interface FoldPlan {
  /** Index of the body row (body text present). */
  bodyIndex: number
  /** Indexes of the foldable rows before it inside the same turn. */
  targetIndexes: number[]
  /** Whether the body row itself carries a Think subtree to hide too. */
  hideBodyThink: boolean
}

/**
 * Pure fold decision: for each row with body text (an assistant body row),
 * collect the foldable records before it — tool-call rows and think-only
 * assistant rows — up to the nearest user row. A body row with nothing
 * foldable before it produces no plan.
 * @param rows - row descriptors in DOM order.
 * @returns one plan per foldable body row, in order.
 */
export function computeFolds(rows: readonly RowDescriptor[]): FoldPlan[] {
  const plans: FoldPlan[] = []
  let pending: number[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row === undefined) continue
    if (row.kind === 'user') {
      pending = []
      continue
    }
    if (row.kind === 'tool-call') {
      pending.push(i)
      continue
    }
    if (row.kind !== 'assistant-step') continue
    if (row.bodyText !== '') {
      // Body started: fold everything collected since the last user row.
      if (pending.length > 0) {
        plans.push({ bodyIndex: i, targetIndexes: [...pending], hideBodyThink: row.hasThink })
      }
      pending = []
    } else if (row.hasThink) {
      // Think-only assistant row: a foldable record while it stays bodiless.
      pending.push(i)
    }
  }
  return plans
}

/** Expand-bar stylesheet: theme tokens with neutral fallbacks. */
export const STYLE_TEXT = [
  `.${BAR_CLASS} {`,
  'display:flex;align-items:center;justify-content:flex-start;gap:4px;',
  'width:100%;box-sizing:border-box;margin:2px 0;padding:5px 12px;',
  'border:1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.35));',
  'border-radius:8px;',
  'background:var(--dsw-alias-bg-layer-1, rgba(127,127,127,.08));',
  'color:var(--dsw-alias-label-secondary, inherit);',
  'font-size:12px;line-height:1.4;cursor:pointer;font-family:inherit;',
  'text-align:left;',
  '}',
  `.${BAR_CLASS}:hover {`,
  'color:var(--dsw-alias-label-primary);',
  'border-color:var(--dsw-alias-border-l2);',
  '}',
  '[data-dsh-hide-think] [data-variant="think"] { display:none !important; }',
].join('\n')

/** One mounted bar plus the rows it owns. */
interface BarRecord {
  bar: HTMLButtonElement
  count: number
  targets: HTMLElement[]
  bodyRow: HTMLElement
  /** true = rows hidden (collapsed), false = rows visible. */
  folded: boolean
}

/** Required services (cordis fiber inject). */
export const inject = ['locale']

/**
 * Client plugin body: observe every chat flow and execute fold plans.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'auto-fold: dictionaries')
  const t = ctx.locale.bind(NS)

  const style = document.createElement('style')
  style.dataset.plugin = 'auto-fold'
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)

  const foldedRows = new WeakSet<HTMLElement>()
  const handledRows = new WeakSet<HTMLElement>()
  const managedRows = new WeakSet<HTMLElement>()
  const bars = new Set<BarRecord>()
  let observer: MutationObserver | null = null
  let raf = 0
  let dirty = false

  /** Text of a row excluding the Think disclosure subtree: the body text. */
  function bodyText(row: HTMLElement): string {
    if (row.querySelector('[data-variant="think"]') === null) {
      return (row.textContent ?? '').replace(/\s+/g, ' ').trim()
    }
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
    let out = ''
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      let parent: HTMLElement | null = node.parentNode instanceof HTMLElement ? node.parentNode : null
      let insideThink = false
      while (parent !== null && parent !== row) {
        if (parent.matches('[data-variant="think"]')) {
          insideThink = true
          break
        }
        parent = parent.parentElement
      }
      if (!insideThink) out += node.textContent
    }
    return out.replace(/\s+/g, ' ').trim()
  }

  /** DOM row → fold-decision descriptor. */
  function rowDescriptor(el: HTMLElement): RowDescriptor {
    return {
      kind: el.dataset.chatFlowKind ?? '',
      hasThink: el.querySelector('[data-variant="think"]') !== null,
      bodyText: bodyText(el),
    }
  }

  /** Push the bar's current folded/unfolded state onto its rows; visibility
   *  only — row-internal component state is untouched. */
  function applyBar(record: BarRecord): void {
    if (record.folded) {
      for (const row of record.targets) {
        row.style.display = 'none'
        foldedRows.add(row)
      }
      if (record.bodyRow.querySelector('[data-variant="think"]') !== null) {
        record.bodyRow.dataset.dshHideThink = '1'
      }
      record.bar.textContent = t('bar.folded', { count: record.count })
    } else {
      for (const row of record.targets) {
        row.style.display = ''
        foldedRows.delete(row)
      }
      delete record.bodyRow.dataset.dshHideThink
      record.bar.textContent = t('bar.expanded', { count: record.count })
    }
  }

  function makeBar(count: number, targets: HTMLElement[], bodyRow: HTMLElement): BarRecord {
    const bar = document.createElement('button')
    bar.type = 'button'
    bar.className = BAR_CLASS
    const record: BarRecord = { bar, count, targets, bodyRow, folded: true }
    bar.addEventListener('click', () => {
      record.folded = !record.folded
      applyBar(record)
    })
    applyBar(record)
    return record
  }

  /**
   * One full pass over every chat flow on the page: fold the records that
   * precede each freshly-detected body row. Also prunes bars whose DOM
   * vanished (session switch, flow rebuild) and pins each live bar above its
   * first target through React's own list moves.
   */
  function scanAll(): void {
    const barList = Array.from(bars)
    for (const rec of barList) {
      if (!rec.bar.isConnected) {
        bars.delete(rec)
        continue
      }
      const live = rec.targets.filter(target => target.isConnected)
      if (live.length === 0) {
        rec.bar.remove()
        bars.delete(rec)
        continue
      }
      rec.targets = live
      const first = live[0]!
      if (rec.bar.nextElementSibling !== first) {
        first.parentElement!.insertBefore(rec.bar, first)
      }
    }
    const flows = document.querySelectorAll('[data-chat-flow]')
    for (const flow of flows) {
      const rows = Array.from(flow.querySelectorAll<HTMLElement>('[data-chat-flow-kind]'))
      const plans = computeFolds(rows.map(rowDescriptor))
      for (const plan of plans) {
        const bodyRow = rows[plan.bodyIndex]
        if (bodyRow === undefined) continue
        if (handledRows.has(bodyRow)) continue
        handledRows.add(bodyRow)
        const fresh: HTMLElement[] = []
        for (const index of plan.targetIndexes) {
          const target = rows[index]
          if (target === undefined) continue
          if (!managedRows.has(target) && !foldedRows.has(target)) fresh.push(target)
        }
        if (fresh.length === 0) continue
        for (const target of fresh) managedRows.add(target)
        const record = makeBar(fresh.length, fresh, bodyRow)
        flow.insertBefore(record.bar, fresh[0]!)
        bars.add(record)
      }
    }
  }

  function onMutations(): void {
    if (dirty) return
    dirty = true
    raf = requestAnimationFrame(() => {
      dirty = false
      scanAll()
    })
  }

  observer = new MutationObserver(onMutations)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  // Catch content already on screen at load (reopened sessions, history).
  scanAll()

  // Language switch: re-render every live bar in the new language (the
  // bound translate reads the active locale at call time).
  ctx.effect(() => ctx.locale.subscribe(() => {
    for (const record of bars) applyBar(record)
  }), 'auto-fold: locale refresh')

  ctx.effect(() => () => {
    if (observer !== null) observer.disconnect()
    if (raf !== 0) cancelAnimationFrame(raf)
    for (const rec of bars) {
      if (rec.bar.isConnected) rec.bar.remove()
    }
    bars.clear()
    const flows = document.querySelectorAll('[data-chat-flow]')
    for (const flow of flows) {
      const rows = flow.querySelectorAll<HTMLElement>('[data-chat-flow-kind]')
      for (const row of rows) {
        if (foldedRows.has(row)) {
          row.style.display = ''
          foldedRows.delete(row)
        }
        delete row.dataset.dshHideThink
      }
    }
    style.remove()
  }, 'auto-fold: observer + styles')
}
