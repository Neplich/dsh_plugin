/**
 * dsh-agent-webuse: browser-use (computer-use style) tools for the agent.
 *
 * A long-lived driver process (`driver/server.mjs`, spawned on demand) holds
 * one Playwright-controlled Chrome instance; this plugin forwards model tool
 * calls to it over loopback HTTP and projects results into tool content.
 * Screenshots go through the durable attachment service; when the deployment
 * cannot carry images (no attachment service, or the routed model lacks image
 * input) the screenshot tool degrades to a temp-file save plus a page text
 * summary instead of failing.
 *
 * @module @neplich/dsh-agent-webuse
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { openSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ParameterSchemaSpec, InferArgs, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-llm'

/** Cordis plugin name; also the cordis.patch.yml row id. */
export const name = 'agent-webuse'

/** The tool registry is a hard dependency; everything else degrades. */
export const inject = ['tools']

/** Deployment-tunable driver settings. Invalid values fail plugin load. */
export interface Config {
  /** Loopback port for the driver HTTP server. */
  port: number
  /** Run Chrome headless instead of headed. */
  headless: boolean
  /** Playwright channel used to locate the browser executable. */
  channel: string
  /** Chrome user-data dir; defaults to `$DSH_HOME/webuse/chrome-profile`. */
  profileDir?: string | null
  /** Browser viewport width in px. */
  viewportWidth: number
  /** Browser viewport height in px. */
  viewportHeight: number
  /** Directory for degraded (no-image) screenshot saves. */
  fallbackDir?: string | null
}

/** Schemastery validation for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  port: Schema.natural().default(9334),
  headless: Schema.boolean().default(false),
  channel: Schema.string().default('chrome'),
  profileDir: Schema.string(),
  viewportWidth: Schema.natural().default(1280),
  viewportHeight: Schema.natural().default(800),
  fallbackDir: Schema.string(),
})

/** One-line page summary used by navigation-type results. */
export function formatPage(r: { url?: string; title?: string }): string {
  return `url: ${r.url ?? ''}\ntitle: ${r.title ?? ''}`
}

/** Numbered interactive-element listing behind webuse_snapshot. */
export function formatSnapshot(r: { url?: string; title?: string; count?: number; elements?: { idx: number; tag: string; type?: string; text?: string; href?: string }[] }): string {
  const lines = (r.elements ?? []).map(e => {
    let s = `${e.idx}. <${e.tag}${e.type !== undefined ? ` type=${e.type}` : ''}>`
    if (e.text !== undefined) s += ` "${e.text}"`
    if (e.href !== undefined) s += ` href=${e.href}`
    return s
  })
  const head = `url: ${r.url ?? ''}\ntitle: ${r.title ?? ''}\ninteractive elements: ${r.count ?? 0}`
  return head + '\n' + (lines.length === 0 ? '(none — try webuse_screenshot to see the page)' : lines.join('\n'))
}

/** The bundled driver entry, resolved against the installed package root. */
const DRIVER = fileURLToPath(new URL('../driver/server.mjs', import.meta.url))

/** Harness home: `$DSH_HOME`, else `~/.dsh`. */
function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** One driver action's JSON response (fields vary by action). */
interface DriverResult {
  ok?: boolean
  browser?: boolean
  url?: string
  title?: string
  count?: number
  elements?: { idx: number; tag: string; type?: string; text?: string; href?: string }[]
  tabs?: { index: number; url: string; title: string }[]
  active?: number
  value?: string
  text?: string
  path?: string
  pngBase64?: string
  bytes?: number
  width?: number
  height?: number
  page?: { url: string; title: string } | null
  error?: string
}

/**
 * Register the twelve webuse_* tools; the driver child process belongs to the
 * plugin fiber and is killed on disposal.
 * @param ctx - host root context.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  const port = config.port
  const base = `http://127.0.0.1:${port}/run`
  const profileDir = config.profileDir ?? join(dshHome(), 'webuse', 'chrome-profile')
  const fallbackDir = config.fallbackDir ?? join(tmpdir(), 'dsh-webuse-fallback')
  let driver: ChildProcess | undefined

  const callDriver = async (action: string, args: Record<string, unknown>, timeoutMs: number, exec?: ToolRunContext): Promise<DriverResult> => {
    const signal = exec === undefined
      ? AbortSignal.timeout(timeoutMs)
      : AbortSignal.any([exec.signal, AbortSignal.timeout(timeoutMs)])
    let res: Response
    try {
      res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, args }),
        signal,
      })
    } catch (error: unknown) {
      throw new Error(`webuse ${action}: driver unreachable: ${error instanceof Error ? error.message : String(error)}`)
    }
    const body = await res.json() as DriverResult
    if (!res.ok || body.error !== undefined) {
      throw new Error(`webuse ${action} failed: ${body.error ?? res.status}`)
    }
    return body
  }

  const healthy = async (exec?: ToolRunContext): Promise<boolean> => {
    try {
      await callDriver('health', {}, 3000, exec)
      return true
    } catch {
      return false
    }
  }

  const ensureServer = async (exec?: ToolRunContext): Promise<void> => {
    if (await healthy(exec)) return
    if (driver === undefined) {
      const logPath = join(tmpdir(), 'dsh-webuse-driver.log')
      const logFd = openSync(logPath, 'a')
      const child = spawn(process.execPath, [DRIVER], {
        env: {
          ...process.env,
          WEBUSE_PORT: String(port),
          WEBUSE_PROFILE: profileDir,
          WEBUSE_HEADLESS: config.headless ? '1' : '0',
          WEBUSE_CHANNEL: config.channel,
          WEBUSE_WIDTH: String(config.viewportWidth),
          WEBUSE_HEIGHT: String(config.viewportHeight),
        },
        stdio: ['ignore', logFd, logFd],
      })
      driver = child
      child.on('error', (error) => {
        console.error(`[agent-webuse] driver spawn failed (script=${DRIVER}): ${error.message}`)
        if (driver === child) driver = undefined
      })
      child.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) console.error(`[agent-webuse] driver exited code=${code} signal=${signal}; see ${logPath}`)
        if (driver === child) driver = undefined
      })
    }
    // Cold start includes browser launch; poll until the driver answers.
    const deadline = Date.now() + 30000
    let lastError = 'unknown'
    while (Date.now() < deadline) {
      try {
        await callDriver('health', {}, 3000, exec)
        return
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message.slice(0, 200) : String(error)
        await new Promise(resolve => setTimeout(resolve, 400))
      }
    }
    throw new Error(`webuse: driver did not come up on port ${port}: ${lastError}`)
  }

  ctx.effect(() => () => {
    if (driver !== undefined) {
      const child = driver
      driver = undefined
      child.kill('SIGTERM')
    }
  })

  /** Register one text-result tool whose body runs against a live driver. */
  const textTool = <S extends ParameterSchemaSpec>(def: {
    toolName: string
    description: string
    parameters: S
    timeoutMs?: number
    run: (args: InferArgs<S>, exec: ToolRunContext) => Promise<string>
  }): void => {
    ctx.tools.register(defineTool({
      name: def.toolName,
      description: def.description,
      parameters: def.parameters,
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { text: { type: 'string', required: true } },
        },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      timeoutMs: def.timeoutMs ?? 120000,
      async execute(args, exec) {
        await ensureServer(exec)
        return { text: await def.run(args as InferArgs<S>, exec) }
      },
    }))
  }


  textTool({
    toolName: 'webuse_launch',
    description: 'Start the automation browser (a dedicated Chrome controlled by the harness) if it is not running yet. Call this once before other webuse_* tools; they also auto-start it on demand.',
    parameters: {},
    run: async () => 'automation browser is up',
  })

  textTool({
    toolName: 'webuse_navigate',
    description: 'Open a URL in the automation browser. Returns the final URL and page title.',
    parameters: {
      url: { type: 'string', required: true, description: 'The URL to open, including https://' },
      newTab: { type: 'boolean', description: 'Open in a new tab instead of the current one.' },
    },
    timeoutMs: 120000,
    run: async (args, exec) => formatPage(await callDriver('navigate', { url: args.url, ...(args.newTab === true ? { newTab: true } : {}) }, 90000, exec)),
  })

  textTool({
    toolName: 'webuse_snapshot',
    description: 'List the interactive elements (links, buttons, inputs, …) of the current page as a numbered list. Use the numbers with webuse_click / webuse_fill. Numbers are invalidated by navigation or DOM changes — take a fresh snapshot before acting.',
    parameters: {},
    run: async (_args, exec) => formatSnapshot(await callDriver('snapshot', {}, 30000, exec)),
  })

  textTool({
    toolName: 'webuse_click',
    description: 'Click an interactive element by its number from the latest webuse_snapshot.',
    parameters: {
      index: { type: 'integer', required: true, description: 'Element number from webuse_snapshot.' },
    },
    run: async (args, exec) => formatPage(await callDriver('click', { index: args.index }, 30000, exec)),
  })

  textTool({
    toolName: 'webuse_fill',
    description: 'Clear and type text into an input/textarea element by its number from the latest webuse_snapshot.',
    parameters: {
      index: { type: 'integer', required: true, description: 'Element number from webuse_snapshot.' },
      text: { type: 'string', required: true, description: 'Text to type into the element.' },
    },
    run: async (args, exec) => {
      await callDriver('fill', { index: args.index, text: args.text }, 30000, exec)
      return `filled element ${args.index}`
    },
  })

  textTool({
    toolName: 'webuse_press',
    description: 'Press a keyboard key (e.g. Enter, Tab, Escape, ArrowDown) in the current page.',
    parameters: {
      key: { type: 'string', required: true, description: 'Key name, e.g. "Enter", "Tab", "Escape".' },
    },
    run: async (args, exec) => {
      const r = await callDriver('press', { key: args.key }, 30000, exec)
      return `pressed ${args.key}\nurl: ${r.url ?? ''}`
    },
  })

  textTool({
    toolName: 'webuse_scroll',
    description: 'Scroll the current page up or down by one viewport-ish step.',
    parameters: {
      direction: { type: 'string', required: true, description: 'up | down | left | right' },
    },
    run: async (args, exec) => {
      await callDriver('scroll', { direction: args.direction }, 30000, exec)
      return `scrolled ${args.direction}`
    },
  })

  textTool({
    toolName: 'webuse_back',
    description: 'Go back to the previous page in the browser history.',
    parameters: {},
    run: async (_args, exec) => formatPage(await callDriver('back', {}, 30000, exec)),
  })

  textTool({
    toolName: 'webuse_tabs',
    description: 'List, switch, or open browser tabs. With no argument, lists tabs with indexes; "switch" activates the tab at index; "new" opens a tab (optionally with a URL).',
    parameters: {
      do: { type: 'string', description: 'list (default) | switch | new' },
      index: { type: 'integer', description: 'Tab index for "switch", from the list output.' },
      url: { type: 'string', description: 'URL to open for "new".' },
    },
    run: async (args, exec) => {
      const r = await callDriver('tabs', { ...(args.do !== undefined ? { do: args.do } : {}), ...(args.index !== undefined ? { index: args.index } : {}), ...(args.url !== undefined ? { url: args.url } : {}) }, 60000, exec)
      if (r.tabs !== undefined) return r.tabs.map(t => `${t.index}. ${t.title || '(untitled)'} — ${t.url}`).join('\n')
      return `ok: ${JSON.stringify(r)}`
    },
  })

  textTool({
    toolName: 'webuse_eval',
    description: 'Run a JavaScript expression in the current page and return its JSON result. Use for data extraction, e.g. document.title or Array.from(document.querySelectorAll("h2")).map(e=>e.innerText).',
    parameters: {
      script: { type: 'string', required: true, description: 'JavaScript expression evaluated in page context.' },
    },
    run: async (args, exec) => String((await callDriver('eval', { script: args.script }, 30000, exec)).value ?? ''),
  })

  textTool({
    toolName: 'webuse_close',
    description: 'Close the automation browser and its driver process if they were started by webuse.',
    parameters: {},
    run: async (_args, exec) => {
      try { await callDriver('shutdown', {}, 5000, exec) } catch { /* driver may exit before replying */ }
      if (driver !== undefined) {
        const child = driver
        driver = undefined
        child.kill('SIGTERM')
      }
      return 'closed the webuse automation browser'
    },
  })

  /** The screenshot value's image half, mirroring read_image's attachment ref. */
  interface ShotImage {
    attachmentId: string
    mediaType: string
    bytes: number
    width: number
    height: number
    name?: string
  }

  ctx.tools.register(defineTool({
    name: 'webuse_screenshot',
    description: 'Take a PNG screenshot of the current automation-browser page. Returns the image itself when the current model accepts image input; otherwise saves the PNG to a file and returns its path with a page text summary.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          title: { type: 'string', required: true },
          degraded: { type: 'boolean' },
          path: { type: 'string' },
          reason: { type: 'string' },
          pageText: { type: 'string' },
          image: {
            type: 'object',
            additionalProperties: false,
            properties: {
              attachmentId: { type: 'string', required: true },
              mediaType: { type: 'string', required: true },
              bytes: { type: 'integer', required: true },
              width: { type: 'integer', required: true },
              height: { type: 'integer', required: true },
              name: { type: 'string' },
            },
          },
        },
      },
      render: (_args, value) => {
        if (value.image === undefined) {
          return [{ type: 'text', text: `<url>${value.url}</url>\n<title>${value.title}</title>\n<degraded>${value.reason ?? 'image output unavailable'}</degraded>\n<saved>${value.path ?? ''}</saved>\n<page-text>\n${value.pageText ?? ''}\n</page-text>` }]
        }
        const image: ShotImage = value.image
        return [
          { type: 'text', text: `<url>${value.url}</url>\n<title>${value.title}</title>\n<content>\nimage/png screenshot, ${image.width}x${image.height} px, ${image.bytes} bytes\n</content>` },
          { type: 'image', attachment: { attachmentId: AttachmentId(image.attachmentId), mediaType: 'image/png', bytes: image.bytes, width: image.width, height: image.height, ...(image.name === undefined ? {} : { name: image.name }) } },
        ]
      },
    },
    timeoutMs: 150000,
    async execute(_args, exec) {
      // Capability probe: degrade (never hard-fail) when images cannot be carried.
      const attachments = ctx.get('attachments')
      let degradedReason: string | undefined
      if (attachments === undefined) degradedReason = 'no attachment service is mounted'
      const routed = exec.agent?.session.requestHeader()?.config
      const provider = routed?.provider ?? exec.agent?.options.provider
      const model = routed?.model ?? exec.agent?.options.model
      const llm = ctx.get('llm')
      if (degradedReason === undefined && provider !== undefined && model !== undefined && llm !== undefined) {
        const info = await llm.resolveModelInfo(provider, model, exec.signal)
        if (info.inputModalities !== undefined && !info.inputModalities.includes('image')) {
          degradedReason = `model "${model}" does not declare image input`
        }
      }
      await ensureServer(exec)
      if (degradedReason !== undefined) {
        const savePath = join(fallbackDir, `webuse-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)
        const r = await callDriver('screenshot', { savePath }, 90000, exec)
        let pageText = ''
        try { pageText = (await callDriver('text', {}, 30000, exec)).text ?? '' } catch { /* page text is best-effort */ }
        return { url: r.url ?? '', title: r.title ?? '', degraded: true, path: r.path ?? savePath, reason: degradedReason, pageText }
      }
      const r = await callDriver('screenshot', {}, 90000, exec)
      const png: Uint8Array = Buffer.from(r.pngBase64 ?? '', 'base64')
      const ref = await attachments!.saveImage({ data: png, mediaType: 'image/png', name: 'webuse-screenshot.png' })
      return {
        url: r.url ?? '',
        title: r.title ?? '',
        image: {
          attachmentId: ref.attachmentId,
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          ...(ref.name === undefined ? {} : { name: ref.name }),
        },
      }
    },
  }))
}
