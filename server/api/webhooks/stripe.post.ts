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
  const result = await c.deps.uow.withTransaction((tx) =>
    c.payments.service.ingestProviderEvent(tx, {
      provider: 'stripe',
      eventId: stripeEvent.id,
      intentRef,
      kind: stripeEvent.type,
      payload: stripeEvent.data.object, // RM-M1: the provider's exact words, kept
    }))

  // Slice 2 — the buyer's confirmation became provider truth: converge the order.
  // Runs AFTER the ingest transaction (§7); idempotent with the client's return
  // in either order. A failure here answers 500 → Stripe retries → convergence.
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
  return { received: true, fresh: result.fresh }
})
