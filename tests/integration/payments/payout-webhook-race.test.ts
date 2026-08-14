/**
 * C12-1 EXTERNAL-WALK FINDING — the payout.paid race.
 *
 * Stripe fires payout.paid within the same second as payout creation; the old
 * webhook shape ingested the event in its own transaction, found no journal
 * row yet, answered 200 — and the letter-bearing PAID event was lost forever
 * (a 200 is never redelivered, and the ingest ledger would dedup any resend).
 *
 * The law pinned here: payout outcomes ingest-and-handle in ONE transaction.
 * Ours-but-early (connected-account context, no local settle yet) ⇒ ROLLBACK
 * (no ingest row) + 500 ⇒ the provider redelivers after our settle. Foreign
 * platform-balance payouts (no account context) ⇒ acknowledged, ingested,
 * never retried. Duplicates converge.
 */
import Stripe from 'stripe'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const WEBHOOK_SECRET = 'whsec_race_test_secret'

function signedPayoutEvent(input: { eventId: string; payoutId: string; account?: string; type?: string }) {
  const payload = JSON.stringify({
    id: input.eventId,
    object: 'event',
    type: input.type ?? 'payout.paid',
    api_version: '2026-06-24.dahlia',
    ...(input.account ? { account: input.account } : {}),
    data: { object: { id: input.payoutId, object: 'payout', amount: 4365, currency: 'eur', status: 'paid' } },
  })
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
  return { payload, header }
}

async function post(payload: string, header: string) {
  return http.request('POST', '/api/webhooks/stripe', {
    headers: { 'stripe-signature': header, 'content-type': 'application/json' },
    body: payload,
  })
}

beforeAll(async () => {
  process.env.NUXT_STRIPE_SECRET_KEY = 'sk_test_race_fixture'
  process.env.NUXT_STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
  delete process.env.NUXT_STRIPE_SECRET_KEY
  delete process.env.NUXT_STRIPE_WEBHOOK_SECRET
})
beforeEach(async () => {
  await truncateAll(container.pool)
})

describe('C12-1 — payout.paid racing the settle', () => {
  it('ours-but-early: 500 + FULL rollback — the ingest row vanishes so redelivery is possible', async () => {
    const { payload, header } = signedPayoutEvent({ eventId: 'evt_race_1', payoutId: 'po_race_unknown', account: 'acct_x' })
    const res = await post(payload, header)
    expect(res.status).toBe(500)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM provider_events WHERE event_id = 'evt_race_1'`)
    expect(rows[0].n).toBe(0) // the rollback law held — nothing partial survived
    const { rows: events } = await container.pool.query(`SELECT count(*)::int AS n FROM payments_domain_events WHERE event_type LIKE '%payout%'`)
    expect(events[0].n).toBe(0)
  })

  it('after the settle exists, redelivery lands: PAID event appended, then duplicates converge', async () => {
    const biz = uuidv7()
    await container.pool.query(
      `INSERT INTO provider_operations (id, kind, provider, idempotency_key, business_id, amount_minor, currency, state, provider_ref, detail)
       VALUES ($1, 'payout', 'stripe', $2, $3, 4365, 'EUR', 'succeeded', 'po_race_settled', $4)`,
      [uuidv7(), `payout:${biz}:1`, biz, JSON.stringify({ period: 1, account: 'acct_x' })])

    const { payload, header } = signedPayoutEvent({ eventId: 'evt_race_2', payoutId: 'po_race_settled', account: 'acct_x' })
    const first = await post(payload, header)
    expect(first.status).toBe(200)
    expect(first.body.fresh).toBe(true)
    const replay = await post(payload, header)
    expect(replay.status).toBe(200)
    expect(replay.body.fresh).toBe(false) // converged, not reprocessed
    const { rows } = await container.pool.query(
      `SELECT count(*)::int AS n FROM payments_domain_events WHERE event_type = 'payments.payout.paid' AND payload->>'provider_payout_id' = 'po_race_settled'`)
    expect(rows[0].n).toBe(1) // exactly one letter-bearing event, ever
  })

  it('a platform-balance payout (no account context) is acknowledged and never retried', async () => {
    const { payload, header } = signedPayoutEvent({ eventId: 'evt_race_3', payoutId: 'po_platform_fees' })
    const res = await post(payload, header)
    expect(res.status).toBe(200)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM provider_events WHERE event_id = 'evt_race_3'`)
    expect(rows[0].n).toBe(1) // ingested (recon will category-note it), no retry storm invited
  })
})
