/**
 * Health/readiness endpoint (IMP-PLT-001 observability). Answering at all = liveness;
 * the body = readiness. Reports check names, booleans, and latency ONLY — no internals.
 * Degrades gracefully when the container cannot build (e.g. database unconfigured in dev):
 * that is a degraded state, not a 500.
 */
import { defineEventHandler, setResponseStatus } from 'h3'
import { getContainer } from '../../utils/container'

export default defineEventHandler(async (event) => {
  try {
    const report = await getContainer().health.run()
    if (report.status !== 'ok') setResponseStatus(event, 503)
    return report
  } catch (error) {
    setResponseStatus(event, 503)
    return {
      status: 'degraded',
      checks: [{ name: 'container', ok: false, latencyMs: 0, detail: (error as Error).message.slice(0, 120) }],
    }
  }
})
