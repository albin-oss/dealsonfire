# EP-1 CERTIFICATION — One Price, Everywhere

**Program:** Pricing & Offers · **Increment:** EP-1 (Effective Price Foundation) · **Branch:** `increment/ep-1-effective-price` · **Date:** 2026-09-04
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## Current price-truth map
See [CURRENT_PRICE_TRUTH_MAP.md](CURRENT_PRICE_TRUTH_MAP.md). In one line: one authoritative source (`product_variants.price_amount`/`sale_amount`, integer minor units), but before EP-1 the *rule* for "effective price" was copy-pasted across ~20 SQL sites in three behaviors — sale-blind (cards/search/street/SEO), window-aware (product variant list), and **window-blind (cart/checkout — which charged expired/future sales)**.

## Duplicated / drift-prone paths found
~20 `min(price_amount)` fragments (3 variants: `>0`, no-filter, used-as-predicate) plus 4 `COALESCE(sale_amount, price_amount)` charge sites. Concrete pre-EP-1 divergence: a product on sale displayed base on cards, sale on the variant, and had an **expired sale charged** at checkout (O6 violation; ADR-002 D2-7 "zero drift").

## PE verdict — KEEP / REUSE / MERGE / REMOVE / DEFER
- **KEEP (new, one file):** `domains/commerce/pricing/effective-price.ts` — `resolveEffectivePrice()` (TS domain service, the charge socket) + `effectivePriceSql()` (canonical SQL projection for batch display), bound by a drift-guard equivalence test.
- **MERGE:** all ~20 min-price fragments + 4 charge COALESCEs collapse to the one window-aware rule.
- **REUSE:** the `Price`/Money VO, `Variant.effectiveAmount` logic, `DofMoney`, `commerce.variant.price_changed`, and the entire untouched cart-snapshot / checkout-re-resolve / order-snapshot / Stripe / refund / fee / shipping spine.
- **REMOVE / DEFER:** no promotion types, no Offers, no `PriceSchedule` aggregate, no `offers`/`price_schedules` tables, no new events. Offer insertion point marked in code.
- **Schema delta: ZERO. New events: ZERO.**

## Resolver contract
`resolveEffectivePrice({ baseUnitAmount, currency, sale: {amount,startsAt,endsAt}|null, at, quantity? }) → { currency, baseUnitAmount, effectiveUnitAmount, onSale, appliedAdjustment: {kind:'none'|'sale',…}, explanation }`. Merchandise unit price only — shipping/tax/fees/refunds are downstream. `effectivePriceSql(alias, nowExpr)` is the SQL mirror. Domain **service**, not aggregate (ADR-002 §8).

## Laws
- **Authoritative base:** `product_variants.price_amount`/`price_currency` (no product-level price; variant is sole holder). **Money:** integer minor units, floats banned, ISO-4217 shape, one VO.
- **Evaluation time:** always an explicit parameter — checkout resolves every line at ONE captured quote instant; display uses `now()`. No scattered `Date.now()` inside the rule.
- **Precedence:** base → active (window-checked) sale → *[offer insertion point, not built]*.
- **Display == charge:** the same rule resolves both; proven `[AUTOMATED]` + `[BROWSER]`.

## Checkout revalidation & Stripe boundary
Checkout re-resolves each line from the catalog through `resolveEffectivePrice` at quote time; the client cannot submit a price (no field in `cart.schema.ts`/`checkout.schema.ts`). The trusted amount to the provider is the journaled `provider_operations.amount_minor`, derived server-side from the order/quote snapshot (`boundary.ts:72,82`) — never the client. Tamper-proof (unchanged, re-verified).

## Order-history & refund invariants (untouched)
Orders snapshot `unit_price_minor`/subtotal/shipping/total/currency at placement; a later catalog price change does not rewrite them (`[AUTOMATED]`). Refunds derive from `order_lines.unit_price_minor` bounded by the intent's `captured_minor` — never current catalog. Platform fee = `feeFor(captured)`. Shipping composed separately; tax absent.

## Currency
Carried by value from variant → cart → checkout → order → Stripe → ledger; no FX. EP-1 **enforces** the previously-assumed single-currency-per-order law: a cart mixing currencies is refused at checkout (`[AUTOMATED]`).

## The money bug EP-1 fixes
Pre-EP-1, cart/checkout used window-blind `COALESCE(sale_amount, price_amount)`, so an **expired or not-yet-started sale was charged**. EP-1 makes all charge paths window-aware. Proven: active sale charged at sale; expired/future sale charged at base (`[AUTOMATED]` + `[BROWSER]` — an expiring in-cart sale re-quotes to base with an honest notice).

## Hostile matrix (9 `[AUTOMATED]` + inherited)
Active/expired/future/no-sale charge; storefront "from" == charge; expired shows+charges base; order snapshot stable after a base change; mixed-currency cart refused; drift-guard TS≡SQL across the window matrix. Client-tamper, order-snapshot, refund-from-paid, fee, shipping remain proven by the existing checkout/cart/payments/returns suites (untouched).

## Browser walk `[BROWSER]`
Active sale → €13.20 flows identically across storefront card → product headline → cart line → checkout button. Sale expired mid-cart → every surface re-quotes to €22 with "The price changed since you added it — it's now €22" (no silent substitution). Financial edges are additionally `[AUTOMATED]`.

## Future Offer insertion proof (the real success test)
A future Offer applies inside `resolveEffectivePrice` after the sale step (marked `OFFER INSERTION POINT`), and for automatic/SQL-expressible offers inside `effectivePriceSql`. Consumers ask only "what is the effective price?" and read `appliedAdjustment`/`explanation` — storefront and checkout pricing code do not change, no second service is created, order history and refunds are not rewritten. CS4 is therefore safe to begin **after** EP-1.

## Security / privacy / performance / a11y
Security: client cannot set price (re-verified); cross-business price writes remain gated by `catalog.product.write`; negative/overflow refused at the VO + DB CHECK. Privacy: no new personal data, no buyer context in the resolver. Performance: display resolves in-SQL (no N+1; the batch seam CER-001 requires); checkout resolves per line in TS at one instant. A11y: prices render only through `DofMoney` (currency-correct); no sale encoded by color alone. Watch-trigger: `productJsonLd` still hardcodes `/100` (0-decimal-currency formatting; DOF is single-currency EUR today).

**STOP after EP-1 release for Founder review — Offers (CS4) analysed, not begun.**
