/**
 * Conversation round indexing: folds one conversation snapshot into an ordered
 * list of rounds (one per user message) with deterministic text summaries and
 * a per-round status. Pure and DOM-free so unit tests drive it with fixture
 * snapshots; the component only maps the result onto markers and cards.
 *
 * A round starts at a 'user' chat node and spans every following node up to
 * the next user message. Steering notes, tool calls and think blocks never
 * produce their own rounds. Summaries are deterministic truncations of the
 * existing message text — no model call, no context change.
 *
 * @module @neplich/dsh-chat-navigator/client/rounds
 */
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

/** One conversation round as the rail presents it. */
export interface Round {
  /** Chat node key of the user message (scroll anchor identity). */
  readonly anchorKey: string
  /** 1-based round number in conversation order. */
  readonly index: number
  /** First-line title of the user request (clipped). */
  readonly title: string
  /** 1-2 line deterministic summary of the user request. */
  readonly userSummary: string
  /** 1-2 line deterministic summary of the assistant response. */
  readonly assistantSummary: string
  /** Round status: processing / done. Interrupted or errored turns count as done — stopping a turn is a normal outcome, not a failure. */
  readonly status: 'processing' | 'done'
}

/** Structural view of one user message node's payload. */
interface UserNodeData {
  readonly content?: readonly { readonly type?: string; readonly text?: string }[]
}

/** Structural view of one assistant-step node's payload. */
interface AssistantStepData {
  readonly status?: string
  readonly blocks?: readonly { readonly kind?: string; readonly text?: string }[]
}

/** Collapse all whitespace runs to single spaces. */
export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Deterministic clip: collapse whitespace, then cut at max characters with an
 * ellipsis. Long paths, code and markdown never exceed the budget.
 */
export function clip(text: string, max: number): string {
  const flat = collapse(text)
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

/** Join the text blocks of one user message payload. */
function textOfContent(data: UserNodeData | undefined): string {
  if (data === undefined || !Array.isArray(data.content)) return ''
  let out = ''
  for (const block of data.content) {
    if (block.type === 'text' && typeof block.text === 'string') out += (out === '' ? '' : ' ') + block.text
  }
  return out
}

/** Join the text blocks of one assistant-step payload. */
function textOfAssistant(data: AssistantStepData | undefined): string {
  if (data === undefined || !Array.isArray(data.blocks)) return ''
  let out = ''
  for (const block of data.blocks) {
    if (block.kind === 'text' && typeof block.text === 'string' && block.text !== '') {
      out += (out === '' ? '' : ' ') + block.text
    }
  }
  return out
}

/**
 * Fold a conversation snapshot into ordered rounds.
 * @param snapshot - live conversation snapshot (loaded window).
 * @returns rounds in conversation order, statuses resolved.
 */
export function buildRounds(snapshot: ConversationSnapshot): Round[] {
  interface Draft {
    anchorKey: string
    title: string
    userSummary: string
    assistantSummary: string
    running: boolean
  }
  const drafts: Draft[] = []
  let current: Draft | null = null
  for (const key of snapshot.chat.order) {
    const node = snapshot.chat.nodes.get(key)
    if (node === undefined) continue
    if (node.kind === 'user') {
      const text = textOfContent(node.data as UserNodeData)
      current = {
        anchorKey: node.key,
        title: clip(collapse(text.split('\n')[0] ?? text), 60) || '…',
        userSummary: clip(text, 140),
        assistantSummary: '',
        running: false,
      }
      drafts.push(current)
      continue
    }
    if (current === null || node.kind === 'steering') continue
    if (node.kind === 'assistant-step') {
      const data = node.data as AssistantStepData
      if (data.status === 'running') current.running = true
      const body = textOfAssistant(data)
      if (body !== '') current.assistantSummary = clip(body, 140)
    }
  }
  const last = drafts[drafts.length - 1]
  return drafts.map((draft, i) => ({
    anchorKey: draft.anchorKey,
    index: i + 1,
    title: draft.title,
    userSummary: draft.userSummary,
    assistantSummary: draft.assistantSummary,
    status: draft.running || (draft === last && snapshot.running) ? 'processing' : 'done',
  }))
}
