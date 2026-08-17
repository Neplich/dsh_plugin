/**
 * Constants shared by the host route and the browser half. The client bundle
 * inlines this module, so it must stay free of Node imports.
 *
 * @module @neplich/dsh-mermaid/shared
 */

/** Loopback route serving the mermaid UMD build; the client injects it as one script tag. */
export const MERMAID_SCRIPT_PATH = '/dsh-mermaid/mermaid.min.js'
