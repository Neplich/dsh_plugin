import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

import * as plugin from '../src/index.ts'

test('exports the function-plugin loader contract', () => {
  expect(plugin.name).toBe('agent-presetdev')
  expect(typeof plugin.apply).toBe('function')
})

test('presetDestination resolves under the harness home', () => {
  expect(plugin.presetDestination('/tmp/fake-home')).toBe(join('/tmp/fake-home', '.agent-presets', 'dev'))
})

test('installPreset installs into an empty destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-presetdev-'))
  const source = join(root, 'source')
  await mkdir(source)
  await writeFile(join(source, 'agent.cordis.yml'), 'composition-a\n')
  const dest = join(root, 'dest')
  try {
    expect(await plugin.installPreset(dest, { source })).toBe('installed')
    expect(await readFile(join(dest, 'agent.cordis.yml'), 'utf8')).toBe('composition-a\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('installPreset skips an existing preset and force re-installs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-presetdev-'))
  const source = join(root, 'source')
  await mkdir(source)
  await writeFile(join(source, 'agent.cordis.yml'), 'composition-b\n')
  const dest = join(root, 'dest')
  await plugin.installPreset(dest, { source })
  await writeFile(join(dest, 'agent.cordis.yml'), 'locally-edited\n')
  try {
    expect(await plugin.installPreset(dest, { source })).toBe('skipped')
    expect(await readFile(join(dest, 'agent.cordis.yml'), 'utf8')).toBe('locally-edited\n')
    expect(await plugin.installPreset(dest, { source, force: true })).toBe('updated')
    expect(await readFile(join(dest, 'agent.cordis.yml'), 'utf8')).toBe('composition-b\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
