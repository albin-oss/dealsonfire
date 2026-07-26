# DOF Commerce Foundation — IMPLEMENTATION_ROADMAP

**Status:** Blueprint for Founder Review · v1.0 · 2026-07-25 · Twelve autonomous increments, 3–5 engineering days each, dependency-ordered. Each is independently production-ready, testable, mergeable, and demoable (the standing increment law). **None begins before Founder approval of this blueprint.**

---

## Sequencing logic

Stock machinery before checkout (the saga needs real reservations to compensate against); sandbox money before real money (the port proves the saga; Stripe proves the port); certainty before merchant surfaces (A7-8); notifications after there are facts worth hearing; policy features (tax port, coupons) after the spine is boring; escrow/payouts last because they ride everything (and legal review gates GA anyway).

| # | Increment | Days | Depends on | Demoable outcome |
|---|---|---|---|---|
| **C1** | **Cart foundation** — `domains/orders/cart` + quartet; server-side carts keyed by `dof_visitor`/user; merge-on-login (claim idiom); add-to-cart on product pages, cart page with re-quoted honest prices; abandonment clock | 4 | — | A visitor fills a cart on the street, signs in on another device, and it's there |
| **C2** | **Reservation machinery live** — audit OPS dark-shipped state (OPS-001B OD-5); StockItem ledger + `ReserveStock/Release/Commit` + TTL expiry job + `reservation.expired`; untracked no-op claims; contract tests from CDC-001 §7 | 4 | — | Concurrent reserve storm on 1 unit: exactly one commit, honest declines, TTL releases |
| **C3** | **Checkout saga + placement** — CheckoutAttempt, quote freeze (Commerce snapshot; flat merchant tax setting inline), the four-move checkout page, place with **SandboxPspAdapter**; order record + timeline; buyer confirmation + guest lookup token; the storm harness (CHECKOUT_STATE_MACHINE §6) | 5 | C1, C2 | A guest buys a product end-to-end (sandbox money); kill-the-server-mid-checkout demo recovers to one order |
| **C4** | **Payments domain + Stripe** — intent + tender legs + ledger + `check:ledger` gate; Stripe adapter (Connect destination charges, hosted fields, webhook pipeline); reconciliation skeleton; swap sandbox port behind the flag | 5 | C3 | Same checkout, real test-mode card + 3DS; ledger shows balanced postings; webhook replay is a no-op |
| **C5** | **Confirmation & the merchant's first sale** — commit-with-race handling (honest re-offer), `confirmed`, the new-order Pulse task, first-sale Signature Moment, buyer order history + timeline page, `payment_failed` retry window | 4 | C4 | The last-unit race on stage: two buyers, one honest re-offer; the merchant's first-sale moment fires |
| **C6** | **Fulfillment & shipping v1** — ShippingProfile/Zone/Rate (flat + free-over + pickup) with Ignite Reveal wiring (OPS-002 gap); `ShippingQuoteQuery` in checkout; FulfillmentCase per (location, method); merchant pack/dispatch flow with manual tracking; line states → `partially_fulfilled/fulfilled`; **capture-on-fulfillment goes live** | 5 | C5 | Merchant packs 2 of 3 lines; buyer timeline says so honestly; card charged only for what shipped |
| **C7** | **Notification seam** — `platform/notifications` + MailPort (sandbox transport in dev); the DOMAIN_EVENTS §5 matrix (buyer receipt, shipped, refund; merchant money moments); merchant-language templates | 3 | C5 | Demo inbox shows the buyer's story told honestly, zero system words |
| **C8** | **Cancellation & refunds** — pre-case one-tap cancel (void, release, instant); post-case per-line request → merchant decision card; goodwill refunds; Refund aggregate execution; timeline + notifications | 4 | C6 | Buyer cancels pre-shipment: money never moved; post-shipment line cancel shows consequence math |
| **C9** | **Returns** — buyer request flow on delivered lines; ReturnCase authorize/receive/inspect; the fair-judge decision card; CDC-001 §2.3 refund choreography; partial returns | 5 | C8 | Full loop on stage: deliver → return 1 of 2 lines → inspect → refund lands, both timelines agree |
| **C10** | **TaxPort** — port extraction of the inline v1 settings (inclusive/flat); finalized tax lines into snapshots; Stripe Tax adapter behind the same port (config-gated, unlaunched) | 3 | C3 | Same totals, now port-shaped; a config flip demos jurisdiction math on test data |
| **C11** | **Coupons & checkout offers** — code-bearing Offers on the ADR-002 substrate (usage limits, windows); code entry at checkout via EffectivePriceService with the explanation trace; stacking law (one code + automatic offers, best-for-buyer) | 4 | C3 | A street deal + a coupon code compose; the review page explains the price honestly |
| **C12** | **Marketplace money hardening** — EscrowPolicy live (trust-gated holds + release sweeps), payout scheduling, dispute aggregate + evidence assembler + deadline tasks, reconciliation hardening (statement ingestion, discrepancy SLA); flash-sale load test; **GA gate: legal/compliance review + PCI SAQ-A attestation (ADR-008 R-c)** | 5 | C4–C9 | Held funds release on verification; a dispute arrives with evidence 80% assembled; the drift alarm demo |

**Total: ~51 engineering days** to a GA-gated, marketplace-grade commerce foundation.

## Increment laws (inherited, restated)

Every increment: audit-first (C2 explicitly audits what OPS dark-shipped) · contract tests before UI on money/stock paths · gated sweep + four reviews (Engineering/Product/Design/Experience) + increment report with Experience Review · additive event names registered before first emission · no increment leaves a compensation unnamed or a failure mode unrendered (honest copy is part of done).

## What could reorder

C7 (notifications) can land any time after C5. C10/C11 are independent of each other. C6 must precede C8's post-case paths but its carrier-adapter tier can trail indefinitely. Nothing else safely reorders: the C1→C5 spine is the dependency chain the sagas stand on.

## Founder checkpoints beyond this gate

Two more natural review points exist inside the sequence: **after C5** (the first real end-to-end sale — pricing/fee policy values must be set before real money) and **before C12 GA** (legal review, fee schedule, payout cadence — business decisions, not engineering ones).
