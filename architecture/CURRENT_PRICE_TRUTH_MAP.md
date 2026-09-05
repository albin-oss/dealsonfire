# CURRENT_PRICE_TRUTH_MAP — DOF merchandise price (EP-1)

Forensic map of every place a merchandise price is determined, derived, displayed, snapshotted, revalidated, or charged — the state **before** EP-1 and the state **after**. Money is integer minor units throughout (`domains/merchant/shared-kernel/price.ts`, the one `Price`/`Money` VO; ISO-4217 shape; floats banned).

## Authoritative source
- **Base price:** `product_variants.price_amount` + `price_currency` (per variant; there is **no** product-level price — a "product price" is `min` over its variants). `sale_amount`/`sale_starts_at`/`sale_ends_at` are a **live** window (DB CHECK: all-or-none, `sale_amount < price_amount`, `starts < ends`).
- **The rule:** effective = active-window sale, else base — `Variant.effectiveAmount(now)` (`domains/commerce/catalog/domain/variant.ts:125`). EP-1 makes this the ONE rule every consumer uses.

## Before EP-1 — three divergent behaviors (the defect)
| Consumer | Source / calc | Sale window? | Drift |
|---|---|---|---|
| product-read-dao shelf/header (`:113,:149,:79`) | `min(price_amount)` | **ignored** | shows base even during a sale |
| product-read-dao variant list (`:178`) | `CASE … sale window` | **honored** | — |
| cart setLine/listForBuyer (`carts.ts:65,:121`) | `COALESCE(sale_amount, price_amount)` | **blind** | **charges expired/future sale** |
| checkout quoteCart (`checkout.ts:268`) | `COALESCE(sale_amount, price_amount)` | **blind** | **charges expired/future sale** |
| public-checkout ceiling (`index.post.ts:57`) | `COALESCE(sale_amount, price_amount)` | **blind** | risk ceiling off |
| search/street/lanes/threads/deals-feed/home/return-journey/sparks/deals (~11 sites) | `min(price_amount)` copy-pasted | **ignored** | ~20 copies, 3 variants |
| SEO `productJsonLd` (`public-seo.ts:69`) | `product.price_minor / 100` | inherits shelf (base) | crawler sees base during sale; `/100` 0-decimal bug |

Net: a product on sale showed up to **three different prices** (base card, sale variant, sale cart) and an **expired sale was charged**.

## After EP-1 — one rule, two representations
- **`domains/commerce/pricing/effective-price.ts`** — `resolveEffectivePrice()` (TS domain service; the CHARGE socket, offer insertion point marked) and `effectivePriceSql()` (canonical SQL projection; batch DISPLAY). A drift-guard integration test proves them equivalent across the window matrix.

| Consumer | Now | Evaluated | Snapshot? | Revalidated? |
|---|---|---|---|---|
| shelf/header/variant list (product-read-dao) | `min(effectivePriceSql())` | read time (`now()`), cached ≤60s | no | — |
| search / street / lanes / threads / deals-feed / home / return-journey / sparks / deals | `effectivePriceSql()` | read time, cached per surface | no | — |
| cart setLine + listForBuyer | `effectivePriceSql()` (re-quote) | read time | display hint only (`price_seen_minor`) | yes, at checkout |
| **checkout quoteCart** | **`resolveEffectivePrice()` per line at ONE quote instant** | quote time | frozen onto order | this IS the authority |
| public-checkout ceiling | `effectivePriceSql()` | request time | no | — |
| SEO `productJsonLd` | inherits the now-sale-aware shelf `price_minor` | read time | no | — |

## Downstream truths (unchanged by EP-1 — verified)
- **Cart** stores `variant_id`+`quantity` + display-hint snapshots only; the client cannot submit a price (`cart.schema.ts`, `checkout.schema.ts` have no price field).
- **Order** snapshots `unit_price_minor`/`subtotal_minor`/`shipping_minor`/`total_minor`/`currency` at placement (`0019_orders_checkout.sql`); reads never re-join catalog for price.
- **Stripe** amount = the journaled `provider_operations.amount_minor`, derived from the order/quote snapshot server-side (`boundary.ts:72,82`) — never the client.
- **Refund** basis = `order_lines.unit_price_minor` (historical) bounded by the intent's `captured_minor` — never current catalog.
- **Platform fee** = `feeFor(captured amount)` — one function, captured amount only.
- **Shipping** composed separately (`subtotal + shipping`), never folded into unit price; **tax** absent (deferred).
- **Currency** carried by value; EP-1 adds the previously-assumed single-currency-per-order guard at checkout.

## Precedence law (recorded; only the built stages exist)
`base → active (window-checked) sale → [OFFER INSERTION POINT — CS4, not built] → effective`. There is exactly one place (`resolveEffectivePrice`) where a future Offer enters; no consumer recomputes discounts.
