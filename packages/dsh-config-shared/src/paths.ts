/**
 * Platform directory resolution. Mirrors the harness's own rules
 * (packages/util/home-paths): $DSH_HOME defaults to ~/.dsh and
 * $DSH_AGENTS_HOME defaults to ~/.agents.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** User-level dsh home: skills, AGENTS.md, cordis.patch.yml, profiles. */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** User-level agents home: the second personal skills directory. */
export function dshAgentsHome(): string {
  return process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')
}