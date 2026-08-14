import { expect, test } from 'vitest'

import * as plugin from '../src/index.ts'

test('exports the function-plugin loader contract', () => {
  expect(plugin.name).toBe('greet')
  expect(plugin.inject).toEqual(['tools'])
  expect(typeof plugin.apply).toBe('function')
  expect(plugin.Config).toBeDefined()
})
