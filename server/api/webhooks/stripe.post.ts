/**
 * POST /api/webhooks/stripe (Commerce Foundation C4 — ADR-008 §6, A8-7 layer 4).
 * Signature-verified against the configured webhook secret, idempotently ingested
 * by provider event id, translated to internal facts before any domain logic.
 * Fails closed: no secret configured → 503 (never unauthenticated ingestion);
 * bad signature → 400. Always 200 on duplicates (Stripe retry semantics).
 */
import { defineEventHandler, readRawBody, getHeader, setResponseStatus } from 'h3'
import Stripe from 'stripe'
import { getContainer } from '../../utils/container'
import { getServerConfig } from '../../utils/config'
import { completePaymentAuthorization } from '../../utils/payment-completion'
import { STRIPE_PINNED_API_VERSION, apiVersionMismatch } from '@domains/payments/application/payments'

export default defineEventHandler(async (event) => {
  const { stripeSecretKey, stripeWebhookSecret } = getServerConfig()
  if (!stripeSecretKey || !stripeWebhookSecret) {
    setResponseStatus(event, 503)
    return { error: 'stripe is not configured' }
  }
  const payload = await readRawBody(event)
  const signature = getHeader(event, 'stripe-signature')
  if (!payload || !signature) {
    setResponseStatus(event, 400)
    return { error: 'missing payload or signature' }
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_PINNED_API_VERSION as Stripe.LatestApiVersion })
  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret)
  } catch {
    setResponseStatus(event, 400)
    return { error: 'invalid signature' }
  }

  // RM-M5 tripwire: an event under a different API version than the pin means the
  // Stripe dashboard was upgraded without the reverification ritual — loud, not fatal.
  if (apiVersionMismatch(stripeEvent.api_version)) {
    console.error(`[stripe-webhook] API VERSION MISMATCH: event ${stripeEvent.id} is ${stripeEvent.api_version}, pin is ${STRIPE_PINNED_API_VERSION} — rerun the pinned-version reverification before trusting new fields`)
  }

  const object = stripeEvent.data.object as {
    id?: string; object?: string; payment_intent?: string | { id: string }
    amount?: number; currency?: string; reason?: string; status?: string
    evidence_details?: { due_by?: number | null }
  }
  const objectIntentRef = typeof object.payment_intent === 'object' ? object.payment_intent?.id : object.payment_intent
  const intentRef = object.object === 'payment_intent' ? object.id ?? null : objectIntentRef ?? null
  const c = getContainer()

  // C12-1 EXTERNAL-WALK FINDING: Stripe's payout.paid can arrive in the SAME
  // second the payout is created — BEFORE our settle commits the provider_ref.
  // The old shape ingested the event first (own tx), found no journal row,
  // answered 200 — and the letter-bearing event was lost forever (Stripe never
  // redelivers a 200, and the ingest ledger would dedup a manual resend).
  // Payout outcomes therefore ingest-and-handle in ONE transaction: an
  // ours-but-unknown payout (the event carries a connected-account context)
  // ROLLS BACK the ingest and answers 500 so the provider redelivers after our
  // settle. A platform-balance payout (no account context) is foreign-but-
  // benign: acknowledged and category-noted by reconciliation, never retried.
  if (object.object === 'payout' && object.id
      && (stripeEvent.type === 'payout.paid' || stripeEvent.type === 'payout.failed')) {
    const outcome = await c.deps.uow.withTransaction(async (tx) => {
      const ingest = await c.payments.service.ingestProviderEvent(tx, {
        provider: 'stripe', eventId: stripeEvent.id, intentRef,
        kind: stripeEvent.type, payload: stripeEvent.data.object,
      })
      if (!ingest.fresh) return { ok: true as const, fresh: false }
      const { handled } = await c.payments.service.handlePayoutOutcome(tx, {
        providerPayoutId: object.id!,
        outcome: stripeEvent.type === 'payout.paid' ? 'paid' : 'failed',
        detail: (object as { failure_message?: string }).failure_message ?? null,
      })
      if (!handled && stripeEvent.account) {
        // the rollback law: an err-shaped return leaves no partial writes —
        // the ingest row vanishes with this transaction
        return { ok: false as const, detail: 'connected payout not yet settled locally — redeliver' }
      }
      return { ok: true as const, fresh: true }
    })
    if (outcome.ok === false) {
      setResponseStatus(event, 500)
      return { retry: true }
    }
    return { received: true, fresh: outcome.fresh }
  }

  const result = await c.deps.uow.withTransaction((tx) =>
    c.payments.service.ingestProviderEvent(tx, {
      provider: 'stripe',
      eventId: stripeEvent.id,
      intentRef,
      kind: stripeEvent.type,
      payload: stripeEvent.data.object, // RM-M1: the provider's exact words, kept
    }))

  // C12-2 — THE WEBHOOK INVARIANT, GENERALIZED (the C12-1 payout race, closed
  // for every event class): an event is not permanently consumed merely
  // because it was observed. Payout outcomes ingest-and-handle atomically
  // (above); every other branch runs in this compensating envelope — a
  // processing failure UN-INGESTS the event (its dedup row vanishes) and
  // answers 500, so the provider's redelivery is FRESH and reprocesses.
  // Successes stay consumed forever; replay protection is untouched. The
  // remaining crash window (process death between ingest-commit and branch)
  // is covered by the §8 convergence lanes these branches share signals with
  // (confirm sweep reads provider truth; account sync lands on return;
  // reconciliation surfaces dispute drift).
  try {
    // Slice 2 — the buyer's confirmation became provider truth: converge the order.
    // Runs AFTER the ingest transaction (§7); idempotent with the client's return
    // in either order.
    if (result.fresh && intentRef && stripeEvent.type === 'payment_intent.amount_capturable_updated') {
      await completePaymentAuthorization(c, intentRef)
    }

    // Slice 3 — the connected account's capabilities changed: land the snapshot
    // (idempotent with the onboarding-return sync in either order); the letter to
    // the maker rides the payments outbox when something actually changed.
    if (result.fresh && stripeEvent.type === 'account.updated' && object.object === 'account' && object.id) {
      const state = await c.payments.boundary.connectReadAccount(object.id)
      await c.deps.uow.withTransaction((tx) =>
        c.payments.service.applyAccountSnapshot(tx, { accountId: object.id!, state }))
    }

    // Slice 4 — chargebacks (RM-C3): opened freezes the merchant's unreleased
    // entitlement + letters the maker with the DEADLINE; closed settles per the
    // approved loss policy. Both idempotent by the provider's dispute id.
    if (result.fresh && object.object === 'dispute' && object.id) {
      if (stripeEvent.type === 'charge.dispute.created') {
        await c.deps.uow.withTransaction((tx) => c.payments.service.openDispute(tx, {
          providerDisputeId: object.id!,
          providerRef: objectIntentRef ?? null,
          amountMinor: object.amount ?? 0,
          currency: (object.currency ?? 'eur').toUpperCase(),
          reason: object.reason ?? null,
          evidenceDueAt: object.evidence_details?.due_by ? new Date(object.evidence_details.due_by * 1000).toISOString() : null,
        }))
      }
      if (stripeEvent.type === 'charge.dispute.closed') {
        const outcome = object.status === 'won' ? 'won' as const : 'lost' as const
        await c.deps.uow.withTransaction((tx) =>
          c.payments.service.resolveDispute(tx, { providerDisputeId: object.id!, outcome }))
      }
    }
  } catch (error) {
    if (result.fresh) {
      await c.deps.uow.withTransaction((tx) =>
        c.payments.service.forgetProviderEvent(tx, 'stripe', stripeEvent.id)).catch(() => {})
    }
    console.error(`[stripe-webhook] processing failed for ${stripeEvent.id} (${stripeEvent.type}) — event un-ingested for redelivery:`, (error as Error).message)
    setResponseStatus(event, 500)
    return { retry: true }
  }
  // (payout.paid / payout.failed are handled above, in one transaction with
  // their ingest — the C12-1 external-walk race made the old two-tx shape lossy)
  return { received: true, fresh: result.fresh }
})
