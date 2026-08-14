/**
 * Example dsh tool plugin: a configurable `greet` tool registered on the
 * tool registry.
 *
 * @module @neplich/dsh-greet
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'greet'

/** The tool registry this plugin registers into. */
export const inject = ['tools']

/** Greeting wording. Invalid values fail plugin load. */
export interface Config {
  /** Greeting prefix the tool responds with. */
  greeting: string
}

/** Schemastery validation for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
})

/** Register the `greet` tool; disposing the plugin fiber unregisters it. */
export function apply(ctx: Context, config: Config) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `${config.greeting}, ${args.name}!`
    },
  }))
}
