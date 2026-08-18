/**
 * History autoload plugin, node half. Pure browser-side plugin: the empty
 * apply exists so the plugin appears in the host cordis.yml / Loader; the
 * browser half ships via exports["./client"], discovered through the
 * package.json dsh.client declaration.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'chat-autoload'

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
