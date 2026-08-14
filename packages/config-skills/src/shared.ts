/**
 * Wire types shared between the host routes (src/server) and the browser
 * half (src/client). Type-only on the client side; every field is JSON.
 * @module @neplich/dsh-config-skills/shared
 */
export type { RootEntry, RootsResponse, Scope } from '@neplich/dsh-config-shared'

/** Skill discovery directory identifiers (harness rank order: .dsh wins over .agents). */
export type SkillSourceId = 'project-dsh' | 'project-agents' | 'user-dsh' | 'user-agents'

/** One discovered skill (read-only projection of its SKILL.md frontmatter). */
export interface SkillItem {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  /** False when frontmatter sets disable-model-invocation (manual slash only). */
  readonly modelInvocable: boolean
  /** False when frontmatter sets user-invocable: false. */
  readonly userInvocable: boolean
  readonly source: SkillSourceId
  /** Absolute path of the SKILL.md (or flat .md) file. */
  readonly path: string
  /** True when a same-name skill in a higher-rank source shadows this one. */
  readonly shadowed: boolean
}

/** GET skills response. */
export interface SkillsResponse {
  readonly skills: readonly SkillItem[]
}

/** GET skills/read response: one skill document's full text. */
export interface SkillReadResponse {
  readonly name: string
  readonly path: string
  readonly content: string
}
