/**
 * The provider seam (C4→C10; ADR-008 §6 ACL): the ONE port every payment
 * provider implements, its deterministic sandbox twin (test law), and the
 * Stripe adapter (SDK-pinned). Split from payments.ts in C11 S1 — motion only,
 * no behavior change; payments.ts re-exports for existing import sites.
 */
import Stripe from 'stripe'

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
  /** C11: pay the maker's bank from THEIR connected balance (the funds landed
   *  there via destination transfers). Idempotent per key; `retryable` marks
   *  infrastructure/insufficient-balance waits the driver may retry. */
  payout(input: { accountId: string; amountMinor: number; currency: string; idempotencyKey: string }):
    Promise<{ ok: true; payoutId: string } | { ok: false; retryable?: boolean; rotateKey?: boolean; detail: string }>
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
  /** C11 payout twin: deterministic like everything else — the magic amount waits
   *  once per key (insufficient-balance parity with real rails), then pays. */
  private readonly payoutWaitedOnce = new Set<string>()
  private readonly payouts = new Map<string, string>() // idempotencyKey → payoutId
  async payout(input: { accountId: string; amountMinor: number; currency: string; idempotencyKey: string }) {
    const existing = this.payouts.get(input.idempotencyKey)
    if (existing) return { ok: true as const, payoutId: existing }
    // the wait is keyed by the LOGICAL payout (account + amount), never the
    // idempotency key — real rails rotate the key after a definitive decline
    // (Stripe caches the refusal against it), so the retry arrives renamed
    const logical = `${input.accountId}:${input.amountMinor}`
    if (input.amountMinor === SANDBOX_REFUND_FAIL_AMOUNT_MINOR && !this.payoutWaitedOnce.has(logical)) {
      this.payoutWaitedOnce.add(logical)
      return { ok: false as const, retryable: true, rotateKey: true, detail: 'Connected balance not yet available (sandbox injection — transient).' }
    }
    const payoutId = `sandbox-po-${input.idempotencyKey.slice(-12)}`
    this.payouts.set(input.idempotencyKey, payoutId)
    this.recordTxn('payout', -input.amountMinor, payoutId)
    return { ok: true as const, payoutId }
  }
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
      // C11 CERTIFICATION FINDING (currency-alignment law): Stripe settles the
      // maker's balance in their account's home currency and can only pay out
      // currencies their bank holds. DOF's shop truth is EUR — a 'ca' account
      // (C10's cert-environment artifact) settles CAD and can NEVER pay the EUR
      // payable; the payout would refuse forever (loud: payout_stuck alarms).
      // Makers are born in the shop's settlement country. Multi-market = the
      // maker's own country becomes data, recorded as debt, not guessed here.
      identity: { country: 'be' },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
      metadata: { dof_business_id: input.businessId },
    } as never)
    // C11 CERTIFICATION FINDING: v2 creation silently drops the payout schedule —
    // Stripe's default DAILY payouts would bypass DOF's eligibility law (payout
    // timing is OURS, on fulfillment evidence). v1 updates work on v2 accounts:
    // set MANUAL immediately, same boundary call, before the account is ever used.
    await this.stripe.accounts.update(account.id, {
      settings: { payouts: { schedule: { interval: 'manual' } } },
    })
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

  /** C11: a payout ON the connected account (the maker's funds live there via
   *  destination transfers; DOF's ledger decides WHEN, per the eligibility law).
   *  Insufficient available balance is a WAIT, not a failure — retryable. */
  async payout(input: { accountId: string; amountMinor: number; currency: string; idempotencyKey: string }) {
    try {
      const payout = await this.stripe.payouts.create(
        { amount: input.amountMinor, currency: input.currency.toLowerCase() },
        { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey })
      return { ok: true as const, payoutId: payout.id }
    } catch (error) {
      const e = error as Stripe.errors.StripeError
      // C11 LIVE-CERTIFICATION FINDING: Stripe caches a payout request's RESULT
      // against its idempotency key for 24h — including balance_insufficient.
      // A same-key retry replays the cached refusal even after funds arrive,
      // wedging the WAIT for a day. A definitive decline proves nothing was
      // created, so rotating the key for the next attempt is exactly-once safe;
      // ambiguous failures (network/5xx) keep the stable key so a replay can
      // discover a crashed-after-create success (§7).
      const definitiveDecline = e.code === 'balance_insufficient'
        || e.type === 'StripeIdempotencyError' // key consumed by an earlier shape — renamed retry is the recovery
      const retryable = ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'].includes(e.type ?? '')
        || definitiveDecline
      return { ok: false as const, retryable, rotateKey: definitiveDecline, detail: e.message ?? 'The payout could not be created.' }
    }
  }
}
