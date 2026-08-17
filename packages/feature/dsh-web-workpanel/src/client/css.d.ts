/** Ambient typing for text-loaded stylesheet imports (see tsdown.config.ts). */
declare module '*.css' {
  const css: string
  export default css
}
