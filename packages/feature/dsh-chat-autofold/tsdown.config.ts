/**
 * tsdown config: emits lib/client.js as a closure-factory CJS artifact the
 * Web GUI module loader materializes (window.__ModuleLoader__.load handoff,
 * module.exports return). The client entry imports only the client-runtime
 * type, which tsdown erases — the bundle is self-contained, so no externals
 * or inlining rules are needed.
 */
import { defineConfig } from 'tsdown'

const ID = '@neplich/dsh-chat-autofold'

export default defineConfig({
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
