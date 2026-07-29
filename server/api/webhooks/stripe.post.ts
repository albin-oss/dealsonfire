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
import { STRIPE_PINNED_API_VERSION } from '@domains/payments/application/payments'

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

  const object = stripeEvent.data.object as { id?: string; object?: string }
  const intentRef = object.object === 'payment_intent' ? object.id ?? null : null
  const c = getContainer()
  const result = await c.deps.uow.withTransaction((tx) =>
    c.payments.service.ingestProviderEvent(tx, {
      provider: 'stripe',
      eventId: stripeEvent.id,
      intentRef,
      kind: stripeEvent.type,
    }))
  return { received: true, fresh: result.fresh }
})
