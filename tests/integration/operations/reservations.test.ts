/**
 * Reservation Machinery (Commerce Foundation C2 — CDC-001 §2.2 VERBATIM) over
 * embedded PG. The frozen contract on stage: idempotency by orderLineId, the
 * TTL clamp, untracked no-op claims (uniform interface), educating declines,
 * commit-time RESERVATION_EXPIRED (the last-unit race's honest answer), release
 * idempotency with the distinguishing flag, the expiry sweep's frozen event —
 * and the STORM: N concurrent checkouts, one unit, exactly one winner, zero
 * oversell, zero silent failures (ADR-007 §9's pass bar).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { uuidv7 } from '@platform/uuid'

let container: Container

const ACTOR = { type: 'system', id: 'c2-test' }

async function seedTrackedStock(onHand: number): Promise<{ businessId: string; variantId: string; stockItemId: string }> {
  const businessId = uuidv7()
  const variantId = uuidv7()
  const locationId = uuidv7()
  const stockItemId = uuidv7()
  await container.pool.query(
    `INSERT INTO businesses (id, business_type, display_name) VALUES ($1, 'individual', 'C2 Seed')`, [businessId])
  await container.pool.query(
    `INSERT INTO locations (id, business_id, kind, name, is_default)
     VALUES ($1, $2, 'home', 'Ghost', true)`, [locationId, businessId])
  await container.pool.query(
    `INSERT INTO stock_items (id, business_id, variant_id, location_id, tracking_mode, on_hand)
     VALUES ($1, $2, $3, $4, 'tracked', $5)`, [stockItemId, businessId, variantId, locationId, onHand])
  await container.pool.query(
    `INSERT INTO stock_ledger (id, business_id, stock_item_id, delta, reason, actor)
     VALUES ($1, $2, $3, $4, 'received', $5)`, [uuidv7(), businessId, stockItemId, onHand, JSON.stringify(ACTOR)])
  return { businessId, variantId, stockItemId }
}

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

beforeAll(async () => { container = newTestContainer(); setContainer(container) })
afterAll(async () => { setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool) })

describe('CDC-001 §2.2 — the frozen reservation contract', () => {
  it('reserve → commit writes the sold ledger line and moves on_hand atomically', async () => {
    const { businessId, variantId, stockItemId } = await seedTrackedStock(5)
    const lineId = uuidv7()

    const reserved = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: lineId, businessId, variantId, quantity: 2 }))
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) return

    // idempotency: the same order line returns the ORIGINAL reservation
    const replay = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: lineId, businessId, variantId, quantity: 2 }))
    expect(replay.ok && replay.reservationId).toBe(reserved.reservationId)

    const committed = await inTx((tx) => container.operations.stock.commitReservation(tx as never, reserved.reservationId, ACTOR))
    expect(committed?.ok).toBe(true)
    // commit is idempotent
    const again = await inTx((tx) => container.operations.stock.commitReservation(tx as never, reserved.reservationId, ACTOR))
    expect(again?.ok && again.alreadyCommitted).toBe(true)

    const { rows: item } = await container.pool.query(`SELECT on_hand FROM stock_items WHERE id = $1`, [stockItemId])
    expect(item[0].on_hand).toBe(3)
    const { rows: ledger } = await container.pool.query(
      `SELECT delta, reason, cause_ref FROM stock_ledger WHERE stock_item_id = $1 AND reason = 'sold'`, [stockItemId])
    expect(ledger).toHaveLength(1)
    expect(ledger[0].delta).toBe(-2)
    expect(ledger[0].cause_ref.order_line_id).toBe(lineId)
  })

  it('declines educate: RESERVATION_DECLINED carries what IS available', async () => {
    const { businessId, variantId } = await seedTrackedStock(3)
    const first = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: uuidv7(), businessId, variantId, quantity: 2 }))
    expect(first.ok).toBe(true)

    const declined = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: uuidv7(), businessId, variantId, quantity: 2 }))
    expect(declined.ok).toBe(false)
    if (declined.ok) return
    expect(declined.code).toBe('RESERVATION_DECLINED')
    expect(declined.available).toBe(1)
  })

  it('untracked variants get the recorded no-op claim — the interface is uniform', async () => {
    const businessId = uuidv7()
    const variantId = uuidv7() // no stock_items row at all
    const reserved = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: uuidv7(), businessId, variantId, quantity: 7 }))
    expect(reserved.ok && reserved.noop).toBe(true)
    if (!reserved.ok) return
    const committed = await inTx((tx) => container.operations.stock.commitReservation(tx as never, reserved.reservationId, ACTOR))
    expect(committed?.ok).toBe(true)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM stock_ledger`)
    expect(rows[0].n).toBe(0) // no ledger line — there is no stock to move
  })

  it('release is idempotent; terminal states answer with the distinguishing flag', async () => {
    const { businessId, variantId } = await seedTrackedStock(1)
    const reserved = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: uuidv7(), businessId, variantId, quantity: 1 }))
    if (!reserved.ok) return expect(reserved.ok).toBe(true)

    const released = await inTx((tx) => container.operations.stock.releaseReservation(tx as never, reserved.reservationId))
    expect(released).toEqual({ released: true, priorStatus: 'active' })
    const again = await inTx((tx) => container.operations.stock.releaseReservation(tx as never, reserved.reservationId))
    expect(again).toEqual({ released: false, priorStatus: 'released' })

    // the released unit is available again
    const next = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: uuidv7(), businessId, variantId, quantity: 1 }))
    expect(next.ok).toBe(true)
  })

  it('the expiry sweep flips claims, frees the unit, and emits the frozen event — once', async () => {
    const { businessId, variantId } = await seedTrackedStock(1)
    const reserved = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: uuidv7(), businessId, variantId, quantity: 1, ttlSeconds: 60 })) // clamped to 300
    if (!reserved.ok) return expect(reserved.ok).toBe(true)

    const future = new Date(Date.now() + 31 * 60_000) // past the 30-min clamp ceiling
    const swept1 = await inTx((tx) => container.operations.stock.sweepExpired(tx as never, future))
    expect(swept1).toBe(1)
    const swept2 = await inTx((tx) => container.operations.stock.sweepExpired(tx as never, future))
    expect(swept2).toBe(0)

    const { rows: events } = await container.pool.query(
      `SELECT payload FROM operations_domain_events WHERE event_type = 'operations.reservation.expired'`)
    expect(events).toHaveLength(1)
    expect(events[0].payload.reservation_id).toBe(reserved.reservationId)

    // CDC-001: committing the expired claim answers RESERVATION_EXPIRED — never silence
    const late = await inTx((tx) => container.operations.stock.commitReservation(tx as never, reserved.reservationId, ACTOR))
    expect(late?.ok).toBe(false)
    if (late && !late.ok) expect(late.code).toBe('RESERVATION_EXPIRED')

    // and the unit is sellable again
    const rebook = await inTx((tx) => container.operations.stock.reserveStock(tx as never, {
      orderLineId: uuidv7(), businessId, variantId, quantity: 1 }))
    expect(rebook.ok).toBe(true)
  })

  it('THE STORM: 12 concurrent checkouts, one unit — exactly one winner, zero oversell, zero silence', async () => {
    const { businessId, variantId, stockItemId } = await seedTrackedStock(1)

    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        inTx((tx) => container.operations.stock.reserveStock(tx as never, {
          orderLineId: uuidv7(), businessId, variantId, quantity: 1 }))))

    const winners = attempts.filter((a) => a.ok)
    const declines = attempts.filter((a) => !a.ok)
    expect(winners).toHaveLength(1)      // exactly one claim on the last unit
    expect(declines).toHaveLength(11)    // eleven honest, educating answers
    for (const d of declines) { if (!d.ok) expect(d.available).toBe(0) }

    // the winner commits; the ledger and the cached sum agree; nothing oversold
    const win = winners[0]!
    if (!win.ok) return
    const committed = await inTx((tx) => container.operations.stock.commitReservation(tx as never, win.reservationId, ACTOR))
    expect(committed?.ok).toBe(true)
    const { rows } = await container.pool.query(
      `SELECT si.on_hand, COALESCE((SELECT sum(delta) FROM stock_ledger WHERE stock_item_id = si.id), 0)::int AS ledger_sum
       FROM stock_items si WHERE si.id = $1`, [stockItemId])
    expect(rows[0].on_hand).toBe(0)
    expect(rows[0].ledger_sum).toBe(0)   // +1 received − 1 sold — S2 holds under fire
  })
})
