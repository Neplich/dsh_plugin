/**
 * Annotation identity colors: the deepseek blue family (standard design
 * tokens, identical values across themes). `--dsw-alias-brand-primary` is
 * near-white in dark theme, so annotations must not use it.
 */

/** Accent blue for chrome (chip / popover index). */
export const BLUE = 'var(--dsw-static-deepseek-450, #5686fe)'

/** Lighter blue for the flash ring. */
export const BLUE_SOFT = 'var(--dsw-static-deepseek-400, #679efe)'

/** Highlight blue: the light-theme primary blue in BOTH themes. */
export const HIGHLIGHT = 'var(--dsw-static-deepseek-500, #4176e6)'
