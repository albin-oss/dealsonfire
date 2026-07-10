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
  const merchant = await container.dispatcher.dispatchPending()
  const commerce = await container.commerce.dispatcher.dispatchPending()
  await container.dispatcher.housekeeping().catch((error) => {
    console.error('[outbox] housekeeping failed:', (error as Error).message)
  })
  await container.commerce.dispatcher.housekeeping().catch((error) => {
    console.error('[commerce-outbox] housekeeping failed:', (error as Error).message)
  })
  await container.idempotency.purgeExpired().catch(() => {})
  return { dispatched: merchant.dispatched + commerce.dispatched, failed: merchant.failed + commerce.failed }
})
