/**
 * Wire types shared by every config-* plugin: the management scope and the
 * project-root listing consumed by the scoped pages.
 */

/** Management scope: personal ($DSH_HOME / $DSH_AGENTS_HOME) or one project root. */
export type Scope = 'personal' | 'project'

/** One selectable project root (derived from a registered workspace). */
export interface RootEntry {
  /** Project root: nearest .git ancestor of the workspace path, else the path itself. */
  readonly root: string
  /** Display label: workspace title. */
  readonly label: string
  /** The workspace path this root was derived from. */
  readonly workspacePath: string
}

/** Roots route response. */
export interface RootsResponse {
  readonly roots: readonly RootEntry[]
  readonly dshHome: string
  readonly agentsHome: string
}
