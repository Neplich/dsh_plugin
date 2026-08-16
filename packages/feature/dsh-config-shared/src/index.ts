/**
 * Shared host-side helpers for the @neplich/dsh-config-* plugins: HTTP
 * route utilities, platform path resolution, and the workspace-derived
 * project-root listing. Inlined into each consumer's host bundle.
 * @module @neplich/dsh-config-shared
 */
export { isAllowedOrigin, preflight, readJsonBody, send } from './http.ts'
export { dshAgentsHome, dshHome } from './paths.ts'
export { isKnownRoot, listRoots, projectRootOf } from './roots.ts'
export type { RootEntry, RootsResponse, Scope } from './wire.ts'
