/**
 * tsdown config: emits lib/client.js as a closure-factory CJS artifact the
 * Web GUI module loader materializes (window.__ModuleLoader__.load handoff,
 * module.exports return). The mermaid engine is NOT bundled: the host half
 * serves its UMD build over a loopback route and the client injects one
 * script tag, keeping this bundle small and mermaid's lazy diagram chunks
 * out of the single-file loader contract.
 */
import { defineConfig } from 'tsdown'

const ID = '@neplich/dsh-chat-mermaid'

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
