/**
 * Operator gate (C9 — Support Operability). The smallest honest model until
 * Administration exists: operator user ids are platform configuration
 * (NUXT_OPS_USER_IDS, comma-separated). Non-operators get the masked nothing.
 * Every ops action runs through defineCommandEndpoint → audited with actor.
 */
import { optionalEnv } from '@platform/config'

export function isOperator(userId: string): boolean {
  return optionalEnv('NUXT_OPS_USER_IDS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId)
}
