/**
 * AGENTS.md instruction files for the Config Center: the personal level
 * ($DSH_HOME) and the project-root level, each with the base document, its
 * *.local.md overlay, and the read-only CLAUDE.md companions. Writes are
 * confined to paths re-derived here from (scope, root, kind) — the client
 * never supplies a path.
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dshHome } from '@neplich/dsh-config-shared'
import type { InstructionFile, InstructionKind, InstructionsResponse, Scope } from '../shared.ts'

/** File names per kind, matching the harness defaults (AGENTS.md / CLAUDE.md / *.local.md). */
const FILE_NAMES: Record<InstructionKind, string> = {
  base: 'AGENTS.md',
  local: 'AGENTS.local.md',
  claude: 'CLAUDE.md',
  claudeLocal: 'CLAUDE.local.md',
}

/** Only the AGENTS.md family is writable; CLAUDE.md companions are shown read-only. */
const WRITABLE: ReadonlySet<InstructionKind> = new Set(['base', 'local'])

/** Level directory for a scope: $DSH_HOME for personal, the project root otherwise. */
function levelDir(scope: Scope, root: string | undefined): string {
  return scope === 'personal' ? dshHome() : (root ?? '')
}

/** Absolute path of one instruction file, derived entirely server-side. */
export function instructionPath(scope: Scope, root: string | undefined, kind: InstructionKind): string {
  return join(levelDir(scope, root), FILE_NAMES[kind])
}

/**
 * Read the four instruction files of one level. Content is capped at
 * maxBytes; larger files come back truncated with a flag.
 */
export async function listInstructions(scope: Scope, root: string | undefined, maxBytes: number): Promise<InstructionsResponse> {
  const kinds: readonly InstructionKind[] = ['base', 'local', 'claude', 'claudeLocal']
  const files: InstructionFile[] = []
  for (const kind of kinds) {
    const path = instructionPath(scope, root, kind)
    const info = await stat(path).catch(() => undefined)
    if (info === undefined || !info.isFile()) {
      files.push({ kind, path, exists: false, writable: WRITABLE.has(kind), content: '', sizeBytes: 0, truncated: false })
      continue
    }
    const raw = await readFile(path)
    const truncated = raw.length > maxBytes
    const content = truncated ? raw.subarray(0, maxBytes).toString('utf8') : raw.toString('utf8')
    files.push({ kind, path, exists: true, writable: WRITABLE.has(kind), content, sizeBytes: info.size, truncated })
  }
  return { files }
}

/**
 * Write one writable instruction file atomically (temp file + rename),
 * creating the level directory when missing. Returns the refreshed level.
 */
export async function writeInstruction(scope: Scope, root: string | undefined, kind: InstructionKind, content: string, maxBytes: number): Promise<InstructionsResponse> {
  if (!WRITABLE.has(kind)) {
    throw new Error('instruction kind ' + kind + ' is read-only')
  }
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    throw new Error('content exceeds the ' + maxBytes + '-byte limit')
  }
  const path = instructionPath(scope, root, kind)
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.config-center-' + String(process.pid) + '.tmp'
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
  return listInstructions(scope, root, maxBytes)
}