/**
 * Shared chrome styles for the config-* settings sections: a plain
 * cc--prefixed sheet shipped as a JS string plus its class map. Shipping
 * CSS as JS lets consumer bundles inline this package whole — no CSS
 * pipeline handoff for cross-package .module.css imports. Injection is
 * idempotent per document.
 */

/** The shared sheet text (cc- prefixed plain classes). */
export const SHARED_CSS: string = [
  "/* Shared chrome styles for the @neplich/dsh-config-* settings sections.",
  " * Plain CSS with a cc- prefix (no module hashing): the sheet ships as a JS",
  " * string so consumers can inline this package without a CSS pipeline. */",
  "",
  ".cc-section { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }",
  "",
  ".cc-heading {",
  "  margin: 0;",
  "  font-size: 18px;",
  "  font-weight: 600;",
  "  color: var(--dsw-alias-label-primary);",
  "}",
  "",
  ".cc-intro {",
  "  margin: 0;",
  "  font-size: 13px;",
  "  line-height: 1.6;",
  "  color: var(--dsw-alias-label-secondary);",
  "}",
  "",
  ".cc-page { flex: 1; min-height: 0; }",
  "",
  ".cc-error { margin: 8px 0 0; font-size: 12px; color: var(--dsw-alias-label-error); }",
  "",
  ".cc-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }",
  "",
  ".cc-toolbarSpacer { flex: 1; }",
  "",
  ".cc-segments {",
  "  display: inline-flex;",
  "  padding: 2px;",
  "  gap: 2px;",
  "  border-radius: 8px;",
  "  background: var(--dsw-alias-bg-layer-2);",
  "}",
  "",
  ".cc-segment {",
  "  appearance: none;",
  "  border: none;",
  "  background: none;",
  "  border-radius: 6px;",
  "  padding: 4px 14px;",
  "  font-size: 12px;",
  "  color: var(--dsw-alias-label-secondary);",
  "  cursor: pointer;",
  "}",
  "",
  ".cc-segment:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }",
  "",
  ".cc-segment[data-active=\"true\"] {",
  "  background: var(--dsw-alias-bg-layer-3);",
  "  color: var(--dsw-alias-label-primary);",
  "  font-weight: 500;",
  "}",
  "",
  ".cc-segment:disabled { opacity: 0.45; cursor: not-allowed; }",
  "",
  ".cc-rootSelect {",
  "  appearance: none;",
  "  border: 1px solid var(--dsw-alias-border-l2);",
  "  border-radius: 8px;",
  "  background: var(--dsw-alias-bg-layer-2);",
  "  color: var(--dsw-alias-label-primary);",
  "  font-size: 12px;",
  "  padding: 5px 26px 5px 10px;",
  "  max-width: 320px;",
  "  text-overflow: ellipsis;",
  "  cursor: pointer;",
  "  background-image: linear-gradient(45deg, transparent 50%, var(--dsw-alias-label-tertiary) 50%), linear-gradient(135deg, var(--dsw-alias-label-tertiary) 50%, transparent 50%);",
  "  background-position: calc(100% - 14px) 55%, calc(100% - 9px) 55%;",
  "  background-size: 5px 5px;",
  "  background-repeat: no-repeat;",
  "}",
  "",
  ".cc-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); }",
  "",
  ".cc-pathNote {",
  "  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;",
  "  font-size: 11px;",
  "  color: var(--dsw-alias-label-caption);",
  "  word-break: break-all;",
  "}",
].join('\n')

/** Typed handle over the shared class names. */
export const styles = {
  section: 'cc-section',
  heading: 'cc-heading',
  intro: 'cc-intro',
  page: 'cc-page',
  error: 'cc-error',
  toolbar: 'cc-toolbar',
  toolbarSpacer: 'cc-toolbarSpacer',
  segments: 'cc-segments',
  segment: 'cc-segment',
  rootSelect: 'cc-rootSelect',
  hint: 'cc-hint',
  pathNote: 'cc-pathNote',
} as const

/** Style-tag identity: one tag per document, reused across plugin bundles. */
const TAG_ID = 'dsh-config-shared'

/** Inject the shared sheet once per document (no-op outside the browser). */
export function ensureSharedStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css="' + TAG_ID + '"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = SHARED_CSS
  document.head.appendChild(tag)
}

// Module evaluation injects the sheet; every consumer bundle carries this
// module, and the guard keeps the tag singular.
ensureSharedStyles()
