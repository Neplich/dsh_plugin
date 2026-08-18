// dsh-agent-webuse driver server: holds one Playwright browser instance and
// answers one action per POST /run call. Spawned by the plugin as a child
// process; configuration arrives through environment variables:
//   WEBUSE_PORT      listen port (default 9334)
//   WEBUSE_PROFILE   Chrome user-data dir (required by the plugin)
//   WEBUSE_HEADLESS  '1' for headless (default headed)
//   WEBUSE_CHANNEL   playwright channel (default 'chrome')
//   WEBUSE_WIDTH / WEBUSE_HEIGHT  viewport (default 1280x800)
import http from 'node:http'
import { chromium } from 'playwright-core'

const PORT = Number(process.env.WEBUSE_PORT ?? 9334)
const PROFILE = process.env.WEBUSE_PROFILE
const HEADLESS = process.env.WEBUSE_HEADLESS === '1'
const CHANNEL = process.env.WEBUSE_CHANNEL ?? 'chrome'
const VIEWPORT = {
  width: Number(process.env.WEBUSE_WIDTH ?? 1280),
  height: Number(process.env.WEBUSE_HEIGHT ?? 800),
}

if (!PROFILE) {
  console.error('WEBUSE_PROFILE is required')
  process.exit(1)
}

const SNAPSHOT_JS = `() => {
  document.querySelectorAll('[data-dsh-webuse-idx]').forEach(e => e.removeAttribute('data-dsh-webuse-idx'))
  const sel = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[role="tab"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])'
  const out = []
  let n = 0
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    if (r.width < 2 || r.height < 2 || st.visibility === 'hidden' || st.display === 'none') continue
    if (r.bottom < 0 || r.top > innerHeight * 2) continue
    n++
    el.setAttribute('data-dsh-webuse-idx', String(n))
    const tag = el.tagName.toLowerCase()
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('value') || el.getAttribute('alt') || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
    const entry = { idx: n, tag }
    const type = el.getAttribute('type')
    if (type) entry.type = type
    if (text) entry.text = text
    const href = el.getAttribute('href')
    if (href) entry.href = href.slice(0, 120)
    out.push(entry)
    if (out.length >= 200) break
  }
  return { url: location.href, title: document.title, count: n, elements: out }
}`

let context = null

async function ensureBrowser() {
  if (context) {
    try {
      const pages = context.pages()
      if (pages.length > 0 || context.browser()?.isConnected() !== false) return context
    } catch (e) { context = null }
  }
  context = await chromium.launchPersistentContext(PROFILE, {
    channel: CHANNEL,
    headless: HEADLESS,
    viewport: VIEWPORT,
    args: ['--disable-gpu', '--no-sandbox', '--disable-crashpad', '--disable-breakpad', '--no-first-run', '--no-default-browser-check'],
  })
  context.on('close', () => { context = null })
  return context
}

function activePage(ctx) {
  const pages = ctx.pages().filter(p => !p.url().startsWith('devtools://'))
  return pages[pages.length - 1]
}

async function run(action, args) {
  if (action === 'health') {
    return { ok: true, browser: context !== null }
  }
  const ctx = await ensureBrowser()
  let page = activePage(ctx)
  if (!page && action !== 'tabs') page = await ctx.newPage()

  // Let a navigation started by the previous action settle before acting.
  if (page && !['navigate', 'tabs', 'health'].includes(action)) {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
  }

  const NAV_RACE = /Execution context was destroyed/
  const evalRetry = async (fn) => {
    try { return await fn() } catch (e) {
      if (!NAV_RACE.test(String(e && e.message ? e.message : e))) throw e
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
      return fn()
    }
  }

  switch (action) {
    case 'state':
      return { ok: true, page: page ? { url: page.url(), title: await page.title() } : null }
    case 'navigate': {
      if (args.newTab) page = await ctx.newPage()
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      return { url: page.url(), title: await page.title() }
    }
    case 'snapshot':
      return await evalRetry(() => page.evaluate('(' + SNAPSHOT_JS + ')()'))
    case 'click': {
      await page.click('[data-dsh-webuse-idx="' + args.index + '"]', { timeout: 8000 })
      await page.waitForNavigation({ timeout: 3000 }).catch(() => null)
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
      return { ok: true, url: page.url(), title: await page.title() }
    }
    case 'fill': {
      await page.fill('[data-dsh-webuse-idx="' + args.index + '"]', args.text, { timeout: 8000 })
      return { ok: true }
    }
    case 'press': {
      await page.keyboard.press(args.key)
      await page.waitForNavigation({ timeout: 3000 }).catch(() => null)
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
      return { ok: true, url: page.url() }
    }
    case 'scroll': {
      await page.evaluate(dir => {
        const m = { up: [0, -700], down: [0, 700], left: [-700, 0], right: [700, 0] }[dir] ?? [0, 700]
        window.scrollBy(m[0], m[1])
      }, args.direction ?? 'down')
      await page.waitForTimeout(300)
      return { ok: true }
    }
    case 'back': {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null)
      return { ok: true, url: page.url(), title: await page.title() }
    }
    case 'text': {
      const r = await evalRetry(() => page.evaluate(() => {
        const t = (document.body && document.body.innerText ? document.body.innerText : '').replace(/\s+\n/g, '\n').trim()
        return t.slice(0, 3000)
      }))
      return { text: r }
    }
    case 'tabs': {
      const all = ctx.pages().filter(p => !p.url().startsWith('devtools://'))
      if (args.do === 'switch') {
        await all[args.index].bringToFront()
        return { ok: true, active: args.index }
      }
      if (args.do === 'new') {
        const p = await ctx.newPage()
        if (args.url) await p.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
        return { ok: true, url: p.url() }
      }
      return { tabs: await Promise.all(all.map(async (p, i) => ({ index: i, url: p.url(), title: await p.title() }))) }
    }
    case 'eval': {
      const value = await evalRetry(() => page.evaluate(args.script))
      const json = JSON.stringify(value) ?? 'undefined'
      return { value: json.length > 20000 ? json.slice(0, 20000) + '…[truncated]' : json }
    }
    case 'screenshot': {
      const buf = await evalRetry(() => page.screenshot({ type: 'png' }))
      const vp = page.viewportSize() ?? VIEWPORT
      let path
      if (args.savePath) {
        const { mkdir, writeFile } = await import('node:fs/promises')
        const { dirname } = await import('node:path')
        await mkdir(dirname(args.savePath), { recursive: true })
        await writeFile(args.savePath, buf)
        path = args.savePath
      }
      return { pngBase64: buf.toString('base64'), bytes: buf.length, width: vp.width, height: vp.height, url: page.url(), title: await page.title(), ...(path ? { path } : {}) }
    }
    case 'shutdown': {
      setTimeout(() => process.exit(0), 200)
      return { ok: true }
    }
    default:
      throw new Error('UNKNOWN_ACTION: ' + action)
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/run') {
    res.writeHead(404).end('not found')
    return
  }
  let body = ''
  req.on('data', c => { body += c; if (body.length > 8 * 1024 * 1024) req.destroy() })
  req.on('end', async () => {
    try {
      const { action, args } = JSON.parse(body || '{}')
      const result = await run(action, args ?? {})
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(e?.message ?? e).slice(0, 800) }))
    }
  })
})
server.listen(PORT, '127.0.0.1', () => console.log('webuse driver listening on ' + PORT))

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
