/**
 * dsh-agent-imagevault: image archiving and display for tool results.
 *
 * Two independent jobs:
 *
 * 1. Archive — every image block appearing in any tool result (screenshots,
 *    read_image, uploads, …) is copied out of the durable attachment store
 *    into an export directory so the user has plain files. Best-effort:
 *    listener failures are contained and logged, never thrown.
 * 2. Display — a loopback HTTP server answers `GET /sha256:<hex>.<ext>`
 *    straight from the content-addressed attachment store, giving every
 *    session image a stable URL that lives exactly as long as the session
 *    history. The Web GUI's markdown renderer accepts http(s) image URLs, so
 *    the agent can embed these URLs to show images in the chat stream.
 *
 * The display route reads the local attachment backend's file layout; with a
 * non-local attachment backend mounted it answers 404 (archive still works).
 *
 * @module @neplich/dsh-agent-imagevault
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-attachment'

/** Cordis plugin name; also the cordis.patch.yml row id. */
export const name = 'agent-imagevault'

/** The tool registry is a hard dependency; the attachment service degrades. */
export const inject = ['tools']

/** Deployment-tunable storage and server settings. */
export interface Config {
  /** Loopback port for the display HTTP server. */
  port: number
  /** Directory receiving archived image files. */
  exportDir?: string | null
  /** Content-addressed attachment object root of the local backend. */
  storeDir?: string | null
}

/** Schemastery validation for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  port: Schema.natural().default(9335),
  exportDir: Schema.string(),
  storeDir: Schema.string(),
})

/** Harness home: `$DSH_HOME`, else `~/.dsh`. */
function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

const MEDIA_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const EXTENSION_MEDIA: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

const ATTACHMENT_ID = /^sha256:([a-f0-9]{64})$/
const DISPLAY_PATH = /^\/(sha256:[a-f0-9]{64})\.(png|jpg|jpeg|webp|gif)$/

/** Map one validated attachment id to its object file below the local store root. */
export function attachmentObjectPath(storeDir: string, attachmentId: string): string | undefined {
  const hex = ATTACHMENT_ID.exec(attachmentId)?.[1]
  if (hex === undefined) return undefined
  return join(storeDir, hex.slice(0, 2), hex)
}

/**
 * Start the archive listener and the display server; both belong to the
 * plugin fiber.
 * @param ctx - host root context.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  const exportDir = config.exportDir ?? join(tmpdir(), 'dsh-image-vault')
  const storeDir = config.storeDir ?? join(dshHome(), 'attachments', 'v1', 'objects')
  const base = `http://127.0.0.1:${config.port}`

  // --- Archive: copy every tool-result image into exportDir ----------------
  ctx.on('tools/result', (exec, result) => {
    const attachments = ctx.get('attachments')
    if (attachments === undefined) return
    let index = 0
    for (const block of result.content) {
      if (block.type !== 'image') continue
      const ref = block.attachment
      const match = ATTACHMENT_ID.exec(String(ref.attachmentId))
      if (match === null) continue
      const ext = MEDIA_EXTENSIONS[ref.mediaType] ?? 'png'
      const tool = String(exec.name ?? 'tool').replace(/[^a-z0-9_-]/gi, '_')
      const file = join(exportDir, `${tool}-${new Date().toISOString().replace(/[:.]/g, '-')}-${index}.${ext}`)
      index++
      void (async () => {
        const stored = await attachments.readImage(ref)
        await mkdir(exportDir, { recursive: true })
        await writeFile(file, stored.data)
      })().catch((error: unknown) => {
        console.error(`[agent-imagevault] archive failed for ${file}: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  })

  // --- Display: serve attachment objects over loopback HTTP ----------------
  const server: Server = createServer((req, res) => {
    void (async () => {
      const match = DISPLAY_PATH.exec((req.url ?? '/').split('?')[0] ?? '/')
      if (match === null) {
        res.writeHead(404).end()
        return
      }
      const path = attachmentObjectPath(storeDir, match[1] ?? '')
      const mediaType = EXTENSION_MEDIA[match[2] ?? '']
      if (path === undefined || mediaType === undefined) {
        res.writeHead(404).end()
        return
      }
      try {
        const info = await stat(path)
        if (!info.isFile()) throw new Error('not a file')
        res.writeHead(200, {
          'content-type': mediaType,
          'content-length': info.size,
          'cache-control': 'no-cache',
        })
        res.end(await readFile(path))
      } catch {
        res.writeHead(404).end()
      }
    })()
  })

  ctx.effect(() => {
    server.listen(config.port, '127.0.0.1')
    return () => new Promise<void>(resolve => server.close(() => resolve()))
  })

  // --- Directory tool -------------------------------------------------------
  ctx.tools.register(defineTool({
    name: 'imagevault_dir',
    description: 'Return where tool-result images live: the HTTP base URL that renders any attachment in the chat stream (append "<attachmentId>.png"), and the export directory holding plain-file copies.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    timeoutMs: 30000,
    async execute() {
      return {
        text: [
          `display-url: ${base}/<attachmentId>.png   (attachmentId looks like sha256:<64 hex chars>; served from the durable attachment store, lives as long as the session history)`,
          `export-dir: ${exportDir}   (plain-file copies for opening locally; a temp location that the OS may clean)`,
        ].join('\n'),
      }
    },
  }))
}
