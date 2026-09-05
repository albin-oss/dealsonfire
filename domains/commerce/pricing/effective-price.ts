/**
 * EP-1 — the Effective Price Foundation (ADR-002 §8, D2-7): ONE authoritative answer to
 * "what does this item cost right now?", used by storefront reads, merchant preview, and
 * checkout so display and charge can never diverge. It resolves EXISTING truth only —
 * base → active (window-checked) sale — and marks where CS4 Offers will later plug in.
 * It owns merchandise unit price ONLY: shipping, tax, fees, refunds are downstream.
 *
 * Money law inherited unchanged (shared-kernel/price.ts): integer minor units, never floats,
 * currency carried by value. Time is always an explicit parameter — never sampled here — so
 * results are deterministic and replayable (the seam future schedules/offers need).
 *
 * Two representations, ONE rule:
 *   • resolveEffectivePrice() — the TS domain service, per-line, called on the CHARGE path
 *     (cart, checkout). This is the socket: a future Offer applies AFTER the sale step here,
 *     and no consumer has to learn how discounts work.
 *   • effectivePriceSql() — the canonical SQL projection of the same rule, for the batch
 *     DISPLAY reads (feeds, search, shelves) that must resolve many rows in one query.
 * A drift-guard test asserts the two agree across the window matrix.
 */

/** A sale window as stored on product_variants (all-or-none; the DB CHECK guarantees the trio). */
export interface SaleWindow {
  amount: number // minor units, same currency as base
  startsAt: Date
  endsAt: Date
}

export interface EffectivePriceInput {
  baseUnitAmount: number // product_variants.price_amount (minor units)
  currency: string // product_variants.price_currency (ISO-4217 shape)
  sale: SaleWindow | null
  /** Evaluation instant — the quote time on the charge path; "now" for live display. */
  at: Date
  /** Reserved seam for future quantity-based offers (CS4); EP-1 never varies unit price by it. */
  quantity?: number
}

export type AppliedAdjustment =
  | { kind: 'none' }
  | { kind: 'sale'; fromMinor: number; toMinor: number }
// FUTURE (CS4): | { kind: 'offer'; offerId: string; fromMinor: number; toMinor: number }

export interface EffectivePrice {
  currency: string
  baseUnitAmount: number
  effectiveUnitAmount: number
  onSale: boolean
  appliedAdjustment: AppliedAdjustment
  /** Human-readable, ephemeral — never persisted; the seam Deals/Coupons will extend. */
  explanation: string
}

/**
 * Is a sale live at `at`? Matches Variant.effectiveAmount exactly: at ∈ [startsAt, endsAt).
 */
function saleActive(sale: SaleWindow | null, at: Date): sale is SaleWindow {
  return sale !== null && at >= sale.startsAt && at < sale.endsAt
}

export function resolveEffectivePrice(input: EffectivePriceInput): EffectivePrice {
  const base = input.baseUnitAmount
  // — base —
  let effective = base
  let adjustment: AppliedAdjustment = { kind: 'none' }

  // — active (window-checked) sale —
  if (saleActive(input.sale, input.at) && input.sale.amount < base) {
    effective = input.sale.amount
    adjustment = { kind: 'sale', fromMinor: base, toMinor: input.sale.amount }
  }

  // — OFFER INSERTION POINT (CS4) —
  // A future EffectivePriceService will apply applicable Offers here, AFTER the sale step
  // and against `effective`, per ADR-002 §8 precedence (base → sale/schedule → offers) and
  // the StackingPolicy. No consumer of this service changes when that lands: they still ask
  // only "what is the effective price?" and read appliedAdjustment/explanation.

  return {
    currency: input.currency,
    baseUnitAmount: base,
    effectiveUnitAmount: effective,
    onSale: adjustment.kind === 'sale',
    appliedAdjustment: adjustment,
    explanation:
      adjustment.kind === 'sale'
        ? `On sale: ${effective} (was ${base}) ${input.currency}`
        : `${base} ${input.currency}`,
  }
}

/**
 * The canonical SQL projection of the same rule, for batch display reads. Pass the
 * `product_variants` alias and the SQL expression for the evaluation instant (default now()).
 * Returns a scalar SQL expression yielding the effective unit amount in minor units.
 * MUST stay equivalent to resolveEffectivePrice — the drift-guard test enforces it.
 */
export function effectivePriceSql(variantAlias = 'v', nowExpr = 'now()'): string {
  const a = variantAlias
  return `(CASE WHEN ${a}.sale_amount IS NOT NULL AND ${a}.sale_amount < ${a}.price_amount `
    + `AND ${a}.sale_starts_at <= ${nowExpr} AND ${a}.sale_ends_at > ${nowExpr} `
    + `THEN ${a}.sale_amount ELSE ${a}.price_amount END)`
}
