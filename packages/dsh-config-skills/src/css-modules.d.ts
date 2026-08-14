/** Ambient CSS Modules declaration: the client bundle compiles *.module.css to a class map. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
