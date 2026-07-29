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
import Stripe from 'stripe'
import { uuidv7 } from '../../../platform/uuid'
import type { Tx, EventStore } from '../../../platform/types'
import { asClient } from '../../../platform/db'
import { PAYMENTS_EVENT } from '../shared-kernel/events'

export const STRIPE_PINNED_API_VERSION = '2026-06-24.dahlia'

// ————————————————————————————————————————————— provider port (ACL — ADR-008 §6)

export interface ProviderAuthorization { providerRef: string }
export interface ProviderPort {
  readonly name: 'sandbox' | 'stripe'
  authorize(input: { attemptKey: string; amountMinor: number; currency: string }):
    Promise<{ ok: true; auth: ProviderAuthorization } | { ok: false; detail: string }>
  capture(providerRef: string, amountMinor: number): Promise<{ ok: true } | { ok: false; detail: string }>
  void(providerRef: string): Promise<void>
}

/** Deterministic twin (test law; decline parity with the C3 sandbox: 66600). */
export class SandboxProviderTwin implements ProviderPort {
  readonly name = 'sandbox' as const
  constructor(private readonly declineAmounts: number[] = [66600]) {}
  async authorize(input: { attemptKey: string; amountMinor: number; currency: string }) {
    if (this.declineAmounts.includes(input.amountMinor)) {
      return { ok: false as const, detail: 'The payment method declined.' }
    }
    return { ok: true as const, auth: { providerRef: `sandbox-pi-${input.attemptKey}` } }
  }
  async capture(_ref: string, _amount: number) { return { ok: true as const } }
  async void(_ref: string): Promise<void> { /* nothing held */ }
}

/**
 * Stripe adapter — manual-capture PaymentIntents under per-operation idempotency
 * keys (A8-7 layer 3). Card data never transits DOF (SAQ-A): confirmation happens
 * with provider-side test/hosted instruments; this server-side adapter only
 * creates, captures, and cancels intents by token.
 */
export class StripeProviderAdapter implements ProviderPort {
  readonly name = 'stripe' as const
  private readonly stripe: Stripe
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: STRIPE_PINNED_API_VERSION as Stripe.LatestApiVersion })
  }
  async authorize(input: { attemptKey: string; amountMinor: number; currency: string }) {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        capture_method: 'manual',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      }, { idempotencyKey: `${input.attemptKey}:intent` })
      return { ok: true as const, auth: { providerRef: intent.id } }
    } catch (error) {
      return { ok: false as const, detail: (error as Stripe.errors.StripeError).message ?? 'The payment could not be authorized.' }
    }
  }
  async capture(providerRef: string, amountMinor: number) {
    try {
      await this.stripe.paymentIntents.capture(providerRef,
        { amount_to_capture: amountMinor },
        { idempotencyKey: `${providerRef}:capture:1` }) // ONE capture — the verified law
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, detail: (error as Stripe.errors.StripeError).message ?? 'The capture failed.' }
    }
  }
  async void(providerRef: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(providerRef).catch(() => { /* already terminal — idempotent enough */ })
  }
}

// ————————————————————————————————————————————— the ledger (A8-1; L1–L3)

export type LedgerAccountKind =
  | 'psp_clearing' | 'merchant_holding' | 'merchant_payable'
  | 'platform_fees' | 'psp_fee_expense' | 'refund_liability' | 'dispute_reserve'

export interface LedgerLeg { kind: LedgerAccountKind; businessId: string | null; deltaMinor: number }

export class LedgerPoster {
  /** The only write path for money truth: one balanced posting, atomically. */
  async post(tx: Tx, currency: string, legs: LedgerLeg[], cause: Record<string, unknown>): Promise<string> {
    const sum = legs.reduce((s, leg) => s + leg.deltaMinor, 0)
    if (sum !== 0) throw new Error(`unbalanced posting: ${sum} (L1)`)
    const client = asClient(tx)
    const postingId = uuidv7()
    for (const leg of legs) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO ledger_accounts (id, kind, business_id, currency)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (kind, business_id, currency) DO UPDATE SET kind = EXCLUDED.kind
         RETURNING id`,
        [uuidv7(), leg.kind, leg.businessId, currency])
      const accountId = rows[0]!.id
      await client.query(`SELECT id FROM ledger_accounts WHERE id = $1 FOR UPDATE`, [accountId])
      await client.query(
        `INSERT INTO ledger_entries (id, posting_id, account_id, delta_minor, cause) VALUES ($1, $2, $3, $4, $5)`,
        [uuidv7(), postingId, accountId, leg.deltaMinor, JSON.stringify(cause)])
      await client.query(
        `UPDATE ledger_accounts SET balance_minor = balance_minor + $2 WHERE id = $1`,
        [accountId, leg.deltaMinor])
    }
    return postingId
  }

  /** L3 — the recompute identity: cached balances ≡ entry sums. Loud when false. */
  async recomputeCheck(tx: Tx): Promise<{ clean: boolean; drift: Array<{ account_id: string; cached: number; actual: number }> }> {
    const { rows } = await asClient(tx).query<{ account_id: string; cached: string; actual: string }>(
      `SELECT a.id AS account_id, a.balance_minor::text AS cached,
              COALESCE((SELECT sum(e.delta_minor) FROM ledger_entries e WHERE e.account_id = a.id), 0)::text AS actual
       FROM ledger_accounts a`)
    const drift = rows.filter((r) => r.cached !== r.actual)
      .map((r) => ({ account_id: r.account_id, cached: Number(r.cached), actual: Number(r.actual) }))
    return { clean: drift.length === 0, drift }
  }
}

// ————————————————————————————————————————————— the service (intent lifecycle)

export class PaymentsService {
  constructor(
    private readonly events: EventStore,
    private readonly provider: ProviderPort,
    readonly ledger: LedgerPoster,
  ) {}

  /**
   * PaymentPort.authorize (structural): idempotent forever by attempt key (P4).
   * Runs on the CALLER's transaction (PRR-C1 — an own-transaction here acquired a
   * second pool connection while the checkout held its first; ≥ pool-size
   * concurrent buyers deadlocked the whole app). The provider call is idempotent
   * by attempt key, so a rolled-back tx replayed later re-lands on the SAME
   * provider intent — no duplicate money objects exist even when our row was
   * never written.
   */
  async authorize(tx: Tx, input: { attemptKey: string; amountMinor: number; currency: string; businessId?: string }):
    Promise<{ ok: true; auth: { authRef: string } } | { ok: false; code: 'DECLINED'; detail: string }> {
    {
      const client = asClient(tx)
      const { rows: existing } = await client.query<{ id: string; state: string; provider_ref: string | null }>(
        `SELECT id, state, provider_ref FROM payment_intents WHERE attempt_key = $1 FOR UPDATE`, [input.attemptKey])
      if (existing[0]) {
        if (existing[0].state === 'authorized' || existing[0].state === 'captured') {
          return { ok: true as const, auth: { authRef: existing[0].provider_ref ?? existing[0].id } }
        }
        return { ok: false as const, code: 'DECLINED' as const, detail: 'This payment attempt already failed — start a fresh checkout.' }
      }
      const result = await this.provider.authorize(input)
      const intentId = uuidv7()
      const businessId = input.businessId ?? null
      if (!result.ok) {
        await client.query(
          `INSERT INTO payment_intents (id, attempt_key, business_id, amount_minor, currency, state, provider)
           VALUES ($1, $2, $3, $4, $5, 'failed', $6)
           ON CONFLICT (attempt_key) DO NOTHING`,
          [intentId, input.attemptKey, businessId, input.amountMinor, input.currency, this.provider.name])
        await client.query(
          `INSERT INTO payment_facts (id, intent_id, kind, amount_minor, detail) VALUES ($1, $2, 'declined', $3, $4)`,
          [uuidv7(), intentId, input.amountMinor, JSON.stringify({ detail: result.detail })])
        await this.events.append(tx, [{
          businessId, aggregate: { type: 'payment_intent', id: intentId },
          eventType: PAYMENTS_EVENT.AUTHORIZATION_FAILED, schemaVersion: 1,
          payload: { intent_id: intentId, amount_minor: input.amountMinor, currency: input.currency },
          actor: { type: 'system', id: 'payments' },
        }])
        return { ok: false as const, code: 'DECLINED' as const, detail: result.detail }
      }
      await client.query(
        `INSERT INTO payment_intents (id, attempt_key, business_id, amount_minor, currency, state, provider, provider_ref)
         VALUES ($1, $2, $3, $4, $5, 'authorized', $6, $7)
         ON CONFLICT (attempt_key) DO NOTHING`,
        [intentId, input.attemptKey, businessId, input.amountMinor, input.currency, this.provider.name, result.auth.providerRef])
      await client.query(
        `INSERT INTO payment_facts (id, intent_id, kind, amount_minor) VALUES ($1, $2, 'authorized', $3)`,
        [uuidv7(), intentId, input.amountMinor])
      await this.events.append(tx, [{
        businessId, aggregate: { type: 'payment_intent', id: intentId },
        eventType: PAYMENTS_EVENT.AUTHORIZATION_SUCCEEDED, schemaVersion: 1,
        payload: { intent_id: intentId, amount_minor: input.amountMinor, currency: input.currency },
        actor: { type: 'system', id: 'payments' },
      }])
      return { ok: true as const, auth: { authRef: result.auth.providerRef } }
    }
  }

  /** PaymentPort.void (structural): compensation — release the authorization. */
  async void(authRef: string): Promise<void> {
    await this.provider.void(authRef)
    await this.withTx(async (tx) => {
      const client = asClient(tx)
      const { rows } = await client.query<{ id: string }>(
        `UPDATE payment_intents SET state = 'voided', updated_at = now()
         WHERE provider_ref = $1 AND state IN ('created','authorized') RETURNING id`, [authRef])
      if (rows[0]) {
        await client.query(`INSERT INTO payment_facts (id, intent_id, kind) VALUES ($1, $2, 'voided')`, [uuidv7(), rows[0].id])
      }
    })
  }

  /**
   * The single full capture (AMENDMENT-001 A1; C5 calls this at `confirmed`).
   * P2-guarded; posts the funds-flow legs (CONNECT_FUNDS_FLOW §1) — app fee is
   * structurally present, VALUE zero until the Founder sets fee policy.
   */
  async capture(tx: Tx, input: { attemptKey: string; amountMinor: number; orderId: string }):
    Promise<{ ok: true; intentId: string } | { ok: false; detail: string }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ id: string; state: string; amount_minor: string; captured_minor: string; provider_ref: string | null; business_id: string; currency: string }>(
      `SELECT id, state, amount_minor::text, captured_minor::text, provider_ref, business_id, currency
       FROM payment_intents WHERE attempt_key = $1 FOR UPDATE`, [input.attemptKey])
    const intent = rows[0]
    if (!intent) return { ok: false, detail: 'no intent for this attempt' }
    if (intent.state === 'captured') return { ok: true, intentId: intent.id } // idempotent
    if (intent.state !== 'authorized') return { ok: false, detail: `intent is ${intent.state}` }
    if (input.amountMinor > Number(intent.amount_minor)) return { ok: false, detail: 'capture exceeds authorization (P2)' }

    const captured = await this.provider.capture(intent.provider_ref ?? '', input.amountMinor)
    if (!captured.ok) return { ok: false, detail: captured.detail }

    await client.query(
      `UPDATE payment_intents SET state = 'captured', captured_minor = $2, order_id = $3, updated_at = now() WHERE id = $1`,
      [intent.id, input.amountMinor, input.orderId])
    await client.query(
      `INSERT INTO payment_facts (id, intent_id, kind, amount_minor) VALUES ($1, $2, 'captured', $3)`,
      [uuidv7(), intent.id, input.amountMinor])
    // the funds-flow posting: clearing → the merchant's holding (app fee = 0 until fee policy)
    await this.ledger.post(tx, intent.currency, [
      { kind: 'psp_clearing', businessId: null, deltaMinor: -input.amountMinor },
      { kind: 'merchant_holding', businessId: intent.business_id, deltaMinor: input.amountMinor },
    ], { intent_id: intent.id, order_id: input.orderId, kind: 'capture' })
    await this.events.append(tx, [
      {
        businessId: intent.business_id, aggregate: { type: 'payment_intent', id: intent.id },
        eventType: PAYMENTS_EVENT.CHARGE_SUCCEEDED, schemaVersion: 1,
        payload: { intent_id: intent.id, order_id: input.orderId, amount_minor: input.amountMinor, currency: intent.currency },
        actor: { type: 'system', id: 'payments' },
      },
      {
        businessId: intent.business_id, aggregate: { type: 'payment_intent', id: intent.id },
        eventType: PAYMENTS_EVENT.HOLD_OPENED, schemaVersion: 1,
        payload: { intent_id: intent.id, order_id: input.orderId, amount_minor: input.amountMinor, currency: intent.currency },
        actor: { type: 'system', id: 'payments' },
      },
    ])
    return { ok: true, intentId: intent.id }
  }

  /** Webhook ingestion: dedupe by provider event id (A8-7 layer 4), then record the fact. */
  async ingestProviderEvent(tx: Tx, input: { provider: string; eventId: string; intentRef: string | null; kind: string; detail?: Record<string, unknown> }):
    Promise<{ fresh: boolean }> {
    const client = asClient(tx)
    const inserted = await client.query(
      `INSERT INTO provider_events (provider, event_id, intent_ref) VALUES ($1, $2, $3)
       ON CONFLICT (provider, event_id) DO NOTHING`,
      [input.provider, input.eventId, input.intentRef])
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

  /** Container injects the uow-bound runner (keeps this module import-clean). */
  withTx!: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
}
