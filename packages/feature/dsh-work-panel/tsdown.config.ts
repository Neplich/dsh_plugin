/**
 * tsdown config: emits lib/client.js as a closure-factory CJS artifact the
 * Web GUI module loader materializes (window.__ModuleLoader__.load handoff,
 * module.exports return). Platform modules (react, the slot/primitive
 * libraries, the runtime store engine) stay external and resolve through the
 * loader's injected require; xterm and every other dependency inline. Plain
 * `.css` imports load as text so the bundle can inject one
 * <style data-plugin> tag at apply time (the loader removes plugin-owned
 * tags on unload).
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'

const ID = '@neplich/dsh-work-panel'

/** Modules the Web GUI loader table answers; everything else must inline. */
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

const CSS_PREFIX = '\0dsh-work-panel-css:'

/** Resolve one css import to its physical file: relative to the importer, or through the package's own directory. */
async function cssFile(source: string, importer: string | undefined): Promise<string> {
  if (source.startsWith('.') && importer !== undefined) return resolvePath(dirname(importer), source)
  // Bare specifier like '@xterm/xterm/css/xterm.css': locate the package root
  // through its main entry, then join the in-package path (exports maps do
  // not always list css assets).
  const slash = source.indexOf('/')
  const packageName = source.startsWith('@') ? source.slice(0, source.indexOf('/', slash + 1)) : source.slice(0, slash < 0 ? undefined : slash)
  const inPackage = source.slice(packageName.length).replace(/^\/+/, '')
  const entry = import.meta.resolve(packageName)
  let dir = dirname(new URL(entry).pathname)
  const { readFile: read } = await import('node:fs/promises')
  // Walk up until the package's own manifest (workspace stores nest node_modules).
  for (;;) {
    try {
      const manifest = JSON.parse((await read(resolvePath(dir, 'package.json'))).toString()) as { name?: string }
      if (manifest.name === packageName) break
    } catch {
      // No manifest here: keep walking.
    }
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`cannot locate package root for ${packageName}`)
    dir = parent
  }
  return resolvePath(dir, inPackage)
}

export default defineConfig({
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...EXTERNALS],
  noExternal: (id) => (EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  plugins: [{
    name: 'dsh-work-panel-css-text',
    resolveId(source, importer) {
      if (!source.endsWith('.css')) return null
      return CSS_PREFIX + JSON.stringify([source, importer ?? null])
    },
    async load(id) {
      if (!id.startsWith(CSS_PREFIX)) return null
      const [source, importer] = JSON.parse(id.slice(CSS_PREFIX.length)) as [string, string | null]
      const code = await readFile(await cssFile(source, importer ?? undefined))
      return `export default ${JSON.stringify(code.toString())};`
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
