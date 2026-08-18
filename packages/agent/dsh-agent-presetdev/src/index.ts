/**
 * dsh agent-preset installer bundle: installs the 开发模式 (dev) agent preset —
 * the standard coding agent with Code Mode presentation plus the cordis
 * runtime-inspection toolset — into the user preset root.
 *
 * An agent preset is files, not a cordis row: the roster discovers presets
 * from its roots on every read, and the user root is `$DSH_HOME/.agent-presets`.
 * This plugin's one job is to place the bundled preset directory there, so
 * `dsh plugin add` is the install step and the preset shows up in the roster
 * on the next read. Installation is idempotent — an existing copy is left
 * untouched so local edits survive — and `DSH_PRESET_DEV_FORCE=1` re-installs
 * the bundle version over it.
 *
 * @module @neplich/dsh-agent-presetdev
 */

import { cp, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

/** Cordis plugin name; also the patch-row id and the preset id this installs. */
export const name = 'agent-presetdev'

/** The bundled preset directory (`presets/dev` inside the package). */
const PRESET_SOURCE = fileURLToPath(new URL('../presets/dev/', import.meta.url))

/** The composition file that marks an installed preset. */
const MARKER = 'agent.cordis.yml'

/**
 * The user-root destination directory for the dev preset.
 * @param dshHome - harness home, defaulting to `$DSH_HOME` or `~/.dsh`.
 */
export function presetDestination(dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')): string {
  return join(dshHome, '.agent-presets', 'dev')
}

/**
 * Install the bundled preset into `dest`, idempotently.
 * @param dest - destination preset directory.
 * @param options - `force` re-installs over an existing copy; `source` overrides the bundled preset directory.
 * @returns `installed` (was absent), `skipped` (already present), or `updated` (force re-install).
 */
export async function installPreset(
  dest: string,
  options: { force?: boolean; source?: string } = {},
): Promise<'installed' | 'skipped' | 'updated'> {
  const source = options.source ?? PRESET_SOURCE
  try {
    await stat(join(dest, MARKER))
  } catch {
    await cp(source, dest, { recursive: true })
    return 'installed'
  }
  if (options.force === true) {
    await cp(source, dest, { recursive: true, force: true })
    return 'updated'
  }
  return 'skipped'
}

/** Whether the installed composition differs from the bundled one. */
async function bundledCopyDiffers(dest: string): Promise<boolean> {
  try {
    const [installed, bundled] = await Promise.all([
      readFile(join(dest, MARKER), 'utf8'),
      readFile(join(PRESET_SOURCE, MARKER), 'utf8'),
    ])
    return installed !== bundled
  } catch {
    return false
  }
}

/** Install on startup; a failure is logged, never fatal. */
export function apply(ctx: Context): void {
  const dest = presetDestination()
  const force = process.env.DSH_PRESET_DEV_FORCE === '1'
  void installPreset(dest, { force }).then(async (result) => {
    if (result === 'installed') {
      ctx.logger.info(`agent-presetdev: installed the dev preset at ${dest}`)
    } else if (result === 'updated') {
      ctx.logger.info(`agent-presetdev: re-installed the dev preset at ${dest}`)
    } else if (await bundledCopyDiffers(dest)) {
      ctx.logger.warn(
        'agent-presetdev: the installed dev preset differs from this bundle (locally edited or upgraded); '
        + 'run with DSH_PRESET_DEV_FORCE=1 to re-install the bundled version',
      )
    }
  }).catch((error: unknown) => {
    ctx.logger.error(`agent-presetdev: failed to install the dev preset: ${String(error)}`)
  })
}
