/**
 * Project-root listing for the Config Center: derives one project root per
 * registered workspace (nearest .git ancestor, else the workspace path),
 * keeping the durable workspace registry order. When no workspace registry
 * is composed the list is empty and the client falls back to its own
 * pinyin-aware collation of whatever roots it can still show.
 */
import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import { dshAgentsHome, dshHome } from './paths.ts'
import type { RootEntry, RootsResponse } from './wire.ts'

/**
 * Nearest ancestor directory containing a .git entry (directory or
 * worktree file); the path itself when none exists.
 */
export async function projectRootOf(path: string): Promise<string> {
  let current = path
  for (;;) {
    const marker = await stat(join(current, '.git')).catch(() => undefined)
    if (marker !== undefined) return current
    const parent = dirname(current)
    if (parent === current) return path
    current = parent
  }
}

/**
 * List project roots in durable workspace registry order, deduplicated by
 * resolved root (several workspaces can share one repository root).
 */
export async function listRoots(ctx: Context): Promise<RootsResponse> {
  const roots: RootEntry[] = []
  const seen = new Set<string>()
  const registry = ctx.get('workspaceRegistry')
  if (registry !== undefined && registry !== null) {
    for (const workspace of registry.list()) {
      const root = await projectRootOf(workspace.path)
      if (seen.has(root)) continue
      seen.add(root)
      roots.push({ root, label: workspace.title, workspacePath: workspace.path })
    }
  }
  return { roots, dshHome: dshHome(), agentsHome: dshAgentsHome() }
}

/** True when the candidate is one of the known project roots (write confinement). */
export async function isKnownRoot(ctx: Context, candidate: string): Promise<boolean> {
  const { roots } = await listRoots(ctx)
  return roots.some((entry) => entry.root === candidate)
}