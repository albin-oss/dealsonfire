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

/** The ONE deterministic decline amount, shared by every sandbox surface (MM-5). */
export const SANDBOX_DECLINE_AMOUNT_MINOR = 66600
/** The twin refuses to REFUND exactly this amount (failure-injection, scenario 8). */
export const SANDBOX_REFUND_FAIL_AMOUNT_MINOR = 66601

// ————————————————————————————————————————————— provider port (ACL — ADR-008 §6)

export interface ProviderAuthorization { providerRef: string }
/** What a provider intent looks like from outside (Slice 2 — the read seam). */
export type ProviderIntentStatus = 'requires_confirmation' | 'authorized' | 'captured' | 'canceled' | 'failed'
/** The connected account's capability snapshot as the provider tells it (Slice 3). */
export interface ProviderAccountState {
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  disabledReason: string | null
}
export interface ProviderPort {
  readonly name: 'sandbox' | 'stripe'
  /** `retryable: true` marks infrastructure failures (network, 5xx) — the boundary
   *  retries those; a decline is FINAL and settles as the operation's outcome.
   *  `ok: 'requires_confirmation'` = the intent EXISTS but the BUYER's browser must
   *  confirm it (Payment Element) — authorization arrives via webhook or return.
   *  `destinationAccount` makes it a DESTINATION charge (CONNECT_FUNDS_FLOW §1). */
  authorize(input: { attemptKey: string; amountMinor: number; currency: string; destinationAccount?: string | null }):
    Promise<
      | { ok: true; auth: ProviderAuthorization }
      | { ok: 'requires_confirmation'; providerRef: string }
      | { ok: false; retryable?: boolean; detail: string }>
  /** Read-only provider truth (client-return convergence + client_secret handoff). */
  readIntent(providerRef: string): Promise<{ status: ProviderIntentStatus; clientSecret: string | null }>
  /** `applicationFeeMinor` joins at capture (fee policy on the CAPTURED amount). */
  capture(providerRef: string, amountMinor: number, applicationFeeMinor?: number): Promise<{ ok: true } | { ok: false; detail: string }>
  void(providerRef: string): Promise<void>
  /** C6 (keystone enforcement): money back — idempotent per (intent, cause). */
  refund(providerRef: string, amountMinor: number, idempotencyKey: string): Promise<{ ok: true } | { ok: false; detail: string }>
  // ——— Connect (Slice 3): the bank teller's window — Stripe asks the legal
  // questions; DOF never sees the papers. All three are network calls (G2 applies).
  createConnectedAccount(input: { businessId: string; email: string | null }): Promise<{ accountId: string }>
  createOnboardingLink(accountId: string, urls: { refreshUrl: string; returnUrl: string }): Promise<{ url: string }>
  readAccount(accountId: string): Promise<ProviderAccountState>
  /** Slice 4 (RM-H1): the provider's own money movements since a watermark —
   *  external reconciliation's raw material. */
  listBalanceTransactions(sinceIso: string, limit: number): Promise<ProviderBalanceTxn[]>
}

/** One provider-side money movement, as reconciliation sees it (Slice 4). */
export interface ProviderBalanceTxn {
  id: string
  kind: 'charge' | 'refund' | 'payout' | 'fee' | 'transfer' | 'other'
  amountMinor: number
  currency: string
  occurredAt: string
  /** the intent's provider ref where the provider knows it (charge/refund) */
  sourceRef: string | null
}

/** One journaled provider operation (UPDATED_PAYMENT_LIFECYCLE §7 phase 1 row). */
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

/**
 * Deterministic twin (test law): declines SANDBOX_DECLINE_AMOUNT_MINOR, nothing
 * else. With `clientConfirmation` on (NUXT_SANDBOX_CLIENT_CONFIRMATION=1) it
 * mirrors the Element flow: authorize births an unconfirmed intent; the BUYER
 * (a test, or the dev sandbox-confirm endpoint) confirms it; reads tell truth.
 */
export class SandboxProviderTwin implements ProviderPort {
  readonly name = 'sandbox' as const
  private readonly confirmed = new Map<string, 'authorized' | 'failed'>()
  private readonly voided = new Set<string>()
  constructor(
    private readonly declineAmounts: number[] = [SANDBOX_DECLINE_AMOUNT_MINOR],
    private readonly clientConfirmation = false,
  ) {}
  async authorize(input: { attemptKey: string; amountMinor: number; currency: string; destinationAccount?: string | null }) {
    if (this.clientConfirmation) {
      return { ok: 'requires_confirmation' as const, providerRef: `sandbox-pi-${input.attemptKey}` }
    }
    if (this.declineAmounts.includes(input.amountMinor)) {
      return { ok: false as const, detail: 'The payment method declined.' }
    }
    return { ok: true as const, auth: { providerRef: `sandbox-pi-${input.attemptKey}` } }
  }
  /** The buyer's browser, played by a test or the dev endpoint. */
  confirmClientSide(providerRef: string, outcome: 'authorized' | 'failed' = 'authorized'): void {
    this.confirmed.set(providerRef, outcome)
  }
  async readIntent(providerRef: string) {
    if (this.voided.has(providerRef)) return { status: 'canceled' as const, clientSecret: null }
    const c = this.confirmed.get(providerRef)
    if (c === 'authorized') return { status: 'authorized' as const, clientSecret: null }
    if (c === 'failed') return { status: 'failed' as const, clientSecret: null }
    if (this.clientConfirmation) return { status: 'requires_confirmation' as const, clientSecret: `sandbox-cs-${providerRef}` }
    return { status: 'authorized' as const, clientSecret: null }
  }
  async capture(ref: string, amount: number, _feeMinor?: number) {
    this.recordTxn('charge', amount, ref)
    return { ok: true as const }
  }
  async void(ref: string): Promise<void> { this.voided.add(ref) }

  // ——— reconciliation twin (Slice 4): the twin REMEMBERS its own money moves,
  // so reconciliation can prove matching against a truthful outside record
  private readonly balanceTxns: ProviderBalanceTxn[] = []
  private txnSeq = 0
  private recordTxn(kind: ProviderBalanceTxn['kind'], amountMinor: number, sourceRef: string | null): void {
    this.txnSeq += 1
    this.balanceTxns.push({
      id: `sandbox-txn-${this.txnSeq}-${sourceRef ?? 'x'}`,
      kind, amountMinor, currency: 'EUR', occurredAt: new Date().toISOString(), sourceRef,
    })
  }
  /** Test hook: a movement OUR books know nothing about (the unmatched case). */
  injectRogueTransaction(amountMinor: number): void { this.recordTxn('other', amountMinor, null) }
  /** Test hook: the twin's memory resets with the database (truncateAll's partner). */
  resetRecordedTransactions(): void { this.balanceTxns.length = 0 }
  async listBalanceTransactions(sinceIso: string, limit: number): Promise<ProviderBalanceTxn[]> {
    return this.balanceTxns.filter((t) => t.occurredAt > sinceIso).slice(0, limit)
  }

  // ——— Connect twin (Slice 3): onboarding completes the moment the link is
  // walked (the return URL IS the walk); tests stage restriction explicitly.
  private readonly accounts = new Map<string, ProviderAccountState>()
  async createConnectedAccount(input: { businessId: string; email: string | null }) {
    const accountId = `sandbox-acct-${input.businessId.slice(-12)}`
    if (!this.accounts.has(accountId)) {
      this.accounts.set(accountId, { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, disabledReason: 'onboarding not finished' })
    }
    return { accountId }
  }
  async createOnboardingLink(accountId: string, urls: { refreshUrl: string; returnUrl: string }) {
    // walking the sandbox link "completes" onboarding — the return sync reads it
    this.accounts.set(accountId, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, disabledReason: null })
    return { url: urls.returnUrl }
  }
  async readAccount(accountId: string): Promise<ProviderAccountState> {
    return this.accounts.get(accountId)
      ?? { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, disabledReason: 'no such account' }
  }
  /** Test hook: stage restriction/recovery. */
  setAccountState(accountId: string, state: Partial<ProviderAccountState>): void {
    const current = this.accounts.get(accountId)
      ?? { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, disabledReason: null }
    this.accounts.set(accountId, { ...current, ...state })
  }
  /** Scenario 8's injection is TRANSIENT (like a real provider hiccup): the magic
   *  amount refuses each idempotency key ONCE, then succeeds — so tests can prove
   *  the §7 driver's retry convergence instead of an eternal stall. */
  private readonly refusedOnce = new Set<string>()
  async refund(ref: string, amount: number, key: string) {
    if (amount === SANDBOX_REFUND_FAIL_AMOUNT_MINOR && !this.refusedOnce.has(key)) {
      this.refusedOnce.add(key)
      return { ok: false as const, detail: 'The provider refused this refund (sandbox injection — transient).' }
    }
    this.recordTxn('refund', -amount, ref)
    return { ok: true as const }
  }
}

/**
 * Stripe adapter — manual-capture PaymentIntents under per-operation idempotency
 * keys (A8-7 layer 3). Card data never transits DOF (SAQ-A): confirmation happens
 * with provider-side test/hosted instruments; this server-side adapter only
 * creates, captures, and cancels intents by token.
 */
/**
 * Refund flags derive from the charge's ACTUAL shape (RM-C4): `reverse_transfer`
 * is only legal when the charge carried a transfer (destination charge), and
 * `refund_application_fee` only when it carried an application fee. Sending
 * either against a plain charge is a Stripe error — which would have broken
 * every real refund (keystone, cancellation, return) on day one.
 */
export function refundFlagsFor(charge: { transfer?: unknown; application_fee?: unknown } | null | undefined):
  { reverse_transfer: boolean; refund_application_fee: boolean } {
  return {
    reverse_transfer: Boolean(charge?.transfer),
    refund_application_fee: Boolean(charge?.application_fee),
  }
}

/** RM-M5 tripwire: a webhook arriving under a different API version than the pin. */
export function apiVersionMismatch(eventApiVersion: string | null | undefined): boolean {
  return Boolean(eventApiVersion) && eventApiVersion !== STRIPE_PINNED_API_VERSION
}

export class StripeProviderAdapter implements ProviderPort {
  readonly name = 'stripe' as const
  private readonly stripe: Stripe
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: STRIPE_PINNED_API_VERSION as Stripe.LatestApiVersion })
  }
  async authorize(input: { attemptKey: string; amountMinor: number; currency: string; destinationAccount?: string | null }) {
    try {
      // Slice 2: the intent is BORN UNCONFIRMED — the buyer's browser confirms it
      // in the Payment Element (SAQ-A: card data never transits DOF). Cards only
      // at launch (allow_redirects never); 3DS runs in-context via next_action.
      const intent = await this.stripe.paymentIntents.create({
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        capture_method: 'manual',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        // Slice 3: a DESTINATION charge — the funds route to the maker's
        // connected account; the app fee joins at capture (fee-on-captured policy)
        ...(input.destinationAccount ? { transfer_data: { destination: input.destinationAccount } } : {}),
      }, { idempotencyKey: `${input.attemptKey}:intent` })
      return { ok: 'requires_confirmation' as const, providerRef: intent.id }
    } catch (error) {
      const e = error as Stripe.errors.StripeError
      // network/5xx/ratelimit are the provider being unreachable, not an answer —
      // the boundary retries those under the same idempotency key (§7)
      const retryable = ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'].includes(e.type ?? '')
      return { ok: false as const, retryable, detail: e.message ?? 'The payment could not be authorized.' }
    }
  }
  async readIntent(providerRef: string) {
    const intent = await this.stripe.paymentIntents.retrieve(providerRef)
    const status: ProviderIntentStatus =
      intent.status === 'requires_capture' ? 'authorized'
      : intent.status === 'succeeded' ? 'captured'
      : intent.status === 'canceled' ? 'canceled'
      : 'requires_confirmation' // requires_payment_method / requires_confirmation / requires_action / processing
    return { status, clientSecret: intent.client_secret ?? null }
  }

  // ——— Connect (Slice 3, v2 as-certified): express dashboard + HOSTED onboarding
  // only — no KYC data ever transits DOF (privacy posture + SAQ-A preserved).
  // CERTIFICATION FINDING: accounts newly enabling Connect are Accounts-v2-only
  // (v1 create refused); v1 READS and account links still work on v2 accounts,
  // so only creation speaks v2. Responsibilities: the PLATFORM collects fees and
  // bears losses (classic express — matches the approved dispute-loss policy).
  async createConnectedAccount(input: { businessId: string; email: string | null }) {
    const account = await this.stripe.v2.core.accounts.create({
      display_name: `DOF maker ${input.businessId.slice(-8)}`,
      contact_email: input.email ?? `no-reply+${input.businessId.slice(-8)}@dof.example`,
      dashboard: 'express',
      identity: { country: 'ca' },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
      metadata: { dof_business_id: input.businessId },
    } as never)
    return { accountId: account.id }
  }
  async createOnboardingLink(accountId: string, urls: { refreshUrl: string; returnUrl: string }) {
    const link = await this.stripe.accountLinks.create({
      account: accountId, type: 'account_onboarding',
      refresh_url: urls.refreshUrl, return_url: urls.returnUrl,
    })
    return { url: link.url }
  }
  async readAccount(accountId: string): Promise<ProviderAccountState> {
    const account = await this.stripe.accounts.retrieve(accountId)
    return {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      disabledReason: account.requirements?.disabled_reason ?? null,
    }
  }

  /** Slice 4 (RM-H1): Stripe's balance transactions with sources expanded so
   *  charges and refunds carry their PaymentIntent ref for matching.
   *  CERTIFICATION FINDING (cross-currency): balance transactions report in the
   *  SETTLEMENT currency (e.g. CAD for a CAD-based account) while DOF's facts
   *  are PRESENTMENT truth (EUR) — matching therefore uses the expanded
   *  source's amount/currency, falling back to the txn only when no source. */
  async listBalanceTransactions(sinceIso: string, limit: number): Promise<ProviderBalanceTxn[]> {
    const since = Math.floor(new Date(sinceIso).getTime() / 1000)
    const page = await this.stripe.balanceTransactions.list(
      { created: { gt: since }, limit, expand: ['data.source'] })
    return page.data.map((t) => {
      const source = t.source as { id?: string; object?: string; amount?: number; currency?: string; payment_intent?: string | { id: string } } | null
      // a dispute-sourced movement (chargeback withdrawal) matches our DISPUTE
      // record — carry the du_ id; everything else matches facts by intent ref
      const intentRef = source?.object === 'dispute'
        ? source.id ?? null
        : typeof source?.payment_intent === 'object' ? source.payment_intent?.id : source?.payment_intent ?? null
      const kind: ProviderBalanceTxn['kind'] =
        t.type === 'charge' || t.type === 'payment' ? 'charge'
        : t.type === 'refund' || t.type === 'payment_refund' ? 'refund'
        : t.type === 'payout' ? 'payout'
        : t.type === 'stripe_fee' || t.type === 'application_fee' || t.type === 'application_fee_refund' ? 'fee'
        // destination-charge mechanics: the transfer out, its reversal on refund —
        // provider-side funds routing; DOF's truth is the capture/refund ledger legs
        : t.type.startsWith('transfer') ? 'transfer'
        : 'other'
      // presentment truth from the source (charge/refund amounts are presentment);
      // the balance txn's sign carries direction
      const usePresentment = (source?.object === 'charge' || source?.object === 'refund') && typeof source.amount === 'number'
      const amountMinor = usePresentment ? Math.sign(t.amount || 1) * source!.amount! : t.amount
      const currency = usePresentment && source?.currency ? source.currency.toUpperCase() : t.currency.toUpperCase()
      return {
        id: t.id, kind, amountMinor, currency,
        occurredAt: new Date(t.created * 1000).toISOString(), sourceRef: intentRef ?? null,
      }
    })
  }
  async capture(providerRef: string, amountMinor: number, applicationFeeMinor?: number) {
    try {
      await this.stripe.paymentIntents.capture(providerRef,
        {
          amount_to_capture: amountMinor,
          ...(applicationFeeMinor && applicationFeeMinor > 0 ? { application_fee_amount: applicationFeeMinor } : {}),
        },
        { idempotencyKey: `${providerRef}:capture:1` }) // ONE capture — the verified law
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, detail: (error as Stripe.errors.StripeError).message ?? 'The capture failed.' }
    }
  }
  async void(providerRef: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(providerRef).catch(() => { /* already terminal — idempotent enough */ })
  }
  async refund(providerRef: string, amountMinor: number, idempotencyKey: string) {
    try {
      // The flags come from the charge's real shape (RM-C4): reverse_transfer pulls
      // funds back from the connected account only when a transfer exists
      // (CONNECT_FUNDS_FLOW §2); the app-fee refund joins only when a fee was taken.
      const intent = await this.stripe.paymentIntents.retrieve(providerRef, { expand: ['latest_charge'] })
      const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
      await this.stripe.refunds.create(
        { payment_intent: providerRef, amount: amountMinor, ...refundFlagsFor(charge) },
        { idempotencyKey })
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, detail: (error as Stripe.errors.StripeError).message ?? 'The refund failed.' }
    }
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
      // CERTIFICATION FINDING: NULL business_id is DISTINCT under the table's
      // UNIQUE — platform-level legs need the partial index's conflict target,
      // or every posting mints a fresh account and balances fragment.
      const { rows } = leg.businessId === null
        ? await client.query<{ id: string }>(
            `INSERT INTO ledger_accounts (id, kind, business_id, currency)
             VALUES ($1, $2, NULL, $3)
             ON CONFLICT (kind, currency) WHERE business_id IS NULL DO UPDATE SET kind = EXCLUDED.kind
             RETURNING id`,
            [uuidv7(), leg.kind, currency])
        : await client.query<{ id: string }>(
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
    readonly ledger: LedgerPoster,
    private readonly providerName: 'sandbox' | 'stripe' = 'sandbox',
    /** Fee policy (Slice 3): basis points on the CAPTURED amount. VALUE is the
     *  Founder's (NUXT_PLATFORM_FEE_BPS); the structure ships at zero. */
    private readonly feeBps = 0,
    /** Risk limits (Slice 4, approved dispute-loss policy §4): 0 = unlimited. */
    private readonly riskLimits: { maxOpenDisputesMinor: number; maxLossMinor: number } =
      { maxOpenDisputesMinor: 0, maxLossMinor: 0 },
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
