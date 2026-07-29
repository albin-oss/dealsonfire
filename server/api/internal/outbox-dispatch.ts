/**
 * Outbox dispatch task endpoint (BLUEPRINT §7) — Vercel cron target (see vercel.json).
 * Method-agnostic (REVIEW-001 H-2): Vercel cron invokes with GET; operators may POST.
 * Protected by NUXT_CRON_SECRET (Authorization: Bearer). Fails closed in production
 * when the secret is unset.
 */
import { defineEventHandler, getHeader, setResponseStatus } from 'h3'
import { getContainer } from '../../utils/container'
import { getServerConfig } from '../../utils/config'
import { holdReleaseDue } from '@domains/payments/application/hold-policy'

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
    ['orders-outbox', container.orders.dispatcher],
    ['payments-outbox', container.payments.dispatcher],
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
  // Commerce Foundation clocks (C1/C2): the cart abandonment sweep and the
  // reservation TTL sweep — both idempotent, both emit through their quartets.
  const [cartsSwept, reservationsSwept, ordersConfirmed, cartsPurged, attemptsPurged, aging] = await Promise.all([
    container.deps.uow.withTransaction((tx) => container.orders.carts.sweepAbandoned(tx)).catch(() => -1),
    container.deps.uow.withTransaction((tx) => container.operations.stock.sweepExpired(tx)).catch(() => -1),
    container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepUnconfirmed(tx)).catch(() => -1),
    // PRR-M1: the manifest's PII retention promises, kept on the same clock
    container.deps.uow.withTransaction((tx) => container.orders.carts.purgeTerminal(tx)).catch(() => -1),
    container.deps.uow.withTransaction((tx) => container.orders.checkout.purgeTerminalAttempts(tx)).catch(() => -1),
    // C6: the keystone's clock — the three-stage no-ship aging path
    container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepAging(tx, {
      listCases: (t, orderId) => container.operations.fulfillment.listByOrder(t, orderId),
      refund: (t, input) => container.payments.service.refund(t, input),
    })).catch(() => ({ nudged: -1, disclosed: -1, refunded: -1 })),
    // C6: the payout-hold clock — ONE policy (hold-policy.ts), one movement site
    container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepHoldRelease(tx, {
      listCases: (t, orderId) => container.operations.fulfillment.listByOrder(t, orderId),
      releaseHold: (t, input) => container.payments.service.releaseHold(t, input),
      policy: holdReleaseDue,
    })).catch(() => -1),
  ])
  return {
    dispatched, failed,
    carts_swept: cartsSwept, reservations_swept: reservationsSwept, orders_confirmed: ordersConfirmed,
    carts_purged: cartsPurged, attempts_purged: attemptsPurged, aging,
  }
})
