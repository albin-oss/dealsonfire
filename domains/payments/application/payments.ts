/**
 * Payments (Commerce Foundation C4 — ADR-008, UPDATED_PAYMENT_LIFECYCLE).
 * The PSP moves the money; this module owns the truth about the money:
 *
 *  - PaymentIntent, idempotent forever by attempt key (P4); every state change
 *    cites an appended provider fact (P3); capture ≤ authorization and refund ≤
 *    capture are CHECK-constrained at the schema AND guarded here (P2).
 *  - The LedgerPoster is the ONLY writer of ledger entries: balanced postings
 *    (L1), append-only (L2, grant-immutable), balances as cached sums with the
 *    recompute identity (L3) proven in tests.
 *  - Providers sit behind one port. The SANDBOX twin is deterministic and keeps
 *    decline parity with C3. The STRIPE adapter uses the SDK-pinned API version
 *    (2026-06-24.dahlia, stripe-node 22.x) and only constructs when a secret key
 *    is configured — no keys, no Stripe, no accidental live calls. The facts
 *    register (PAYMENT_REALITY_REVIEW §5) was verified against this pin's docs.
 *
 * Structurally implements the Orders PaymentPort (authorize/void) WITHOUT
 * importing it — domains never import each other; the container composes.
 */
import { uuidv7 } from '../../../platform/uuid'
import type { Tx, EventStore } from '../../../platform/types'
import { asClient } from '../../../platform/db'
import { PAYMENTS_EVENT } from '../shared-kernel/events'

// C11 S1 split (motion only): the provider seam and the ledger live in their own
// modules; existing import sites keep working through these re-exports.
export * from './provider'
export * from './ledger'
import { type LedgerPoster, type LedgerLeg } from './ledger'
import { type ProviderAuthorization, type ProviderAccountState } from './provider'

export interface ProviderOperation {
  id: string
  kind: 'authorize' | 'capture' | 'void' | 'refund' | 'transfer_reversal' | 'payout'
  idempotency_key: string
  attempt_key: string | null
  intent_id: string | null
  provider_ref: string | null
  order_id: string | null
  business_id: string | null
  amount_minor: number | null
  currency: string | null
  state: 'pending' | 'succeeded' | 'abandoned'
  attempts: number
  detail: Record<string, unknown>
}

// ————————————————————————————————————————————— the service (intent lifecycle)

export class PaymentsService {
  constructor(
    private readonly events: EventStore,
    readonly ledger: LedgerPoster,
    private readonly providerName: 'sandbox' | 'stripe' = 'sandbox',
    /** Fee policy (Slice 3): basis points on the CAPTURED amount. VALUE is the
     *  Founder's (NUXT_PLATFORM_FEE_BPS); the structure ships at zero. */
    private readonly feeBps = 0,
    /** Risk limits (Slice 4, approved dispute-loss policy §4): 0 = unlimited. */
    private readonly riskLimits: { maxOpenDisputesMinor: number; maxLossMinor: number } =
      { maxOpenDisputesMinor: 0, maxLossMinor: 0 },
    /** Payout policy (C11): Founder values wearing configuration
     *  (NUXT_PAYOUT_INTERVAL_DAYS / NUXT_PAYOUT_MIN_MINOR). */
    private readonly payoutPolicy: { intervalDays: number; minMinor: number } =
      { intervalDays: 7, minMinor: 1000 },
  ) {}

  /** The one fee computation — the provider call and the ledger legs both use it. */
  feeFor(amountMinor: number): number {
    return Math.floor((amountMinor * this.feeBps) / 10_000)
  }

  // ——— phase 1: the journal (one row per provider operation, unique by key)

  private async journal(tx: Tx, op: {
    kind: ProviderOperation['kind']; idempotencyKey: string
    attemptKey?: string | null; intentId?: string | null; providerRef?: string | null
    orderId?: string | null; businessId?: string | null
    amountMinor?: number | null; currency?: string | null; detail?: Record<string, unknown>
  }): Promise<{ opId: string; state: ProviderOperation['state'] }> {
    const client = asClient(tx)
    const id = uuidv7()
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO provider_operations (id, kind, provider, idempotency_key, attempt_key, intent_id, provider_ref, order_id, business_id, amount_minor, currency, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [id, op.kind, this.providerName, op.idempotencyKey, op.attemptKey ?? null, op.intentId ?? null,
       op.providerRef ?? null, op.orderId ?? null, op.businessId ?? null, op.amountMinor ?? null,
       op.currency ?? null, JSON.stringify(op.detail ?? {})])
    if (inserted.rows[0]) return { opId: inserted.rows[0].id, state: 'pending' }
    const { rows } = await client.query<{ id: string; state: ProviderOperation['state'] }>(
      `SELECT id, state FROM provider_operations WHERE idempotency_key = $1`, [op.idempotencyKey])
    return { opId: rows[0]!.id, state: rows[0]!.state }
  }

  /**
   * Checkout's phase 1 (P4: idempotent forever by attempt key). Never touches the
   * provider: reads the intent's recorded truth, or journals the intent-to-
   * authorize for the boundary to drive OUTSIDE this transaction (§7).
   */
  async requestAuthorization(tx: Tx, input: { attemptKey: string; amountMinor: number; currency: string; businessId?: string }):
    Promise<{ state: 'authorized' | 'captured' | 'failed' | 'pending' | 'requires_action'; opId: string | null; providerRef: string | null }> {
    const client = asClient(tx)
    const { rows: existing } = await client.query<{ id: string; state: string; provider_ref: string | null }>(
      `SELECT id, state, provider_ref FROM payment_intents WHERE attempt_key = $1 FOR UPDATE`, [input.attemptKey])
    if (existing[0]) {
      const s = existing[0].state
      if (s === 'authorized' || s === 'captured') return { state: s, opId: null, providerRef: existing[0].provider_ref }
      // Slice 2: the intent awaits the BUYER's confirmation in the Element
      if (s === 'requires_action') return { state: 'requires_action', opId: null, providerRef: existing[0].provider_ref }
      return { state: 'failed', opId: null, providerRef: existing[0].provider_ref }
    }
    const op = await this.journal(tx, {
      kind: 'authorize', idempotencyKey: `${input.attemptKey}:intent`,
      attemptKey: input.attemptKey, businessId: input.businessId ?? null,
      amountMinor: input.amountMinor, currency: input.currency,
    })
    return { state: 'pending', opId: op.opId, providerRef: null }
  }

  /** Phase 3 for authorize: record the provider's answer as intent + facts + event. */
  async settleAuthorization(tx: Tx, op: ProviderOperation, result:
    | { ok: true; auth: ProviderAuthorization }
    | { ok: 'requires_confirmation'; providerRef: string }
    | { ok: false; detail: string }): Promise<void> {
    const client = asClient(tx)
    const intentId = uuidv7()
    const businessId = op.business_id
    if (result.ok === 'requires_confirmation') {
      // Slice 2: the intent is born awaiting the buyer's browser — the 'created'
      // fact cites the birth (P3); authorization arrives via webhook or return
      await client.query(
        `INSERT INTO payment_intents (id, attempt_key, business_id, amount_minor, currency, state, provider, provider_ref)
         VALUES ($1, $2, $3, $4, $5, 'requires_action', $6, $7) ON CONFLICT (attempt_key) DO NOTHING`,
        [intentId, op.attempt_key, businessId, op.amount_minor, op.currency, this.providerName, result.providerRef])
      await client.query(
        `INSERT INTO payment_facts (id, intent_id, kind, amount_minor) VALUES ($1, $2, 'created', $3)`,
        [uuidv7(), intentId, op.amount_minor])
      return
    }
    if (!result.ok) {
      await client.query(
        `INSERT INTO payment_intents (id, attempt_key, business_id, amount_minor, currency, state, provider)
         VALUES ($1, $2, $3, $4, $5, 'failed', $6) ON CONFLICT (attempt_key) DO NOTHING`,
        [intentId, op.attempt_key, businessId, op.amount_minor, op.currency, this.providerName])
      await client.query(
        `INSERT INTO payment_facts (id, intent_id, kind, amount_minor, detail) VALUES ($1, $2, 'declined', $3, $4)`,
        [uuidv7(), intentId, op.amount_minor, JSON.stringify({ detail: result.detail })])
      await this.events.append(tx, [{
        businessId, aggregate: { type: 'payment_intent', id: intentId },
        eventType: PAYMENTS_EVENT.AUTHORIZATION_FAILED, schemaVersion: 1,
        payload: { intent_id: intentId, amount_minor: op.amount_minor, currency: op.currency },
        actor: { type: 'system', id: 'payments' },
      }])
      return
    }
    await client.query(
      `INSERT INTO payment_intents (id, attempt_key, business_id, amount_minor, currency, state, provider, provider_ref)
       VALUES ($1, $2, $3, $4, $5, 'authorized', $6, $7) ON CONFLICT (attempt_key) DO NOTHING`,
      [intentId, op.attempt_key, businessId, op.amount_minor, op.currency, this.providerName, result.auth.providerRef])
    await client.query(
      `INSERT INTO payment_facts (id, intent_id, kind, amount_minor) VALUES ($1, $2, 'authorized', $3)`,
      [uuidv7(), intentId, op.amount_minor])
    await this.events.append(tx, [{
      businessId, aggregate: { type: 'payment_intent', id: intentId },
      eventType: PAYMENTS_EVENT.AUTHORIZATION_SUCCEEDED, schemaVersion: 1,
      payload: { intent_id: intentId, amount_minor: op.amount_minor, currency: op.currency },
      actor: { type: 'system', id: 'payments' },
    }])
  }

  /**
   * Slice 2 — the buyer's confirmation became provider truth: flip
   * requires_action → authorized (row-locked, idempotent — webhook and client
   * return may both arrive, in either order; the second changes nothing).
   */
  async completeClientAuthorization(tx: Tx, providerRef: string):
    Promise<{ completed: boolean; attemptKey: string | null }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ id: string; state: string; attempt_key: string; business_id: string; amount_minor: string; currency: string }>(
      `SELECT id, state, attempt_key, business_id, amount_minor::text, currency
       FROM payment_intents WHERE provider_ref = $1 FOR UPDATE`, [providerRef])
    const intent = rows[0]
    if (!intent) return { completed: false, attemptKey: null }
    if (intent.state !== 'requires_action') return { completed: false, attemptKey: intent.attempt_key } // already converged
    await client.query(`UPDATE payment_intents SET state = 'authorized', updated_at = now() WHERE id = $1`, [intent.id])
    await client.query(
      `INSERT INTO payment_facts (id, intent_id, kind, amount_minor) VALUES ($1, $2, 'authorized', $3)`,
      [uuidv7(), intent.id, intent.amount_minor])
    await this.events.append(tx, [{
      businessId: intent.business_id, aggregate: { type: 'payment_intent', id: intent.id },
      eventType: PAYMENTS_EVENT.AUTHORIZATION_SUCCEEDED, schemaVersion: 1,
      payload: { intent_id: intent.id, amount_minor: Number(intent.amount_minor), currency: intent.currency },
      actor: { type: 'system', id: 'payments' },
    }])
    return { completed: true, attemptKey: intent.attempt_key }
  }

  /** Phase 1 for void: journal the release of an authorization (compensation/24h path). */
  async requestVoid(tx: Tx, providerRef: string): Promise<{ opId: string }> {
    const { rows } = await asClient(tx).query<{ id: string }>(
      `SELECT id FROM payment_intents WHERE provider_ref = $1`, [providerRef])
    const op = await this.journal(tx, {
      kind: 'void', idempotencyKey: `${providerRef}:void`,
      intentId: rows[0]?.id ?? null, providerRef,
    })
    return { opId: op.opId }
  }

  /** Phase 3 for void. */
  async settleVoid(tx: Tx, op: ProviderOperation): Promise<void> {
    const client = asClient(tx)
    const { rows } = await client.query<{ id: string }>(
      `UPDATE payment_intents SET state = 'voided', updated_at = now()
       WHERE provider_ref = $1 AND state IN ('created','authorized','requires_action') RETURNING id`, [op.provider_ref])
    if (rows[0]) {
      await client.query(`INSERT INTO payment_facts (id, intent_id, kind) VALUES ($1, $2, 'voided')`, [uuidv7(), rows[0].id])
    }
  }

  /**
   * The single full capture, phase 1 (AMENDMENT-001 A1; C5's confirm calls this).
   * P2-guarded here (amount ≤ authorization); the provider call happens in the
   * boundary; `captured` answers idempotently forever.
   */
  async requestCapture(tx: Tx, input: { attemptKey: string; amountMinor: number; orderId: string }):
    Promise<{ state: 'captured' | 'pending' | 'unavailable'; opId: string | null; intentId: string | null; detail?: string }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ id: string; state: string; amount_minor: string; provider_ref: string | null; business_id: string; currency: string }>(
      `SELECT id, state, amount_minor::text, provider_ref, business_id, currency
       FROM payment_intents WHERE attempt_key = $1 FOR UPDATE`, [input.attemptKey])
    const intent = rows[0]
    if (!intent) return { state: 'unavailable', opId: null, intentId: null, detail: 'no intent for this attempt' }
    if (intent.state === 'captured') return { state: 'captured', opId: null, intentId: intent.id } // idempotent
    if (intent.state !== 'authorized') return { state: 'unavailable', opId: null, intentId: intent.id, detail: `intent is ${intent.state}` }
    if (input.amountMinor > Number(intent.amount_minor)) return { state: 'unavailable', opId: null, intentId: intent.id, detail: 'capture exceeds authorization (P2)' }
    const op = await this.journal(tx, {
      kind: 'capture', idempotencyKey: `${intent.id}:capture:1`, // ONE capture — the verified law
      attemptKey: input.attemptKey, intentId: intent.id, providerRef: intent.provider_ref,
      orderId: input.orderId, businessId: intent.business_id,
      amountMinor: input.amountMinor, currency: intent.currency,
    })
    return { state: 'pending', opId: op.opId, intentId: intent.id }
  }

  /** Phase 3 for capture: the funds become truth — intent, facts, ledger, events. */
  async settleCapture(tx: Tx, op: ProviderOperation): Promise<void> {
    const client = asClient(tx)
    const { rows } = await client.query<{ state: string }>(
      `SELECT state FROM payment_intents WHERE id = $1 FOR UPDATE`, [op.intent_id])
    if (rows[0]?.state === 'captured') return // a racer already settled
    await client.query(
      `UPDATE payment_intents SET state = 'captured', captured_minor = $2, order_id = $3, updated_at = now() WHERE id = $1`,
      [op.intent_id, op.amount_minor, op.order_id])
    await client.query(
      `INSERT INTO payment_facts (id, intent_id, kind, amount_minor) VALUES ($1, $2, 'captured', $3)`,
      [uuidv7(), op.intent_id, op.amount_minor])
    // the funds-flow posting (CONNECT_FUNDS_FLOW §1): clearing → the merchant's
    // holding, with the platform fee peeled off when the Founder's policy sets one
    const fee = this.feeFor(op.amount_minor!)
    const legs: LedgerLeg[] = [
      { kind: 'psp_clearing', businessId: null, deltaMinor: -op.amount_minor! },
      { kind: 'merchant_holding', businessId: op.business_id, deltaMinor: op.amount_minor! - fee },
    ]
    if (fee > 0) legs.push({ kind: 'platform_fees', businessId: null, deltaMinor: fee })
    await this.ledger.post(tx, op.currency!, legs, { intent_id: op.intent_id, order_id: op.order_id, kind: 'capture' })
    await this.events.append(tx, [
      {
        businessId: op.business_id, aggregate: { type: 'payment_intent', id: op.intent_id! },
        eventType: PAYMENTS_EVENT.CHARGE_SUCCEEDED, schemaVersion: 1,
        payload: { intent_id: op.intent_id, order_id: op.order_id, amount_minor: op.amount_minor, currency: op.currency },
        actor: { type: 'system', id: 'payments' },
      },
      {
        businessId: op.business_id, aggregate: { type: 'payment_intent', id: op.intent_id! },
        eventType: PAYMENTS_EVENT.HOLD_OPENED, schemaVersion: 1,
        payload: { intent_id: op.intent_id, order_id: op.order_id, amount_minor: op.amount_minor, currency: op.currency },
        actor: { type: 'system', id: 'payments' },
      },
    ])
  }

  /**
   * Money back (C6 — keystone enforcement; C8 reuses this exact primitive).
   * Bounded (refunded ≤ captured, schema-CHECKed AND guarded), idempotent per
   * (intent, cause key), cause-linked, ledger-reversed: holding first, then
   * payable (evidence-order fairness, CONNECT_FUNDS_FLOW §2).
   */
  async prepareRefund(tx: Tx, input: { orderId: string; amountMinor: number; causeKey: string; cause: Record<string, unknown> }):
    Promise<{ ok: true; opId: string | null; alreadyDone: boolean } | { ok: false; detail: string }> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      id: string; state: string; provider_ref: string | null; business_id: string; currency: string
      captured_minor: string; refunded_minor: string
    }>(
      `SELECT id, state, provider_ref, business_id, currency, captured_minor::text, refunded_minor::text
       FROM payment_intents WHERE order_id = $1 FOR UPDATE`, [input.orderId])
    const intent = rows[0]
    if (!intent) return { ok: false, detail: 'no intent for this order' }
    // idempotency by cause: the same cause never refunds twice — settled facts AND
    // already-journaled operations both answer quietly
    const { rows: prior } = await client.query<{ id: string }>(
      `SELECT id FROM payment_facts WHERE intent_id = $1 AND kind = 'refunded' AND detail->>'cause_key' = $2`,
      [intent.id, input.causeKey])
    if (prior[0]) return { ok: true, opId: null, alreadyDone: true }
    const key = `${intent.id}:refund:${input.causeKey}`
    const { rows: existingOp } = await client.query<{ id: string; state: string }>(
      `SELECT id, state FROM provider_operations WHERE idempotency_key = $1`, [key])
    if (existingOp[0]) {
      return { ok: true, opId: existingOp[0].state === 'pending' ? existingOp[0].id : null, alreadyDone: existingOp[0].state === 'succeeded' }
    }
    // P2 bounds, counting money already COMMITTED to pending refund operations —
    // two racing causes can never over-promise the captured amount
    const captured = Number(intent.captured_minor)
    const refunded = Number(intent.refunded_minor)
    const { rows: pend } = await client.query<{ pending: string }>(
      `SELECT COALESCE(sum(amount_minor), 0)::text AS pending FROM provider_operations
       WHERE intent_id = $1 AND kind = 'refund' AND state = 'pending'`, [intent.id])
    const pendingMinor = Number(pend[0]?.pending ?? 0)
    if (input.amountMinor <= 0 || refunded + pendingMinor + input.amountMinor > captured) {
      return { ok: false, detail: `refund exceeds captured (P2): ${refunded} + ${pendingMinor} pending + ${input.amountMinor} > ${captured}` }
    }
    const op = await this.journal(tx, {
      kind: 'refund', idempotencyKey: key,
      intentId: intent.id, providerRef: intent.provider_ref, orderId: input.orderId,
      businessId: intent.business_id, amountMinor: input.amountMinor, currency: intent.currency,
      detail: { cause_key: input.causeKey, ...input.cause },
    })
    return { ok: true, opId: op.opId, alreadyDone: false }
  }

  /** Phase 3 for refund: facts, bounded counter, ledger reversal, event.
   *  CERTIFICATION FINDING (destination + fee): Stripe's `refund_application_fee`
   *  returns the platform's fee to make the merchant whole — our books must say
   *  the same. The fee reverses PROPORTIONALLY; the merchant bears only the net. */
  async settleRefund(tx: Tx, op: ProviderOperation): Promise<void> {
    const client = asClient(tx)
    const factId = uuidv7()
    const causeKey = String(op.detail.cause_key ?? '')
    const { rows: intentRow } = await client.query<{ captured: string }>(
      `SELECT captured_minor::text AS captured FROM payment_intents WHERE id = $1 FOR UPDATE`, [op.intent_id])
    const captured = Number(intentRow[0]?.captured ?? 0)
    await client.query(
      `UPDATE payment_intents SET refunded_minor = refunded_minor + $2, updated_at = now() WHERE id = $1`,
      [op.intent_id, op.amount_minor])
    await client.query(
      `INSERT INTO payment_facts (id, intent_id, kind, amount_minor, detail) VALUES ($1, $2, 'refunded', $3, $4)`,
      [factId, op.intent_id, op.amount_minor, JSON.stringify(op.detail)])
    // the fee's share of this refund: proportional, clamped to what remains unreversed
    const { rows: feeRows } = await client.query<{ taken: string; reversed: string }>(
      `SELECT
         COALESCE(sum(e.delta_minor) FILTER (WHERE e.cause->>'kind' = 'capture'), 0)::text AS taken,
         COALESCE(-sum(e.delta_minor) FILTER (WHERE e.cause->>'kind' = 'refund'), 0)::text AS reversed
       FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
       WHERE a.kind = 'platform_fees' AND e.cause->>'intent_id' = $1`, [op.intent_id])
    const feeTaken = Number(feeRows[0]?.taken ?? 0)
    const feeReversed = Number(feeRows[0]?.reversed ?? 0)
    const feeReversal = captured > 0
      ? Math.min(feeTaken - feeReversed, Math.round(feeTaken * op.amount_minor! / captured))
      : 0
    const merchantShare = op.amount_minor! - feeReversal
    // ledger reversal: pull the MERCHANT's share back from holding first, then
    // payable (evidence-order fairness); the fee's share comes home from platform_fees
    const { rows: bal } = await client.query<{ kind: string; balance: string }>(
      `SELECT kind, balance_minor::text AS balance FROM ledger_accounts
       WHERE business_id = $1 AND kind IN ('merchant_holding','merchant_payable') AND currency = $2`,
      [op.business_id, op.currency])
    const holding = Number(bal.find((b) => b.kind === 'merchant_holding')?.balance ?? 0)
    const fromHolding = Math.min(merchantShare, Math.max(holding, 0))
    const fromPayable = merchantShare - fromHolding
    const legs: LedgerLeg[] = [{ kind: 'psp_clearing', businessId: null, deltaMinor: op.amount_minor! }]
    if (fromHolding > 0) legs.push({ kind: 'merchant_holding', businessId: op.business_id, deltaMinor: -fromHolding })
    if (fromPayable > 0) legs.push({ kind: 'merchant_payable', businessId: op.business_id, deltaMinor: -fromPayable })
    if (feeReversal > 0) legs.push({ kind: 'platform_fees', businessId: null, deltaMinor: -feeReversal })
    await this.ledger.post(tx, op.currency!, legs, { intent_id: op.intent_id, order_id: op.order_id, kind: 'refund', cause_key: causeKey })
    await this.events.append(tx, [{
      businessId: op.business_id, aggregate: { type: 'payment_intent', id: op.intent_id! },
      eventType: PAYMENTS_EVENT.REFUND_ISSUED, schemaVersion: 1,
      payload: { intent_id: op.intent_id, order_id: op.order_id, amount_minor: op.amount_minor, currency: op.currency, cause_key: causeKey },
      actor: { type: 'system', id: 'payments' },
    }])
  }

  /**
   * The payout-hold release (C6 — ORR-C3, ONE policy, never duplicated):
   * moves the order's still-held amount holding → payable and emits the fact.
   * Idempotent per order (cause-keyed like refunds).
   */
  async releaseHold(tx: Tx, input: { orderId: string; causeKey: string }):
    Promise<{ ok: true; releasedMinor: number; alreadyDone: boolean } | { ok: false; detail: string }> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      id: string; business_id: string; currency: string; captured_minor: string; refunded_minor: string
    }>(
      `SELECT id, business_id, currency, captured_minor::text, refunded_minor::text
       FROM payment_intents WHERE order_id = $1 AND state = 'captured' FOR UPDATE`, [input.orderId])
    const intent = rows[0]
    if (!intent) return { ok: false, detail: 'no captured intent for this order' }
    const { rows: prior } = await client.query<{ id: string }>(
      `SELECT id FROM payment_facts WHERE intent_id = $1 AND kind = 'webhook' AND detail->>'cause_key' = $2 AND detail->>'kind' = 'hold_released'`,
      [intent.id, input.causeKey])
    if (prior[0]) return { ok: true, releasedMinor: 0, alreadyDone: true }

    const releasable = Number(intent.captured_minor) - Number(intent.refunded_minor)
    if (releasable <= 0) return { ok: true, releasedMinor: 0, alreadyDone: false }
    await this.ledger.post(tx, intent.currency, [
      { kind: 'merchant_holding', businessId: intent.business_id, deltaMinor: -releasable },
      { kind: 'merchant_payable', businessId: intent.business_id, deltaMinor: releasable },
    ], { intent_id: intent.id, order_id: input.orderId, kind: 'hold_release', cause_key: input.causeKey })
    await client.query(
      `INSERT INTO payment_facts (id, intent_id, kind, amount_minor, detail) VALUES ($1, $2, 'webhook', $3, $4)`,
      [uuidv7(), intent.id, releasable, JSON.stringify({ kind: 'hold_released', cause_key: input.causeKey })])
    await this.events.append(tx, [{
      businessId: intent.business_id, aggregate: { type: 'payment_intent', id: intent.id },
      eventType: PAYMENTS_EVENT.HOLD_RELEASED, schemaVersion: 1,
      payload: { intent_id: intent.id, order_id: input.orderId, amount_minor: releasable, currency: intent.currency },
      actor: { type: 'system', id: 'payments' },
    }])
    return { ok: true, releasedMinor: releasable, alreadyDone: false }
  }

  // ——— Connect profile (Slice 3): the capability snapshot — a small state table,
  // never inference from cached API calls (RM-H4).

  async getPaymentProfile(tx: Tx, businessId: string):
    Promise<{ provider_account: string | null; charges_enabled: boolean; payouts_enabled: boolean; onboarding_state: string } | null> {
    const { rows } = await asClient(tx).query<{ provider_account: string | null; charges_enabled: boolean; payouts_enabled: boolean; onboarding_state: string }>(
      `SELECT provider_account, charges_enabled, payouts_enabled, onboarding_state
       FROM merchant_payment_profiles WHERE business_id = $1`, [businessId])
    return rows[0] ?? null
  }

  /** Record the connected account the boundary just created (phase 3 of onboarding start). */
  async recordConnectedAccount(tx: Tx, businessId: string, accountId: string): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO merchant_payment_profiles (business_id, provider, provider_account, onboarding_state)
       VALUES ($1, $2, $3, 'started')
       ON CONFLICT (business_id) DO UPDATE SET provider_account = COALESCE(merchant_payment_profiles.provider_account, EXCLUDED.provider_account), updated_at = now()`,
      [businessId, this.providerName, accountId])
  }

  /**
   * The provider's account truth lands in the snapshot (webhook `account.updated`
   * or the onboarding-return sync — idempotent from either). Emits
   * payments.account.updated ONLY when a capability actually changed, so the
   * merchant's letter says something that just became true.
   */
  async applyAccountSnapshot(tx: Tx, input: { accountId: string; state: ProviderAccountState }):
    Promise<{ businessId: string | null; changed: boolean; chargesEnabled: boolean }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ business_id: string; charges_enabled: boolean; payouts_enabled: boolean }>(
      `SELECT business_id, charges_enabled, payouts_enabled FROM merchant_payment_profiles WHERE provider_account = $1 FOR UPDATE`,
      [input.accountId])
    const profile = rows[0]
    if (!profile) return { businessId: null, changed: false, chargesEnabled: false }
    const changed = profile.charges_enabled !== input.state.chargesEnabled || profile.payouts_enabled !== input.state.payoutsEnabled
    const onboardingState = input.state.detailsSubmitted ? (input.state.chargesEnabled ? 'complete' : 'submitted') : 'started'
    await client.query(
      `UPDATE merchant_payment_profiles
       SET charges_enabled = $2, payouts_enabled = $3, onboarding_state = $4, updated_at = now()
       WHERE provider_account = $1`,
      [input.accountId, input.state.chargesEnabled, input.state.payoutsEnabled, onboardingState])
    if (changed) {
      await this.events.append(tx, [{
        businessId: profile.business_id, aggregate: { type: 'payment_profile', id: profile.business_id },
        eventType: PAYMENTS_EVENT.ACCOUNT_UPDATED, schemaVersion: 1,
        payload: {
          business_id: profile.business_id,
          charges_enabled: input.state.chargesEnabled,
          payouts_enabled: input.state.payoutsEnabled,
          disabled_reason: input.state.disabledReason,
        },
        actor: { type: 'system', id: 'payments' },
      }])
    }
    return { businessId: profile.business_id, changed, chargesEnabled: input.state.chargesEnabled }
  }

  /**
   * RM-H5/RM-H6 — the payout gate (structure now, sweep later): payouts initiate
   * only for enabled accounts with strictly positive payable net of frozen funds.
   */
  payoutAllowed(profile: { payouts_enabled: boolean }, payableMinor: number, frozenMinor = 0): boolean {
    return profile.payouts_enabled && payableMinor - frozenMinor > 0
  }

  // ——— Disputes (Slice 4, RM-C3): the record, the freeze, the settlement.
  // Approved loss policy: a filing alone never makes the merchant liable; DOF
  // absorbs ordinary good-faith losses; recovery is a HUMAN's documented act.

  /**
   * A chargeback arrived (webhook `charge.dispute.created` or test-mode staging).
   * Idempotent per provider dispute id. Freezes what's still in the merchant's
   * holding — up to the disputed amount — into dispute_reserve, and speaks:
   * the event → the merchant's letter with the DEADLINE; state feeds /ops/alarms.
   */
  async openDispute(tx: Tx, input: {
    providerDisputeId: string; providerRef: string | null
    amountMinor: number; currency: string; reason: string | null; evidenceDueAt: string | null
  }): Promise<{ opened: boolean; disputeId: string | null; riskPaused: boolean }> {
    const client = asClient(tx)
    const { rows: dup } = await client.query<{ id: string }>(
      `SELECT id FROM payment_disputes WHERE provider_dispute_id = $1`, [input.providerDisputeId])
    if (dup[0]) return { opened: false, disputeId: dup[0].id, riskPaused: false }

    const { rows: intents } = await client.query<{ id: string; order_id: string | null; business_id: string }>(
      `SELECT id, order_id, business_id FROM payment_intents WHERE provider_ref = $1 FOR UPDATE`,
      [input.providerRef ?? ''])
    const intent = intents[0] ?? null
    const businessId = intent?.business_id ?? null

    // the freeze: holding → dispute_reserve, bounded by what holding still has
    let frozen = 0
    if (businessId) {
      const { rows: bal } = await client.query<{ balance: string }>(
        `SELECT balance_minor::text AS balance FROM ledger_accounts
         WHERE business_id = $1 AND kind = 'merchant_holding' AND currency = $2`, [businessId, input.currency])
      const holding = Number(bal[0]?.balance ?? 0)
      frozen = Math.min(Math.max(holding, 0), input.amountMinor)
      if (frozen > 0) {
        await this.ledger.post(tx, input.currency, [
          { kind: 'merchant_holding', businessId, deltaMinor: -frozen },
          { kind: 'dispute_reserve', businessId, deltaMinor: frozen },
        ], { kind: 'dispute_freeze', dispute: input.providerDisputeId, intent_id: intent?.id ?? null })
      }
    }

    const disputeId = uuidv7()
    await client.query(
      `INSERT INTO payment_disputes (id, provider_dispute_id, intent_id, order_id, business_id, amount_minor, currency, reason, evidence_due_at, frozen_minor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [disputeId, input.providerDisputeId, intent?.id ?? null, intent?.order_id ?? null, businessId,
       input.amountMinor, input.currency, input.reason, input.evidenceDueAt, frozen])
    if (intent?.order_id) {
      await client.query(
        `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, 'note', $3, $4)`,
        [uuidv7(), intent.order_id,
         JSON.stringify({ text: `Payment dispute opened (${input.providerDisputeId}) — evidence due ${input.evidenceDueAt ?? 'unknown'}. Handled in the Stripe dashboard; runbook: disputes.`, ops: true, internal: true }),
         JSON.stringify({ type: 'system', id: 'payments' })])
    }
    await this.events.append(tx, [{
      businessId, aggregate: { type: 'payment_dispute', id: disputeId },
      eventType: PAYMENTS_EVENT.DISPUTE_OPENED, schemaVersion: 1,
      payload: {
        dispute_id: disputeId, business_id: businessId, order_id: intent?.order_id ?? null,
        amount_minor: input.amountMinor, currency: input.currency,
        reason: input.reason, evidence_due_at: input.evidenceDueAt,
      },
      actor: { type: 'system', id: 'payments' },
    }])

    // the exposure limits (approved policy §4–5): crossing pauses the till for HUMAN review
    let riskPaused = false
    if (businessId) {
      const { rows: exposure } = await client.query<{ open_sum: string; lost_sum: string }>(
        `SELECT COALESCE(sum(amount_minor) FILTER (WHERE state = 'open'), 0)::text AS open_sum,
                COALESCE(sum(amount_minor) FILTER (WHERE state = 'lost'), 0)::text AS lost_sum
         FROM payment_disputes WHERE business_id = $1`, [businessId])
      const openSum = Number(exposure[0]?.open_sum ?? 0)
      const lostSum = Number(exposure[0]?.lost_sum ?? 0)
      const overOpen = this.riskLimits.maxOpenDisputesMinor > 0 && openSum > this.riskLimits.maxOpenDisputesMinor
      const overLoss = this.riskLimits.maxLossMinor > 0 && lostSum > this.riskLimits.maxLossMinor
      if (overOpen || overLoss) {
        await this.riskPause(tx, businessId,
          overOpen ? `open dispute exposure ${openSum} exceeds limit ${this.riskLimits.maxOpenDisputesMinor}`
                   : `cumulative dispute losses ${lostSum} exceed limit ${this.riskLimits.maxLossMinor}`)
        riskPaused = true
      }
    }
    return { opened: true, disputeId, riskPaused }
  }

  /**
   * The bank's answer. WON → the frozen entitlement returns to holding.
   * LOST → the provider debited us: the reserve covers what it froze and the
   * PLATFORM absorbs the remainder (approved policy §1 — psp_fee_expense),
   * never the good-faith merchant.
   */
  async resolveDispute(tx: Tx, input: { providerDisputeId: string; outcome: 'won' | 'lost' }):
    Promise<{ resolved: boolean; alreadyResolved: boolean }> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      id: string; state: string; business_id: string | null; order_id: string | null
      amount_minor: string; currency: string; frozen_minor: string
    }>(
      `SELECT id, state, business_id, order_id, amount_minor::text, currency, frozen_minor::text
       FROM payment_disputes WHERE provider_dispute_id = $1 FOR UPDATE`, [input.providerDisputeId])
    const dispute = rows[0]
    if (!dispute) return { resolved: false, alreadyResolved: false }
    if (dispute.state !== 'open') return { resolved: false, alreadyResolved: true }
    const frozen = Number(dispute.frozen_minor)
    const amount = Number(dispute.amount_minor)

    if (input.outcome === 'won' && frozen > 0 && dispute.business_id) {
      await this.ledger.post(tx, dispute.currency, [
        { kind: 'dispute_reserve', businessId: dispute.business_id, deltaMinor: -frozen },
        { kind: 'merchant_holding', businessId: dispute.business_id, deltaMinor: frozen },
      ], { kind: 'dispute_won', dispute: input.providerDisputeId })
    }
    if (input.outcome === 'lost') {
      // APPROVED POLICY §1: DOF absorbs ordinary good-faith losses — the frozen
      // entitlement RETURNS to the merchant and the WHOLE loss lands on the
      // platform (psp_fee_expense). Recovery for PROVEN merchant-caused loss
      // (§3) is a later, documented, human act — never this automatic path.
      const legs: LedgerLeg[] = [{ kind: 'psp_clearing', businessId: null, deltaMinor: amount }]
      if (frozen > 0 && dispute.business_id) {
        legs.push({ kind: 'dispute_reserve', businessId: dispute.business_id, deltaMinor: -frozen })
        legs.push({ kind: 'merchant_holding', businessId: dispute.business_id, deltaMinor: frozen })
      }
      legs.push({ kind: 'psp_fee_expense', businessId: null, deltaMinor: -amount })
      await this.ledger.post(tx, dispute.currency, legs, { kind: 'dispute_lost', dispute: input.providerDisputeId })
    }
    await client.query(
      `UPDATE payment_disputes SET state = $2, updated_at = now() WHERE id = $1`,
      [dispute.id, input.outcome])
    await this.events.append(tx, [{
      businessId: dispute.business_id, aggregate: { type: 'payment_dispute', id: dispute.id },
      eventType: PAYMENTS_EVENT.DISPUTE_CLOSED, schemaVersion: 1,
      payload: {
        dispute_id: dispute.id, business_id: dispute.business_id, order_id: dispute.order_id,
        amount_minor: amount, currency: dispute.currency, outcome: input.outcome,
      },
      actor: { type: 'system', id: 'payments' },
    }])
    return { resolved: true, alreadyResolved: false }
  }

  /** Approved policy §5: the pause preserves the storefront and buyer protection;
   *  only checkout and payouts stop; a human's audited act resumes. */
  async riskPause(tx: Tx, businessId: string, reason: string): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO merchant_payment_profiles (business_id, provider, risk_paused_at, risk_pause_reason)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (business_id) DO UPDATE
       SET risk_paused_at = COALESCE(merchant_payment_profiles.risk_paused_at, now()),
           risk_pause_reason = COALESCE(merchant_payment_profiles.risk_pause_reason, EXCLUDED.risk_pause_reason),
           updated_at = now()`,
      [businessId, this.providerName, reason])
  }

  async riskResume(tx: Tx, businessId: string): Promise<void> {
    await asClient(tx).query(
      `UPDATE merchant_payment_profiles SET risk_paused_at = NULL, risk_pause_reason = NULL, updated_at = now()
       WHERE business_id = $1`, [businessId])
  }

  /** The intent's recorded state, by attempt (Slice 2 — confirm's Element gate). */
  async peekIntentState(tx: Tx, attemptKey: string): Promise<string | null> {
    const { rows } = await asClient(tx).query<{ state: string }>(
      `SELECT state FROM payment_intents WHERE attempt_key = $1`, [attemptKey])
    return rows[0]?.state ?? null
  }

  // ——— C11: payouts (the money's last mile — eligibility was C6's hold release)

  /**
   * Phase 1 for the payout sweep: every business whose PAYABLE balance clears
   * the gates gets ONE journaled payout op per period. The period is the count
   * of prior payout postings + 1 (ledger-derived, schedule-change-proof — the
   * ONE derivation, per the PE review §6.3). Gates, in order: payable > 0 ·
   * payouts_enabled · not risk-paused · has a connected account · net of
   * UNCOVERED dispute exposure (open amounts the freeze fell short of) ·
   * ≥ the minimum · the interval has passed since the last payout posting.
   */
  async preparePayoutSweep(tx: Tx): Promise<{ opIds: string[]; skipped: number }> {
    const client = asClient(tx)
    const { rows: candidates } = await client.query<{
      business_id: string; currency: string; payable: string
      provider_account: string | null; payouts_enabled: boolean | null; risk_paused: boolean | null
      uncovered: string; prior_payouts: string; last_payout_at: string | null
    }>(
      `SELECT a.business_id, a.currency, a.balance_minor::text AS payable,
              p.provider_account, p.payouts_enabled, (p.risk_paused_at IS NOT NULL) AS risk_paused,
              COALESCE((SELECT sum(d.amount_minor - d.frozen_minor) FROM payment_disputes d
                        WHERE d.business_id = a.business_id AND d.state = 'open'), 0)::text AS uncovered,
              COALESCE((SELECT count(*) FROM ledger_entries e JOIN ledger_accounts la ON la.id = e.account_id
                        WHERE la.kind = 'merchant_payable' AND la.business_id = a.business_id
                          AND e.cause->>'kind' = 'payout'), 0)::text AS prior_payouts,
              (SELECT max(e.created_at)::text FROM ledger_entries e JOIN ledger_accounts la ON la.id = e.account_id
                WHERE la.kind = 'merchant_payable' AND la.business_id = a.business_id
                  AND e.cause->>'kind' = 'payout') AS last_payout_at
       FROM ledger_accounts a
       LEFT JOIN merchant_payment_profiles p ON p.business_id = a.business_id
       WHERE a.kind = 'merchant_payable' AND a.balance_minor > 0
         -- one payout in flight per business, EVER: a pending op (incl. a failed
         -- payout's re-armed retry) blocks new periods until it lands
         AND NOT EXISTS (SELECT 1 FROM provider_operations po
                          WHERE po.business_id = a.business_id AND po.kind = 'payout' AND po.state = 'pending')
       ORDER BY a.business_id LIMIT 100`)
    const opIds: string[] = []
    let skipped = 0
    for (const c of candidates) {
      const payoutable = Number(c.payable) - Math.max(0, Number(c.uncovered))
      const intervalDue = !c.last_payout_at
        || (Date.now() - new Date(c.last_payout_at).getTime()) >= this.payoutPolicy.intervalDays * 86_400_000
      if (!c.payouts_enabled || c.risk_paused || !c.provider_account
          || payoutable < this.payoutPolicy.minMinor || !intervalDue) { skipped += 1; continue }
      const period = Number(c.prior_payouts) + 1
      const op = await this.journal(tx, {
        kind: 'payout', idempotencyKey: `payout:${c.business_id}:${period}`,
        businessId: c.business_id, amountMinor: payoutable, currency: c.currency,
        detail: { account: c.provider_account, period },
      })
      if (op.state === 'pending') opIds.push(op.opId)
    }
    return { opIds, skipped }
  }

  /** Phase 3 for payout: the obligation settles — payable → out of the Stripe
   *  system. The posting's cause IS the permanent payout record (PE review §3.1):
   *  period + provider payout id live in append-only ledger truth, not a table. */
  async settlePayout(tx: Tx, op: ProviderOperation, result: { payoutId: string }): Promise<void> {
    const client = asClient(tx)
    await client.query(
      `UPDATE provider_operations SET provider_ref = $2 WHERE id = $1`, [op.id, result.payoutId])
    await this.ledger.post(tx, op.currency!, [
      { kind: 'merchant_payable', businessId: op.business_id, deltaMinor: -op.amount_minor! },
      { kind: 'psp_clearing', businessId: null, deltaMinor: op.amount_minor! },
    ], { kind: 'payout', period: op.detail.period, provider_payout_id: result.payoutId, business_id: op.business_id })
  }

  /**
   * C11 S2: a payout's LATER truth arrives (webhook or reconciliation catch-up).
   * `paid` emits the letter-bearing event. `failed` is §7-native recovery: the
   * settle posting reverses (payable comes home, cause 'payout_failed'), a
   * FRESH op re-arms the retry under `…:r{n}` — facts + journal, no third
   * lifecycle store. Idempotent per provider payout id (the reversal posts once).
   */
  async handlePayoutOutcome(tx: Tx, input: { providerPayoutId: string; outcome: 'paid' | 'failed'; detail?: string | null }):
    Promise<{ handled: boolean }> {
    const client = asClient(tx)
    const { rows } = await client.query<ProviderOperation & { amount_minor: string }>(
      `SELECT id, kind, idempotency_key, attempt_key, intent_id, provider_ref, order_id, business_id,
              amount_minor::text AS amount_minor, currency, state, attempts, detail
       FROM provider_operations WHERE kind = 'payout' AND provider_ref = $1 FOR UPDATE`, [input.providerPayoutId])
    const op = rows[0]
    if (!op) return { handled: false } // not ours (e.g. a platform-balance payout)
    const period = Number(op.detail.period ?? 0)
    const base = { business_id: op.business_id, amount_minor: Number(op.amount_minor), currency: op.currency, period, provider_payout_id: input.providerPayoutId }
    if (input.outcome === 'paid') {
      // idempotent per payout id — a replayed 'paid' appends nothing twice
      const { rows: seen } = await client.query<{ id: string }>(
        `SELECT id FROM payments_domain_events WHERE event_type = $1
          AND payload->>'provider_payout_id' = $2 LIMIT 1`,
        [PAYMENTS_EVENT.PAYOUT_PAID, input.providerPayoutId])
      if (seen[0]) return { handled: true }
      await this.events.append(tx, [{
        businessId: op.business_id, aggregate: { type: 'payout', id: op.id },
        eventType: PAYMENTS_EVENT.PAYOUT_PAID, schemaVersion: 1,
        payload: base, actor: { type: 'system', id: 'payments' },
      }])
      return { handled: true }
    }
    // failed: reverse ONCE (idempotent per payout id), re-arm the retry
    const { rows: prior } = await client.query<{ id: string }>(
      `SELECT e.id FROM ledger_entries e WHERE e.cause->>'kind' = 'payout_failed'
        AND e.cause->>'provider_payout_id' = $1 LIMIT 1`, [input.providerPayoutId])
    if (prior[0]) return { handled: true } // replayed failure webhook — already reversed
    await this.ledger.post(tx, op.currency!, [
      { kind: 'merchant_payable', businessId: op.business_id, deltaMinor: Number(op.amount_minor) },
      { kind: 'psp_clearing', businessId: null, deltaMinor: -Number(op.amount_minor) },
    ], { kind: 'payout_failed', period, provider_payout_id: input.providerPayoutId, business_id: op.business_id })
    const retry = Number(/:r(\d+)$/.exec(op.idempotency_key)?.[1] ?? 0) + 1
    await this.journal(tx, {
      kind: 'payout', idempotencyKey: `payout:${op.business_id}:${period}:r${retry}`,
      businessId: op.business_id, amountMinor: Number(op.amount_minor), currency: op.currency,
      detail: { account: op.detail.account, period, retry_of: input.providerPayoutId },
    })
    await this.events.append(tx, [{
      businessId: op.business_id, aggregate: { type: 'payout', id: op.id },
      eventType: PAYMENTS_EVENT.PAYOUT_FAILED, schemaVersion: 1,
      payload: { ...base, detail: input.detail ?? null }, actor: { type: 'system', id: 'payments' },
    }])
    return { handled: true }
  }

  /**
   * C11 S2: the maker's money story — the THREE numbers and one rhythm the
   * Merchant Experience Validation fixed (waiting / ready-net / paid, with the
   * set-aside visible so numbers never surprise). All state-derived from the
   * ledger; the presentation model is promotion-ready (PE review: no UI owns
   * payout logic — this IS the model, wherever it later renders).
   */
  async moneyStory(tx: Tx, businessId: string): Promise<{
    currency: string
    waiting_minor: number
    ready_minor: number
    set_aside_minor: number
    paid_minor: number
    min_minor: number
    interval_days: number
    next_due_at: string | null
    history: Array<{ amount_minor: number; at: string; provider_payout_id: string; status: 'on_its_way' | 'arrived' | 'needs_another_try' }>
  }> {
    const client = asClient(tx)
    const { rows: bal } = await client.query<{ kind: string; balance: string; currency: string }>(
      `SELECT kind, balance_minor::text AS balance, currency FROM ledger_accounts
       WHERE business_id = $1 AND kind IN ('merchant_holding','merchant_payable')`, [businessId])
    const currency = bal[0]?.currency ?? 'EUR'
    const waiting = Math.max(0, Number(bal.find((b) => b.kind === 'merchant_holding')?.balance ?? 0))
    const payableGross = Math.max(0, Number(bal.find((b) => b.kind === 'merchant_payable')?.balance ?? 0))
    const { rows: exposure } = await client.query<{ uncovered: string }>(
      `SELECT COALESCE(sum(amount_minor - frozen_minor), 0)::text AS uncovered
       FROM payment_disputes WHERE business_id = $1 AND state = 'open'`, [businessId])
    const setAside = Math.min(payableGross, Math.max(0, Number(exposure[0]?.uncovered ?? 0)))
    const { rows: payouts } = await client.query<{ amount: string; at: string; po: string; failed: boolean; arrived: boolean }>(
      `SELECT (-e.delta_minor)::text AS amount, e.created_at::text AS at,
              e.cause->>'provider_payout_id' AS po,
              EXISTS (SELECT 1 FROM ledger_entries f WHERE f.cause->>'kind' = 'payout_failed'
                        AND f.cause->>'provider_payout_id' = e.cause->>'provider_payout_id') AS failed,
              EXISTS (SELECT 1 FROM payments_domain_events ev WHERE ev.event_type = 'payments.payout.paid'
                        AND ev.payload->>'provider_payout_id' = e.cause->>'provider_payout_id') AS arrived
       FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
       WHERE a.kind = 'merchant_payable' AND a.business_id = $1 AND e.cause->>'kind' = 'payout'
       ORDER BY e.created_at DESC LIMIT 10`, [businessId])
    const paid = payouts.filter((p) => !p.failed).reduce((s, p) => s + Number(p.amount), 0)
    const lastAt = payouts[0]?.at ?? null
    const nextDue = lastAt
      ? new Date(new Date(lastAt).getTime() + this.payoutPolicy.intervalDays * 86_400_000).toISOString()
      : null
    return {
      currency,
      waiting_minor: waiting,
      ready_minor: payableGross - setAside,
      set_aside_minor: setAside,
      paid_minor: paid,
      min_minor: this.payoutPolicy.minMinor,
      interval_days: this.payoutPolicy.intervalDays,
      next_due_at: nextDue,
      history: payouts.map((p) => ({
        amount_minor: Number(p.amount), at: p.at, provider_payout_id: p.po ?? '',
        status: p.failed ? 'needs_another_try' as const : p.arrived ? 'arrived' as const : 'on_its_way' as const,
      })),
    }
  }

  /** The 24h honest failure closes its pending provider work — visible, never eternal. */
  async abandonPending(tx: Tx, attemptKey: string): Promise<void> {
    await asClient(tx).query(
      `UPDATE provider_operations SET state = 'abandoned', updated_at = now()
       WHERE attempt_key = $1 AND state = 'pending'`, [attemptKey])
  }

  /** Webhook ingestion: dedupe by provider event id (A8-7 layer 4), then record the
   *  fact — WITH the provider's exact payload preserved (RM-M1: forensics). */
  async ingestProviderEvent(tx: Tx, input: { provider: string; eventId: string; intentRef: string | null; kind: string; payload?: unknown; detail?: Record<string, unknown> }):
    Promise<{ fresh: boolean }> {
    const client = asClient(tx)
    const inserted = await client.query(
      `INSERT INTO provider_events (provider, event_id, intent_ref, payload) VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, event_id) DO NOTHING`,
      [input.provider, input.eventId, input.intentRef, input.payload === undefined ? null : JSON.stringify(input.payload)])
    if (inserted.rowCount === 0) return { fresh: false }
    if (input.intentRef) {
      const { rows } = await client.query<{ id: string }>(`SELECT id FROM payment_intents WHERE provider_ref = $1`, [input.intentRef])
      if (rows[0]) {
        await client.query(
          `INSERT INTO payment_facts (id, intent_id, kind, provider_event_id, detail) VALUES ($1, $2, 'webhook', $3, $4)`,
          [uuidv7(), rows[0].id, input.eventId, JSON.stringify({ kind: input.kind, ...(input.detail ?? {}) })])
      }
    }
    return { fresh: true }
  }
}

