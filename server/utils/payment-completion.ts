/**
 * Slice 2 — ONE convergence path for a client-confirmed payment, shared by the
 * webhook (`payment_intent.amount_capturable_updated`) and the buyer's return
 * (`POST /checkout/complete`). Either may arrive first; both may arrive; the
 * row-locked flip inside completeClientAuthorization makes the second a no-op.
 * The confirm saga then runs in the §7 shape: journal → drive → re-enter.
 */
import type { Container } from './container'

export async function completePaymentAuthorization(c: Container, providerRef: string):
  Promise<{ orderId: string | null; orderState: string | null }> {
  const { attemptKey } = await c.deps.uow.withTransaction((tx) =>
    c.payments.service.completeClientAuthorization(tx, providerRef))
  if (!attemptKey) return { orderId: null, orderState: null }

  const { rows } = await c.pool.query<{ id: string; state: string }>(
    `SELECT id, state FROM orders WHERE attempt_key = $1`, [attemptKey])
  const order = rows[0]
  if (!order) return { orderId: null, orderState: null } // intent without an order: the orphan sweep reclaims

  let confirm = await c.deps.uow.withTransaction((tx) => c.orders.confirm.confirmOrder(tx, order.id))
  if (confirm?.ok && confirm.state === 'capturing') {
    await c.payments.boundary.drive(confirm.opId).catch((error) =>
      c.logger.error(`element capture drive failed for order ${order.id}: ${(error as Error).message}`, { component: 'payments-boundary' }))
    confirm = await c.deps.uow.withTransaction((tx) => c.orders.confirm.confirmOrder(tx, order.id))
  }
  return { orderId: order.id, orderState: confirm?.ok ? confirm.state : order.state }
}
