/**
 * Wire contracts shared by the host routes and the browser bundle: route
 * paths, directory/file payloads, and the terminal WebSocket frame types.
 * This module ships no runtime dependencies so the client bundle inlines it.
 *
 * @module @neplich/dsh-work-panel/shared
 */

/** One directory row served by the list route. */
export interface DirEntry {
  /** Basename inside the listed directory. */
  readonly name: string
  /** Entry kind; symlinks and sockets surface as 'other' and never expand. */
  readonly kind: 'dir' | 'file' | 'other'
  /** Byte size for files; 0 for directories and other entries. */
  readonly size: number
  /** Last modification time in epoch milliseconds. */
  readonly mtimeMs: number
}

/** Body of GET /work-panel/list. */
export interface ListResponse {
  readonly entries: readonly DirEntry[]
  /** True when the directory held more rows than the server's per-directory cap. */
  readonly truncated: boolean
}

/** Body of GET /work-panel/read. */
export interface ReadResponse {
  readonly content: string
  readonly size: number
}

/** Client → host terminal frame. */
export type TerminalClientFrame =
  | { readonly type: 'input'; readonly data: string }
  | { readonly type: 'signal'; readonly signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL' | 'SIGTSTP' | 'SIGHUP' }
  | { readonly type: 'restart'; readonly cols: number; readonly rows: number }
  | { readonly type: 'close' }

/** Host → client terminal frame. */
export type TerminalServerFrame =
  | { readonly type: 'ready'; readonly pid: number; readonly cols: number; readonly rows: number; readonly exited: boolean }
  | { readonly type: 'replay'; readonly data: string }
  | { readonly type: 'data'; readonly data: string }
  | { readonly type: 'reset' }
  | { readonly type: 'exit'; readonly exitCode: number | null; readonly signal: string | null }
  | { readonly type: 'error'; readonly message: string }

/** Route paths (same-origin, registered on the Web GUI server). */
export const ROUTES = {
  list: '/work-panel/list',
  read: '/work-panel/read',
  raw: '/work-panel/raw',
  pdfJs: '/work-panel/pdfjs',
  ooxml: '/work-panel/ooxml',
  terminal: '/work-panel/terminal',
  terminalClose: '/work-panel/terminal/close',
} as const

/** True for the bounded opaque ids the client assigns to terminal work tabs. */
export function isTerminalId(value: string | null): value is string {
  return value !== null && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
}

/** Image extensions the raw route serves and the client previews inline. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'] as const

/** Lowercased extension of one path, or '' when it has none. */
export function extensionOf(path: string): string {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  return dot > slash ? path.slice(dot + 1).toLowerCase() : ''
}

/** True when the path's extension is previewable as an image. */
export function isImagePath(path: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(path))
}

/** True when the path is a PDF that can use the in-panel PDF.js viewer. */
export function isPdfPath(path: string): boolean {
  return extensionOf(path) === 'pdf'
}

/** Modern Office Open XML extensions rendered directly in the browser. */
export const OOXML_EXTENSIONS = ['docx', 'xlsx', 'pptx'] as const

/** The OOXML renderer entry associated with one preview path. */
export type OoxmlKind = typeof OOXML_EXTENSIONS[number]

/** Return the OOXML format for one path, or undefined for other files. */
export function ooxmlKindOf(path: string): OoxmlKind | undefined {
  const extension = extensionOf(path)
  return (OOXML_EXTENSIONS as readonly string[]).includes(extension) ? extension as OoxmlKind : undefined
}

/** Coarse language guess for the code preview, by extension. */
export function languageOf(path: string): string {
  switch (extensionOf(path)) {
    case 'ts': case 'mts': case 'cts': return 'typescript'
    case 'tsx': return 'tsx'
    case 'js': case 'mjs': case 'cjs': return 'javascript'
    case 'jsx': return 'jsx'
    case 'json': case 'jsonc': return 'json'
    case 'md': case 'markdown': return 'markdown'
    case 'py': return 'python'
    case 'rs': return 'rust'
    case 'go': return 'go'
    case 'java': return 'java'
    case 'kt': return 'kotlin'
    case 'c': case 'h': return 'c'
    case 'cc': case 'cpp': case 'cxx': case 'hpp': return 'cpp'
    case 'cs': return 'csharp'
    case 'rb': return 'ruby'
    case 'sh': case 'bash': case 'zsh': return 'bash'
    case 'yml': case 'yaml': return 'yaml'
    case 'toml': return 'toml'
    case 'xml': case 'svg': return 'xml'
    case 'html': case 'htm': return 'html'
    case 'css': return 'css'
    case 'scss': return 'scss'
    case 'less': return 'less'
    case 'sql': return 'sql'
    case 'swift': return 'swift'
    case 'lua': return 'lua'
    case 'dockerfile': return 'dockerfile'
    default: return 'text'
  }
}
