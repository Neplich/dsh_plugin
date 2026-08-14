/**
 * MCP settings section plugin, host half: loopback HTTP routes on the Web
 * GUI server backing the MCP 服务 settings section.
 *
 *   GET    /config-mcp/mcp            Live servers (Loader entries) + management state
 *   GET    /config-mcp/mcp/detail?id= Raw managed-row values for the edit dialog
 *   POST   /config-mcp/mcp/create     Append one managed insert row
 *   POST   /config-mcp/mcp/update     Wholesale config replacement on a managed row
 *   POST   /config-mcp/mcp/state      Enable/disable (override row for external entries)
 *   DELETE /config-mcp/mcp?id=        Remove a managed row
 *
 * Mutations edit $DSH_HOME/cordis.patch.yml with an AST-preserving YAML
 * document; the harness watches that file and HMR-reloads the composition,
 * so a save is a live disconnect/reconnect of the touched server. Every
 * route is origin-fenced.
 *
 * @module @neplich/dsh-config-mcp
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import Schema from '@deepseek-ai/schemastery'
import { preflight, readJsonBody, send } from '@neplich/dsh-config-shared'
import {
  createMcpServer, deleteMcpServer, homePatchPath, listMcpServers, mcpServerDetail,
  setMcpServerState, updateMcpServer,
} from './server/mcp.ts'
import type { McpCreateRequest, McpStateRequest, McpUpdateRequest } from './shared.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'config-mcp'

/**
 * This plugin registers routes on the Web GUI server; compose it in a
 * `dsh web` profile only — a profile without ctx.webServer leaves the
 * fiber waiting on the injection.
 */
export const inject = ['webServer']

/** Deployment-tunable bounds. Invalid values fail plugin load. */
export interface Config {
  /** Maximum JSON mutation body size in bytes. */
  maxBodyBytes: number
}

/** Schemastery validation for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  maxBodyBytes: Schema.natural().default(1024 * 1024),
})

/**
 * Register the routes; disposing the plugin fiber removes them.
 * @param ctx - host root context.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config) {
  const webServer = ctx.webServer

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-mcp/mcp',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      if (req.method === 'DELETE') {
        try {
          const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('id') ?? ''
          if (id === '') throw new Error('id is required')
          send(res, 200, await deleteMcpServer(ctx, id))
        } catch (error) {
          send(res, 400, { error: String(error) })
        }
        return
      }
      try {
        send(res, 200, { servers: await listMcpServers(ctx), patchPath: homePatchPath() })
      } catch (error) {
        send(res, 500, { error: String(error) })
      }
    },
  }), 'config-mcp: list/delete route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-mcp/mcp/detail',
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      try {
        const id = url.searchParams.get('id') ?? ''
        if (id === '') throw new Error('id is required')
        send(res, 200, await mcpServerDetail(id))
      } catch (error) {
        send(res, 400, { error: String(error) })
      }
    },
  }), 'config-mcp: detail route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-mcp/mcp/create',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      try {
        const body = await readJsonBody<McpCreateRequest>(req, config.maxBodyBytes)
        send(res, 200, await createMcpServer(ctx, body.server))
      } catch (error) {
        send(res, 400, { error: String(error) })
      }
    },
  }), 'config-mcp: create route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-mcp/mcp/update',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      try {
        const body = await readJsonBody<McpUpdateRequest>(req, config.maxBodyBytes)
        send(res, 200, await updateMcpServer(ctx, body.id, body.server))
      } catch (error) {
        send(res, 400, { error: String(error) })
      }
    },
  }), 'config-mcp: update route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-mcp/mcp/state',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      try {
        const body = await readJsonBody<McpStateRequest>(req, config.maxBodyBytes)
        send(res, 200, await setMcpServerState(ctx, body.id, body.disabled))
      } catch (error) {
        send(res, 400, { error: String(error) })
      }
    },
  }), 'config-mcp: state route')
}
