/**
 * POST /api/v1/public/checkout (Commerce Foundation C3) — the resumable saga in one
 * request: quote-freeze → reserve → authorize → place, idempotent end-to-end on the
 * client-minted attempt key. Guest-first: the visitor identity IS the buyer.
 *
 * GA gate (ADR-007 R-a): checkout runs on the sandbox PaymentPort until C4 — in
 * production it stays OFF unless explicitly enabled, so no real store can appear
 * to take money it cannot take.
 */
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getServerConfig } from '../../../../utils/config'
import { getOrCreateVisitorId } from '../../../../utils/visitor'
import { checkoutRequest, type CheckoutResponse } from '@contracts/schemas/orders/checkout.schema'
import { effectivePriceSql } from '@domains/commerce/pricing/effective-price'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'orders.checkout',
  schema: checkoutRequest,
  rateLimit: { limit: 20, windowSeconds: 60 },
  async handler({ event, body }): Promise<Result<CheckoutResponse, DomainError>> {
    const config = getServerConfig()
    if (config.isProduction && process.env.NUXT_COMMERCE_CHECKOUT !== '1') {
      return err(domainError('NOT_FOUND', 'checkout is not open yet'))
    }
    const buyerId = getOrCreateVisitorId(event)
    const c = getContainer()

    // Slice 3 — the till gate (RM-H4): with real Stripe (or the onboarding knob),
    // a maker whose banking isn't ready cannot take money. Only the CHECKOUT DOOR
    // closes — the storefront, story, and Sparks stay on the street (experience law).
    const requireOnboarding = c.payments.provider === 'stripe' || process.env.NUXT_REQUIRE_MERCHANT_ONBOARDING === '1'
    const { rows: till } = await c.pool.query<{ charges_enabled: boolean | null; risk_paused_at: string | null }>(
      `SELECT p.charges_enabled, p.risk_paused_at::text AS risk_paused_at FROM carts ct
       LEFT JOIN merchant_payment_profiles p ON p.business_id = ct.business_id
       WHERE ct.id = $1`, [body.cart_id])
    // Slice 4 (approved policy §5): a risk pause closes the checkout door for
    // HUMAN review — storefront and buyer protections stand exactly as they were
    if (till[0]?.risk_paused_at) {
      return ok({
        ok: false, code: 'CHECKOUT_CLOSED',
        detail: 'This shop’s checkout is paused for a routine review. Everything stays browsable, and the door reopens shortly.',
      })
    }
    if (requireOnboarding && till[0] && !till[0].charges_enabled) {
      return ok({
        ok: false, code: 'CHECKOUT_CLOSED',
        detail: 'This maker’s till isn’t open yet — their banking setup isn’t finished. Everything here stays browsable, and the checkout door opens the moment it’s done.',
      })
    }
    // Slice 4 (approved policy §4): max platform exposure per order — a launch
    // training wheel, said honestly when it bites
    const maxOrderMinor = Number(process.env.NUXT_RISK_MAX_ORDER_MINOR ?? '0') || 0
    if (maxOrderMinor > 0) {
      const { rows: sub } = await c.pool.query<{ subtotal: string }>(
        `SELECT COALESCE(sum(${effectivePriceSql('v')} * cl.quantity), 0)::text AS subtotal
         FROM cart_lines cl JOIN product_variants v ON v.id = cl.variant_id WHERE cl.cart_id = $1`, [body.cart_id])
      if (Number(sub[0]?.subtotal ?? 0) > maxOrderMinor) {
        return ok({
          ok: false, code: 'ORDER_LIMIT',
          detail: 'This order is larger than we take in one go while we’re new — split it into two smaller orders and both will sail through. Nothing was charged.',
        })
      }
    }
    const input = {
      attemptKey: body.attempt_key,
      buyerId,
      cartId: body.cart_id,
      contact: body.contact,
      // pickup's DeliverySnapshot is the honest marker, not a fake address
      delivery: body.delivery ?? { line1: 'Pickup at the shop', city: '', postal_code: '', country: '' },
      method: body.method,
    }
    // §7 two-phase: the saga journals the authorization and commits; the boundary
    // speaks to the provider OUTSIDE any transaction; the saga re-enters and
    // converges on the recorded truth. A crash at any point is picked up by the
    // recovery driver + the confirm sweep — the buyer can always retry the same key.
    let result = await c.deps.uow.withTransaction((tx) => c.orders.checkout.checkout(tx, input))
    if (result.ok && 'pendingAuthorization' in result) {
      await c.payments.boundary.drive(result.opId).catch((error) =>
        c.logger.error(`checkout authorize drive failed: ${(error as Error).message}`, { component: 'payments-boundary' }))
      result = await c.deps.uow.withTransaction((tx) => c.orders.checkout.checkout(tx, input))
    }
    if (result.ok && 'pendingAuthorization' in result) {
      // the provider is unreachable: honest words, nothing charged, driver converges later
      return ok({ ok: false, code: 'PAYMENT_UNAVAILABLE', detail: 'The payment service is taking too long — nothing was charged. Try again in a moment; your cart is exactly as you left it.' })
    }
    if (result.ok && 'declined' in result) {
      return ok({ ok: false, code: result.code, detail: result.detail })
    }
    if (result.ok && 'orderId' in result && result.awaitingPayment && result.providerRef) {
      // Slice 2: the order exists; the BUYER's browser now confirms the payment
      // (Element). The client_secret is read from the provider — never stored.
      const placed = result
      const session = await c.payments.boundary.readIntent(placed.providerRef!)
        .catch(() => ({ status: 'requires_confirmation' as const, clientSecret: null }))
      return ok({
        ok: true, order_id: placed.orderId, order_number: placed.orderNumber,
        payment: {
          provider: c.payments.provider,
          client_secret: session.clientSecret,
          publishable_key: config.stripePublishableKey || null,
        },
      })
    }
    if (result.ok && 'orderId' in result) {
      const placed = result
      // C5: confirmation runs immediately — §7 shape: journal (tx) → capture
      // (boundary) → re-enter (tx). The cron sweep converges any straggler.
      try {
        let confirm = await c.deps.uow.withTransaction((tx) => c.orders.confirm.confirmOrder(tx, placed.orderId))
        if (confirm?.ok && confirm.state === 'capturing') {
          await c.payments.boundary.drive(confirm.opId)
          confirm = await c.deps.uow.withTransaction((tx) => c.orders.confirm.confirmOrder(tx, placed.orderId))
        }
      } catch (error) {
        // PRR-H2: never silent — the sweep retries, but a crashing confirm is a bug someone must see
        c.logger.error(`inline confirm failed for order ${placed.orderId}: ${(error as Error).message}`, { component: 'orders-confirm' })
      }
      return ok({ ok: true, order_id: placed.orderId, order_number: placed.orderNumber })
    }
    if (result.ok) {
      // exhaustiveness guard — pending/declined were answered above
      return ok({ ok: false, code: 'ATTEMPT_FAILED', detail: 'This checkout could not finish — start again from your cart; nothing was charged.' })
    }
    return ok({ ok: false, code: result.code, detail: result.detail })
  },
})
