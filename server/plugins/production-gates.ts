/**
 * C12-2 — production boot gate (Locks for Strangers; stranger statement #7:
 * "production is configured as production"). PRODUCTION FAILS CLOSED AT BOOT
 * with every problem NAMED: dev identity retired, proxy trust declared,
 * required security/mail/config values present, no development fallback
 * silently operating. Dev and tests are untouched (gate arms only under
 * NODE_ENV=production).
 */
import { getServerConfig } from '../utils/config'
import { productionGateProblems } from '../utils/production-gates'

export default defineNitroPlugin(() => {
  if (!getServerConfig().isProduction) return
  const problems = productionGateProblems()
  if (problems.length) {
    throw new Error(['PRODUCTION BOOT REFUSED (C12-2 gate) — the configuration is not production-shaped:',
      ...problems.map((p) => '  ' + p)].join('\n'))
  }
})
