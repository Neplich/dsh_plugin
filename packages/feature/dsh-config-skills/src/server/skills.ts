/**
 * Skills discovery for the Config Center: scans the two personal and two
 * project skill directories exactly the way dsh-skill-filesystem does
 * (directory packages <name>/SKILL.md or flat <name>.md files, one level,
 * dot-directories skipped), parses the YAML frontmatter, and projects the
 * rank/shadow relation between sources. Read-only: the filesystem stays
 * the source of truth and the harness's own watchers pick up any external
 * change.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { dshAgentsHome, dshHome } from '@neplich/dsh-config-shared'
import type { Scope, SkillItem, SkillSourceId, SkillsResponse } from '../shared.ts'

/** Discovery directories per scope, in harness rank order (first wins). */
const SOURCES: Record<Scope, readonly { id: SkillSourceId, dir: (root?: string) => string }[]> = {
  personal: [
    { id: 'user-dsh', dir: () => join(dshHome(), 'skills') },
    { id: 'user-agents', dir: () => join(dshAgentsHome(), 'skills') },
  ],
  project: [
    { id: 'project-dsh', dir: (root) => join(root ?? '', '.dsh', 'skills') },
    { id: 'project-agents', dir: (root) => join(root ?? '', '.agents', 'skills') },
  ],
}

/** Parsed frontmatter subset this page displays. */
interface SkillFrontmatter {
  name?: unknown
  description?: unknown
  whenToUse?: unknown
  'disable-model-invocation'?: unknown
  'user-invocable'?: unknown
}

/** Split and parse the leading --- frontmatter block; undefined when absent or invalid. */
export function parseFrontmatter(content: string): SkillFrontmatter | undefined {
  if (!content.startsWith('---')) return undefined
  const end = content.indexOf('\n---', 3)
  if (end < 0) return undefined
  try {
    const value: unknown = parseYaml(content.slice(3, end))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    return value as SkillFrontmatter
  } catch {
    return undefined
  }
}

/** Build one list row from a candidate file; undefined when the entry is not a valid skill. */
function toItem(source: SkillSourceId, path: string, content: string): SkillItem | undefined {
  const fm = parseFrontmatter(content)
  if (fm === undefined) return undefined
  const name = typeof fm.name === 'string' ? fm.name : undefined
  const description = typeof fm.description === 'string' ? fm.description : undefined
  if (name === undefined || description === undefined) return undefined
  return {
    name,
    description,
    ...(typeof fm.whenToUse === 'string' ? { whenToUse: fm.whenToUse } : {}),
    modelInvocable: fm['disable-model-invocation'] !== true,
    userInvocable: fm['user-invocable'] !== false,
    source,
    path,
    shadowed: false,
  }
}

/** Scan one discovery directory: <name>/SKILL.md packages and flat <name>.md files, one level. */
async function scanSource(source: SkillSourceId, dir: string, maxFileBytes: number): Promise<SkillItem[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const items: SkillItem[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      const target = entry.isSymbolicLink()
        ? await stat(path).catch(() => undefined)
        : entry
      let file: string | undefined
      if (target?.isDirectory() === true) {
        const candidate = join(path, 'SKILL.md')
        const info = await stat(candidate).catch(() => undefined)
        if (info?.isFile() === true) file = candidate
      } else if (target?.isFile() === true && entry.name.endsWith('.md')) {
        file = path
      }
      if (file === undefined) continue
      const info = await stat(file)
      if (info.size > maxFileBytes) continue
      const item = toItem(source, file, await readFile(file, 'utf8'))
      if (item !== undefined) items.push(item)
    }
    return items
  } catch {
    // A missing/unreadable directory is an empty source, not an error.
    return []
  }
}

/**
 * List the skills of one scope. Rank order follows the harness: the first
 * source claiming a name wins; later same-name rows are marked shadowed.
 * @param scope - personal or project.
 * @param root - project root (project scope only; must come from roots.ts).
 * @param maxFileBytes - per-file read cap (plugin Config).
 */
export async function listSkills(scope: Scope, root: string | undefined, maxFileBytes: number): Promise<SkillsResponse> {
  const sources = SOURCES[scope]
  const settled = await Promise.all(sources.map((s) => scanSource(s.id, s.dir(root), maxFileBytes)))
  const seen = new Set<string>()
  const skills: SkillItem[] = []
  for (const items of settled) {
    for (const item of items) {
      if (seen.has(item.name)) {
        skills.push({ ...item, shadowed: true })
      } else {
        seen.add(item.name)
        skills.push(item)
      }
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name))
  return { skills }
}

/**
 * Read one skill document in full. The path is re-derived from the listed
 * entries (never taken from the client), so reads stay inside the four
 * discovery directories of the requested scope.
 */
export async function readSkill(scope: Scope, root: string | undefined, name: string, maxFileBytes: number): Promise<{ path: string, content: string } | undefined> {
  const { skills } = await listSkills(scope, root, maxFileBytes)
  const item = skills.find((s) => s.name === name)
  if (item === undefined) return undefined
  return { path: item.path, content: await readFile(item.path, 'utf8') }
}
