import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Llm from '@deepseek-ai/dsh-llm'
import type { WebServerRoute } from '@deepseek-ai/dsh-host-webserver'
import * as CodexChatgpt from '../src/index.ts'

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

describe('codex-chatgpt plugin composition', () => {
  it('registers Web routes when webServer appears after the adapter', async () => {
    ctx = new Context()
    await ctx.plugin(Llm)
    await ctx.plugin(CodexChatgpt, {})

    expect(ctx.llm.listConfigurableProviders()).toContainEqual({
      provider: 'codex-chatgpt',
      displayName: 'Codex',
      settingsNs: 'codex-chatgpt',
      settingsPath: [],
    })

    const routes: WebServerRoute[] = []
    ctx.provide('webServer', {
      register(route: WebServerRoute) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    } as never)

    await vi.waitFor(() => {
      expect(routes.map(route => route.path).sort()).toEqual([
        '/codex-chatgpt/login',
        '/codex-chatgpt/logout',
        '/codex-chatgpt/models',
        '/codex-chatgpt/settings',
        '/codex-chatgpt/status',
      ])
    })
  })
})
