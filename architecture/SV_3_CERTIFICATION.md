# SV-3 CERTIFICATION — The Maker Runs Their Store

**Program:** Store v1 Completion · **Increment:** SV-3 (Inventory / Shipping / Returns) · **Branch:** `increment/sv-3-run-store` · **Date:** 2026-09-04
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## Pre-build operational audit — what actually existed
- **Inventory:** a production-grade, race-safe reservation/oversell engine (append-only `stock_ledger` → cached `stock_items.on_hand`; `available = on_hand − active reservations`; per-variant; checkout reserve w/ TTL; cancellation restore; return restock, idempotent). **The merchant write side was greenfield** — no read endpoint, no adjust command, stock rows were never even created (so every variant was untracked/infinite), and `catalog.inventory.write` guarded nothing. UI a stub.
- **Shipping:** the per-store `shipping_profiles` (handling/flat-rate/free-over/pickup) + PUT/GET were REAL and checkout-enforced (proven); fulfillment (pack/dispatch/tracking/partial/pickup) REAL with a rich UI already in `orders.vue`. UI a stub. ABSENT (not built): ship-from, zones, named methods, carrier config, delivery estimates.
- **Returns:** a REAL four-state machine (`requested→authorized→resolved`/`declined`), one decision endpoint, refund only at resolve (separate/idempotent/ledger-correct), restock only at resolve+`disposition=restock` (idempotent), single 30-day constant, C12 letters — but **no merchant returns *list*** (only open cases embedded in `/orders`). UI a stub.
- **Enforcement hold** was never surfaced to the merchant (confirmed Phase-2 gap).

## Capability matrix (post-SV-3)
INVENTORY — on-hand REAL·available REAL(derived)·reserved REAL(derived)·variant-level REAL·tracking-on **now REAL (adjust)**·oversell REAL·checkout-reservation REAL·release/restore REAL·restock REAL·**manual adjustment now REAL**·**adjustment reason/audit now REAL**·low-stock ABSENT(deferred)·concurrency REAL. SHIPPING — profile/rate/free-over/threshold/handling/pickup REAL·checkout-consistency REAL·fulfillment/dispatch/partial/tracking REAL·ship-from/zones/methods/carrier/delivery-estimate ABSENT(deferred). RETURNS — eligibility/window/request/authorize/decline/resolve/refund/restock/reason/buyer-status REAL·**merchant queue now REAL**·settled-payout clawback ABSENT(by design → `negative_payable` alarm)·per-role refund gate ABSENT(watch-trigger).

## PE verdict — KEEP / REUSE / MERGE / REMOVE / DEFER
- **KEEP (small seams):** inventory adjust command (`adjustStock`) + read (`listInventoryForBusiness`); merchant returns-list read (`listByBusiness`); the `StoreHoldNotice`.
- **REUSE:** the shipping PUT (UI only); the return-decision endpoint (actions unchanged); the whole reservation/refund/restock engine; the ghost-location seam for the stock item; `DofNumberInput`/`DofStatus`/`DofMoney`/`ul`-of-cards.
- **MERGE:** `/store`'s shipping editor → a summary + door into `/shipping` (ONE shipping truth).
- **REMOVE from scope:** ship-from, zones, methods, carrier config, delivery-date, delivery mail, low-stock thresholds, any new return states, and any change to the refund/authorization money laws (recorded as watch-triggers).
- **DEFER:** everything in the directive's Section-36 forbidden list.
- **Schema delta: ZERO migrations.** **Events: none added.**

## Inventory source-of-truth law
The one authoritative quantity is `stock_items.on_hand` (the cached sum of the append-only `stock_ledger`). The merchant-facing number is `available = on_hand − active-unexpired reservations` (floored at 0), null when untracked (always sellable). The UI holds no stock model — it reads and writes only this truth.

## Inventory adjustment behavior
`POST /api/v1/inventory/:variantId` — `mode:'set'` (a stocktake, ledger reason `counted`) or `mode:'delta'` (±n, reason `adjusted`), reason-coded on the ledger with the acting merchant, under the same `FOR UPDATE` row lock as reserving. First touch creates the stock item at the business's ghost location and flips it to `tracked` (turning tracking on). Guard: the new on-hand may never be set below units held by in-progress checkouts — so on-hand always covers its reservations and a later commit can never breach `on_hand ≥ 0`. Below-zero refused. Gated by `catalog.inventory.write` (owner/manager/staff — not support/AI); cross-business writes masked; audited.

## Concurrency & the money-adjacent proofs (`[AUTOMATED]`)
- Set-to-1 then two concurrent reserves → exactly one wins (the merchant's number is the real ceiling; oversell law intact).
- Set below in-flight reservations → refused, nothing changed; setting to exactly the held floor allowed.
- Below-zero delta → refused (409), unchanged.
- Repeated identical set → converges, one ledger row (delta-0 no-op), no duplicate.
- Cancellation restore / return restock idempotency — unchanged, still proven by the existing suites.

## Shipping — one truth, buyer-consistent
`/shipping` binds the four real fields to the existing `operations.shipping.profile` PUT — the same profile checkout charges and the public storefront shows. `/store` keeps a read-only summary + a "Manage shipping" door (no second settings system). The "What buyers see" block is derived live from those numbers plus the 30-day returns constant — the merchant sees exactly what they promise. Fulfillment/tracking stays on the order (`orders.vue`); Shipping owns configuration only.

## Returns — a projection of the state machine, money laws untouched
`/returns` is a queue over `listByBusiness` (all four states, newest first): needs-response / on-the-way-back / done. It does **not** re-implement the decision buttons — authorize/decline/resolve live on the order; each case doors there. Refund (only at resolve, separate/idempotent/ledger-correct, proportional fee reversal), restock (only at resolve+restock, idempotent), and the single 30-day law are entirely unchanged by SV-3. Minimum disclosure: the queue carries reason/tracking/refund/line-count — never buyer name/address/email/comment (`[AUTOMATED]`).

## Lifecycle & enforcement interaction (Section 21)
Public visibility and operational responsibility are separate. A held store shows the honest `StoreHoldNotice` (public selling paused; existing orders/payouts/returns unaffected — keep fulfilling; no abuse internals; no money-frozen implication) **and its operational screens keep working** — inventory is still manageable under a hold (browser-shown). No settings/operational command mutates lifecycle or enforcement state.

## RBAC / privacy / performance
RBAC: inventory adjust → `catalog.inventory.write`; inventory/returns reads → business membership; returns actions keep their existing gating (recorded watch-trigger: refund has no step-up/role gate today — a deliberate no-change, money laws untouched). Privacy: the new list surfaces expose no buyer PII (minimum disclosure). Performance: reads are single bounded joins (inventory catalog+stock, returns one table); the adjust is one `FOR UPDATE` read + ledger insert + update; no N+1; list caps at 200/100 with keyset paging recorded as a scale seam.

## Hostile matrices — 11/11 `[AUTOMATED]`
Inventory: untracked reads as always-available (not 0) · set turns tracking on with truthful available · ±delta · below-zero refused · reserved-floor guard · cross-tenant read+write masked · repeated set converges (one ledger row) · adjust audited · set-to-1 sells exactly once. Returns: queue lists all states newest-first with no PII · cross-tenant masked. (Refund/restock idempotency & the 30-day law remain proven by the existing returns/reservations suites.)

## Browser demonstration — `[BROWSER]` desktop + mobile
The merchant day was walked as Rosa (dev harness reset again after SV-2's rename drifted the persistent data): Inventory renders → "Track stock" on a variant → set 6 → the row reads "6 available" and re-sorts exception-first; Shipping shows the editor + derived "What buyers see"; Returns shows the calm empty state, then (seeded) a "1 return needs your response" queue card doored to Orders; the enforcement-hold notice renders honestly while inventory stays manageable beneath it; mobile (375px) is a clean single column with status dots + text (never color-only). The oversell→buyer-truth link is `[AUTOMATED]` (the browser file-picker path is the only thing not driven).

## Revised Store v1 completion & remaining
Store v1 moves from **≈82% → ≈93%** (capability). The whole journey — idea → Ignite → create → publish → identity → lifecycle → inventory → shipping → fulfil → return → demand — is now traversable by a non-technical maker. Remaining are **important non-blockers**, not gaps that stop a maker running the store: no proactive low-stock nudge; no buyer "delivered" signal for shipped parcels; refunds lack step-up/role gating; inventory/returns lists are bounded (keyset paging deferred); single ghost-location only; media orphan sweeper unbuilt. See `STORE_V1_CLOSURE.md` for the critical judgment.

**STOP after SV-3 release for Founder review — no next program begun.**
