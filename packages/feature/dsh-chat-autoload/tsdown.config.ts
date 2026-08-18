/**
 * tsdown config: emits lib/client.js as a closure-factory CJS artifact the
 * Web GUI module loader materializes (window.__ModuleLoader__.load handoff,
 * module.exports return). React stays external and resolves through the
 * loader's injected require; everything else is type-only and erased.
 */
import { defineConfig } from 'tsdown'

const ID = '@neplich/dsh-chat-autoload'

export default defineConfig({
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: ['react', 'react/jsx-runtime'],
  noExternal: (id) => (id === 'react' || id === 'react/jsx-runtime' ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
