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
    container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepUnconfirmed(tx))
      .then(async (swept) => {
        // RM-H2 + §7: release the card holds of orders the 24h path just closed —
        // journaled in a short tx, driven at the boundary, never inside the sweep.
        for (const ref of swept.voidRefs) {
          const { opId } = await container.deps.uow.withTransaction((tx) => container.payments.service.requestVoid(tx, ref))
          await container.payments.boundary.drive(opId).catch((error) =>
            console.error(`[orders] void after 24h failure failed for ${ref}:`, (error as Error).message))
        }
        // §7: drive the sweep's journaled captures, then re-enter once so orders
        // confirm in THIS tick instead of the next
        for (const opId of swept.captureOps) {
          await container.payments.boundary.drive(opId).catch(() => {})
        }
        if (swept.captureOps.length > 0) {
          const again = await container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepUnconfirmed(tx)).catch(() => null)
          return swept.confirmed + (again?.confirmed ?? 0)
        }
        return swept.confirmed
      })
      .catch(() => -1),
    // PRR-M1: the manifest's PII retention promises, kept on the same clock
    container.deps.uow.withTransaction((tx) => container.orders.carts.purgeTerminal(tx)).catch(() => -1),
    container.deps.uow.withTransaction((tx) => container.orders.checkout.purgeTerminalAttempts(tx)).catch(() => -1),
    // C6: the keystone's clock — §7: stage 3 journals its refunds; we drive them here
    container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepAging(tx, {
      listCases: (t, orderId) => container.operations.fulfillment.listByOrder(t, orderId),
      prepareRefund: (t, input) => container.payments.service.prepareRefund(t, input),
    }))
      .then(async (swept) => {
        for (const opId of swept.refundOps) {
          await container.payments.boundary.drive(opId).catch(() => {})
        }
        return { nudged: swept.nudged, disclosed: swept.disclosed, refunded: swept.refunded }
      })
      .catch(() => ({ nudged: -1, disclosed: -1, refunded: -1 })),
    // C6: the payout-hold clock — ONE policy (hold-policy.ts), one movement site
    container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepHoldRelease(tx, {
      listCases: (t, orderId) => container.operations.fulfillment.listByOrder(t, orderId),
      releaseHold: (t, input) => container.payments.service.releaseHold(t, input),
      policy: holdReleaseDue,
    })).catch(() => -1),
  ])
  // C11: the payout sweep — the domain decides everything (gates, amounts,
  // periods); this wiring only prepares (tx) and drives (boundary). §7 shape.
  const payouts = await container.deps.uow.withTransaction((tx) => container.payments.service.preparePayoutSweep(tx))
    .then(async (swept) => {
      let settled = 0
      for (const opId of swept.opIds) {
        const driven = await container.payments.boundary.drive(opId).catch(() => null)
        if (driven?.settled) settled += 1
      }
      return { prepared: swept.opIds.length, settled, skipped: swept.skipped }
    })
    .catch(() => ({ prepared: -1, settled: -1, skipped: -1 }))
  // C12-1: the letters lane — phases 2+3 for journaled mail (the dispatchers
  // above already nudged it; this pass catches backoff-due retries and crashes)
  const letters = await container.mailJournal.drivePending().catch(() => ({ sent: -1, suppressed: -1, failed: -1, retried: -1 }))
  // §7: the recovery driver — re-drives anything pending past the grace window
  // (crashes between phases, provider hiccups, sweep-enqueued work)
  const boundary = await container.payments.boundary.driveAll().catch(() => ({ driven: -1, settled: -1 }))
  // RM-H1: the daily reconciliation (self-gating — runs once per 24h of watermark)
  const reconciled = await container.payments.reconciliation.maybeRun().catch(() => ({ ran: false, matched: -1, unmatched: -1 }))
  return {
    dispatched, failed,
    carts_swept: cartsSwept, reservations_swept: reservationsSwept, orders_confirmed: ordersConfirmed,
    carts_purged: cartsPurged, attempts_purged: attemptsPurged, aging, payouts, letters, boundary, reconciled,
  }
})
