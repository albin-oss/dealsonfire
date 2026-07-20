/**
 * Outbox dispatch task endpoint (BLUEPRINT §7) — Vercel cron target (see vercel.json).
 * Method-agnostic (REVIEW-001 H-2): Vercel cron invokes with GET; operators may POST.
 * Protected by NUXT_CRON_SECRET (Authorization: Bearer). Fails closed in production
 * when the secret is unset.
 */
import { defineEventHandler, getHeader, setResponseStatus } from 'h3'
import { getContainer } from '../../utils/container'
import { getServerConfig } from '../../utils/config'

export default defineEventHandler(async (event) => {
  const config = getServerConfig()
  const provided = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '')

  if (config.isProduction && !config.cronSecret) {
    setResponseStatus(event, 503)
    return { error: 'cron secret not configured' }
  }
  if (config.cronSecret && provided !== config.cronSecret) {
    setResponseStatus(event, 401)
    return { error: 'unauthorized' }
  }

  const container = getContainer()
  // ALL FOUR domain quartets (First Light audit fix: identity + operations events
  // previously never left their outboxes in production)
  const lanes = [
    ['outbox', container.dispatcher],
    ['commerce-outbox', container.commerce.dispatcher],
    ['identity-outbox', container.identity.dispatcher],
    ['operations-outbox', container.operations.dispatcher],
  ] as const
  let dispatched = 0
  let failed = 0
  for (const [name, dispatcher] of lanes) {
    const result = await dispatcher.dispatchPending()
    dispatched += result.dispatched
    failed += result.failed
    await dispatcher.housekeeping().catch((error) => {
      console.error(`[${name}] housekeeping failed:`, (error as Error).message)
    })
  }
  await container.idempotency.purgeExpired().catch(() => {})
  return { dispatched, failed }
})
