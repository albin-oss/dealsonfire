/**
 * Pre-C10 hardening (Real Money Readiness Review, immediate fixes) over real
 * HTTP + embedded PG:
 *   RM-H2 — the 24h honest-failure path surrenders the buyer's card hold: the
 *           sweep collects still-open authorizations, the caller voids them
 *           AFTER the transaction (boundary law), the intent lands 'voided'.
 *   RM-H3 — a keystone alarm is a LETTER: NUXT_OPS_ALARM_EMAIL receives the
 *           same words the log gets; the /ops/alarms queue gains hold_stuck.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import type { SandboxMailer } from '@platform/mail'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function actor(email: string) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie } })
  return { cookie, userId: me.body.user_id as string }
}

async function placedOrder() {
  const m = await actor(`hard-${uuidv7()}@maker.example`)
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie: m.cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie: m.cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie: m.cookie } })
  const p = await http.request('POST', '/api/v1/products', {
    headers: { cookie: m.cookie },
    body: { business_id: biz.body.business_id, title: 'Blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
  })
  const pub = await http.request('GET', `/api/v1/public/stores/${handle}/products/${p.body.product_id}`)
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: pub.body.product.variants[0].id, quantity: 1 } })
  const buyerCookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie: buyerCookie },
    body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  return { orderId: co.body.order_id as string, merchant: m }
}

beforeAll(async () => {
  process.env.NUXT_OPS_ALARM_EMAIL = 'ops@dof.example' // BEFORE the container captures it
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
  delete process.env.NUXT_OPS_ALARM_EMAIL
  delete process.env.NUXT_OPS_USER_IDS
})
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  ;(container.mail as SandboxMailer).outbox.length = 0
})

describe('pre-C10 hardening', () => {
  it('RM-H2: the 24h failure path collects the authorization; void() releases the buyer card hold', async () => {
    const { orderId } = await placedOrder()
    // strand the order: authorized at checkout, never captured, 25h old
    await container.pool.query(
      `UPDATE orders SET state = 'payment_pending', placed_at = now() - interval '25 hours' WHERE id = $1`, [orderId])
    await container.pool.query(
      `UPDATE payment_intents SET state = 'authorized'
        WHERE attempt_key = (SELECT attempt_key FROM orders WHERE id = $1)`, [orderId])

    const swept = await container.deps.uow.withTransaction((tx) =>
      container.orders.confirm.sweepUnconfirmed(tx as never))
    expect(swept.voidRefs).toHaveLength(1)

    // the caller's half (outbox-dispatch does exactly this after the tx)
    for (const ref of swept.voidRefs) await container.payments.service.void(ref)

    const { rows } = await container.pool.query(
      `SELECT state FROM payment_intents WHERE provider_ref = $1`, [swept.voidRefs[0]])
    expect(rows[0].state).toBe('voided')
    const { rows: fact } = await container.pool.query(
      `SELECT count(*)::int AS n FROM payment_facts f JOIN payment_intents i ON i.id = f.intent_id
        WHERE i.provider_ref = $1 AND f.kind = 'voided'`, [swept.voidRefs[0]])
    expect(fact[0].n).toBe(1)
    // and the alarm about committed stock became a LETTER (RM-H3)
    const letters = (container.mail as SandboxMailer).outbox
    expect(letters.some((l) => l.to === 'ops@dof.example' && /payment_pending exceeded 24h/.test(l.body))).toBe(true)
  })

  it('RM-H3: hold_stuck appears in the state-derived alarms queue', async () => {
    const ops = await actor(`ops-${uuidv7()}@dof.example`)
    process.env.NUXT_OPS_USER_IDS = ops.userId
    const { orderId, merchant } = await placedOrder()
    await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, { headers: { cookie: merchant.cookie }, body: { carrier: 'bpost' } })
    // fulfillment evidence 11 days old, hold never released
    await container.pool.query(`UPDATE fulfillment_cases SET dispatched_at = now() - interval '11 days' WHERE order_id = $1`, [orderId])
    await container.pool.query(`UPDATE orders SET hold_released_at = NULL WHERE id = $1`, [orderId])

    const res = await http.request('GET', '/api/v1/ops/alarms', { headers: { cookie: ops.cookie } })
    const alarm = res.body.alarms.find((a: { id: string; kind: string }) => a.id === orderId && a.kind === 'hold_stuck')
    expect(alarm).toBeTruthy()
    expect(alarm.acknowledged).toBe(false)
  })
})
