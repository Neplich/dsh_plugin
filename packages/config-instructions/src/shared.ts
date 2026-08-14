/**
 * Wire types shared between the host routes (src/server) and the browser
 * half (src/client). Type-only on the client side; every field is JSON.
 * @module @neplich/dsh-config-instructions/shared
 */
import type { Scope } from '@neplich/dsh-config-shared'

export type { RootEntry, RootsResponse, Scope } from '@neplich/dsh-config-shared'

/** Instruction file slots managed at one level. claude kinds are read-only. */
export type InstructionKind = 'base' | 'local' | 'claude' | 'claudeLocal'

/** One instruction file's on-disk state and (capped) content. */
export interface InstructionFile {
  readonly kind: InstructionKind
  readonly path: string
  readonly exists: boolean
  /** Only base/local are writable through this plugin. */
  readonly writable: boolean
  readonly content: string
  readonly sizeBytes: number
  /** True when content was cut at the read cap. */
  readonly truncated: boolean
}

/** GET instructions response. */
export interface InstructionsResponse {
  readonly files: readonly InstructionFile[]
}

/** PUT instructions/write request body (path is server-derived). */
export interface InstructionWriteRequest {
  readonly scope: Scope
  readonly root?: string
  readonly kind: 'base' | 'local'
  readonly content: string
}
