# DOF Platform — RELEASE-001-SPECIFICATION

# Commercial Core (Version 1.0) — the Product ↔ Engineering Contract

**Status:** Accepted · **Version:** 1.0 · **Date:** 2026-07-07
**Authors:** CPO / CTO / VP Eng / Principal Architect / Principal PM / TPM (one pen)
**Binding docs:** Engineering Constitution · Platform & Product Bibles · ADR-001…008 · BLUEPRINT-001…003 · OPS-001-BLUEPRINT · OPS-001B-DESIGN · CDC-001 · UX-BIBLE-001 · DESIGN-SYSTEM-001 · IMPLEMENTATION-ROADMAP-v1.0 · DECISIONS.md.
**Contract rule:** every item below carries an ID. Release 1 is complete when — and only when — every F-item ships, every J-journey passes its AT-test in production configuration, every G-gate is signed, and nothing in §3 (exclusions) leaked in. There is no other definition.

**Release goal (the sentence):** *a real merchant, on production, creates an account → business → store → products, tracks stock, and a real buyer purchases; the merchant fulfills the order and receives real funds.* Release 1 ends at the first real sale — roadmap milestone M5 (M4 is the same journey on staging).

**Scope clarification (per roadmap M4 note):** Release 1 includes a **minimal buyer purchase surface** — product page, cart, checkout, order status — because a sale requires a buyer. The store *builder*, theming, and browsing/discovery remain Release 2/3. "Minimal" is defined exactly in F-SE below.

---

## 1. Included Features (by domain)

### Identity (R1-B1)
**F-ID-1** Email+password and passkey registration/login with sessions (dev-header identity retired from every production path). **F-ID-2** Step-up re-authentication (sensitive-operation protocol, ADR-001 §12.3). **F-ID-3** Guest buyer tokens: order-scoped, expiring, rate-limited (ADR-007 §10). **F-ID-4** Guest→account claim (order history claims on registration — the frozen claim pattern). **F-ID-5** Session revocation ("sign out everywhere").

### Merchant (✅ frozen + completions)
**F-ME-1** ✅ Business/store/handle/BrandKit/staff kernel with triple gate. **F-ME-2** ✅ Capability registry + tiers + standing enforcement. **F-ME-3** Identity-verification case flow wired to a KYC provider (needed for payouts — trust ladder level 2; KYB deferred). **F-ME-4** Verification nudge at payout threshold (frozen policy, now with real money to trigger it).

### Commerce (✅ frozen + completions)
**F-CO-1** ✅ Products, variants, options journey, media slots, archive/restore, atomic PATCH, SKU law (D-31). **F-CO-2** ✅ Listing readiness. **F-CO-3** Price display via availability/quote ports for checkout snapshots (query surface per ADR-007 — no new commands). **F-CO-4** Single currency per store (EUR launch set; see X-7).

### Operations (Batch 1 ✅ + OPS-001B/002/005/006 per blueprints)
**F-OP-1** ✅ Locations + Ghost + step-up close (D-38/D-39 hardened). **F-OP-2** Stock Ledger: per-item tracking enable/disable, adjustments-with-reasons, opening counts, movement biography (OPS-001B-DESIGN; Untracked + Simple postures only — see X-5). **F-OP-3** Availability projection + `GetAvailability` (null = unlimited). **F-OP-4** Reservations (dark-shipped machinery live via Orders: reserve/commit/release/expire per CDC-001). **F-OP-5** Oversell detection → Recovery Journey task (count-clamp + packing-shortfall paths). **F-OP-6** One default shipping profile per store (flat + free-over rates; zones = launch-country only), Ignite-Reveal-written. **F-OP-7** FulfillmentCases: methods `ship` (manual mark-sent + pasted tracking) and `digital` (instant grant); packing run UI. **F-OP-8** Returns: request → authorize (RMA) → receive → inspect → disposition with restock ledger pairs → resolution intent to Payments. **F-OP-9** CSV stock import (set/add, idempotent by content hash).

### Orders (ORD-001/002 per ADR-007)
**F-OR-1** Cart (guest + registered; no reservations; live re-quote). **F-OR-2** Checkout saga: one attempt key end-to-end; reserve → authorize → place; typed compensation on every failure; at most one order per attempt. **F-OR-3** Immutable Order with line snapshots, totals, promise dates, order numbers. **F-OR-4** Lifecycle placed→confirmed→in_fulfillment→(partially_)fulfilled→completed; payment_failed retry window; pre-fulfillment cancellation. **F-OR-5** Append-only timeline (merchant + buyer projections of the same facts). **F-OR-6** Buyer order status page (guest-token or session) with tracking facts. **F-OR-7** Merchant needs-action order list + order detail + per-line partial fulfillment. **F-OR-8** Return initiation (buyer request → Operations case) and refund follow-through on resolution.

### Payments (PAY-001/002 per ADR-008)
**F-PA-1** PSP #1 integration (connected-accounts capable), hosted payment fields (SAQ-A), cards + Apple Pay + Google Pay at launch (see X-8). **F-PA-2** PaymentIntent: authorize at checkout, capture on fulfillment (digital: on grant); per-op idempotency. **F-PA-3** Double-entry ledger with merchant available/held balances + platform fee postings (fee = policy value, launch rate set by Product). **F-PA-4** Escrow: unverified merchants' captures post to `held`; release on identity verification (F-ME-3); the release path always visible. **F-PA-5** Refunds full/partial from cancellation + return resolutions (CDC choreography). **F-PA-6** Payouts: scheduled sweeps to verified merchants' bank via PSP; `blocked` with educating copy otherwise. **F-PA-7** Daily reconciliation batches; discrepancies as loud records. **F-PA-8** Disputes: intake + deadline task + evidence bundle assembly + merchant-signed submission (win/lose posting).

### Store Experience — minimal purchase surface (bounded)
**F-SE-1** ✅ Workspace shell, product management UI foundation, Ignite journey. **F-SE-2** Public storefront: store home (name, BrandKit dress, product grid) + product page (photos when Media lands mid-release — see X-9; title/price/options/availability) + cart + checkout + order-status page. Storefront scope theming only; **no builder, no sections editor**. **F-SE-3** Ignite completion for R1: Reveal writes the real shipping profile + policy texts; product lands as before. **F-SE-4** Merchant mobile usability for the fulfillment loop (pack/mark-sent from a phone).

### Cross-cutting
**F-XC-1** Notification *minimal transport*: transactional email only (order confirmation, shipped, refund, payout) via one provider port — the Notification *domain* remains R4; this is a thin platform service with the calm rules as API. **F-XC-2** First-sale Signature Moment (ceremony on `orders.order.confirmed` — UX-BIBLE §14.3) + launch card (existing). **F-XC-3** Recovery Journey v1: promise-at-risk/oversell → merchant disclosure task with drafted buyer note (R2 signature). **F-XC-4** Production observability: outbox depth, dead letters, reconciliation discrepancy, checkout funnel dashboards + paging.

## 2. Excluded Features (leak = release failure)

**X-1** Marketplace discovery/search/browse · **X-2** Deals/coupons/offers UI (offer schema exists; no surfaces) · **X-3** Sparks/communities/messaging/reviews/following · **X-4** AI copilots (rule-based Ignite journey only; no proposals in Pulse, no ask-bar AI dialect) · **X-5** Managed/Enterprise inventory postures: multi-location UI, transfers, cycle counts, safety stock, barcode, suppliers, PO (ledger supports; surfaces dark) · **X-6** Split payments, gift cards, store credit, multi-tender (single leg law) · **X-7** Multi-currency (EUR only) + international shipping (launch country only) · **X-8** PayPal/Interac/ACH/Shop Pay tenders · **X-9** Store builder/themes beyond BrandKit dress; SEO tooling; custom domains · **X-10** Analytics/Pulse-v2/insights/forecasting (transactional facts visible on orders only) · **X-11** Carrier label purchase (manual tracking paste only) · **X-12** Backorders/pre-orders/service+ticket checkout (physical + digital lines only at checkout; service/ticket products can exist but are not purchasable — enforced and messaged) · **X-13** Custom staff roles; org features · **X-14** Public API/webhooks for third parties.

## 3. Domain Readiness

| Domain | Minimum set (IDs) | Deferred | Expansion points already built |
|---|---|---|---|
| Identity | F-ID-1…5 | social login, 2FA-TOTP, org SSO | claim pattern generalizes; buyer gate class reusable |
| Merchant | F-ME-1…4 | KYB, custom roles, multi-store | ladder levels 3–4; agency principals typing |
| Commerce | F-CO-1…4 | collections UI, offers, taxonomy | option/VO machinery; channel columns |
| Operations | F-OP-1…9 | X-5 set; carrier ACL; local delivery/pickup methods | posture recompute; route kinds; reservation TTL policy |
| Orders | F-OR-1…8 | backorder/pre-order line states; service/ticket methods | timeline fan-in; per-line states; CDC-002 surface |
| Payments | F-PA-1…8 | X-6/X-8 tenders; instant payouts; multi-PSP routing | tender legs; router; connected accounts |
| Store Experience | F-SE-1…4 | builder, themes, SEO, domains | storefront scope + BrandKit runtime proven |

## 4. User Journeys (each maps to acceptance tests §8)

**J-1 Founding:** account → Ignite → business+store+product live (frozen genesis; ≤5 min p75). **J-2 Catalog:** create product with options/variants; archive/restore; SKU conflict educates. **J-3 Inventory on:** near-oversell or intent → enable tracking with opening count → adjust "−2 damaged" → biography readable. **J-4 Purchase (registered):** storefront → cart → checkout → pay → confirmation; merchant task appears at `confirmed`. **J-5 Purchase (guest):** same with guest token + later claim (F-ID-4). **J-6 Last unit race:** two buyers, one unit — exactly one order; the other gets the honest re-offer. **J-7 Fulfillment:** packing run → mark sent + tracking → buyer sees in-transit → delivered → capture completes → `completed` after window. **J-8 Digital purchase:** instant grant; capture on grant; no shipping surfaces anywhere. **J-9 Cancellation:** buyer cancels pre-fulfillment → instant void/refund → stock released. **J-10 Return+refund:** request → RMA → receive → inspect → restock+refund → buyer money back; ledger + timeline consistent. **J-11 Payment failure:** decline → honest retry → success under same attempt (one order); or expiry → auto-cancel + release. **J-12 Money to merchant:** unverified sale → escrow held with visible release path → verify identity (F-ME-3) → release → payout completes to bank. **J-13 Oversell recovery:** count reveals shortfall vs promise → `oversold_detected` → disclosure task → merchant-signed buyer note + resolution. **J-14 Dispute:** chargeback intake → deadline task → evidence submit → outcome posted. **J-15 First-sale moment:** J-4's confirmed order fires the ceremony exactly once.

## 5. Production Gates (all signed before "complete")

**G-1** Every batch through the five-stage discipline with review verdicts resolved (roadmap §3/§5). **G-2** Full CI chain green on the release commit (all structural gates + ~all test suites; zero waivers). **G-3** Security: external pen test (auth, buyer gate, payment boundary, tenant isolation) with zero high findings open; dev-identity provably unreachable in prod (test-enforced). **G-4** PCI SAQ-A attestation with PSP #1; secrets audit. **G-5** Legal/compliance review (ADR-008 R-c) signed. **G-6** Load: checkout race profile (§6 targets under 50× expected alpha load), webhook storm replay, browse-free (storefront product page) profile. **G-7** Observability live (F-XC-4) + on-call rotation + runbooks (payment incident, PSP outage, oversell storm, reconciliation drift). **G-8** DR: backup restore drill ≤ 4h RTO / ≤ 15min RPO demonstrated. **G-9** Data/PII audit vs manifest (retention, redaction) passed. **G-10** Accessibility audit (§7) passed on all merchant + buyer R1 surfaces. **G-11** All §8 acceptance tests green in production configuration (staging mirror) and J-1→J-12 executed once on production with a real card before public availability of the release. **G-12** DECISIONS.md + contract locks current; debt register reviewed with owners.

## 6. Performance Targets (p95/p99 measured at the edge, in-region, sustained load)

| Surface | Target |
|---|---|
| Read APIs (products, orders, locations, stock) | p95 ≤ 150ms · p99 ≤ 400ms |
| `GetAvailability` | p99 ≤ 15ms in-region (frozen budget) |
| Reserve/commit (Operations) | p99 ≤ 60ms (frozen) |
| Checkout API total (reserve+authorize+place, excl. 3-DS user time) | p95 ≤ 2.5s · p99 ≤ 5s |
| Checkout completion rate (technical: started→placed excl. buyer abandonment) | ≥ 99.5% non-error |
| Payment webhook → order timeline visible | p95 ≤ 10s |
| Inventory adjustment → availability projection | p99 ≤ 2s (frozen staleness contract) |
| Storefront product page | LCP ≤ 2.0s p75 mobile · INP ≤ 200ms · CLS ≤ 0.1 |
| Workspace | LCP ≤ 2.5s p75 · JS shell ≤ 200KB gz (frozen budget) |
| Availability (SLO) | 99.9% monthly, checkout + payment paths; error budget policy documented |
| Payout accuracy | 100% reconciliation match or loud discrepancy — no silent drift, ever |

## 7. Security & UX Targets

**Security (mandatory):** all G-3/G-4/G-9 plus — every command through the triple gate (test-enforced per domain) · masking sweeps green on every endpoint class · step-up on the frozen sensitive list · rate limits on auth, guest lookup, checkout · CSP/security headers on buyer surfaces · webhook signature verification + idempotent ingestion · finance-grade permission gating on money/costs · audit coverage: 100% of commands, immutability grants verified by test.

**UX (measured):** genesis ≤ 3.5 min median / ≤ 5 min p75 (frozen) · time-to-first-product ≤ 90s from workspace (existing product flow) · buyer checkout ≤ 90s median from product page (excl. 3-DS) · **Time-to-First-Deal** instrumented from day one (the north star — targets set after alpha baseline, per constitution) · mobile: all J-journeys completable one-handed on a 390px device (E2E-verified) · WCAG 2.2 AA: axe-clean on every R1 surface + keyboard-only completion of J-1, J-4, J-7 + screen-reader pass on checkout and fulfillment · error quality: 100% of buyer/merchant-visible failures use educate-pattern copy (audited against the stable-code catalog) · first-sale ceremony fires within 5s of `confirmed`, exactly once (Moment-Ledger verified).

## 8. Acceptance Tests

**AT-1…AT-15 = J-1…J-15, automated** as permanent black-box suites (the ACCEPTANCE-001 pattern): real HTTP, embedded/real PG, sandbox PSP, no mocks of DOF code. Plus adversarial ATs: **AT-16** double-submit storm on one attempt key (50 concurrent → exactly one order, one authorization). **AT-17** flash race: 100 checkouts, 3 units → 3 orders, 97 honest declines, 0 oversells, 0 silent failures. **AT-18** webhook replay ×10 → zero duplicate postings (ledger balanced). **AT-19** reservation TTL expiry mid-checkout → typed failure, stock released, retry succeeds. **AT-20** refund bounds attack (refund > captured via API) → refused, audited. **AT-21** cross-tenant + buyer-gate masking sweep across all R1 endpoints. **AT-22** ledger recompute: after AT-1…21, ∑ entries = every balance (money S2). **AT-23** kill-and-resume: process killed mid-saga at each step → compensation or resume correct on restart. **AT-24** escrow lifecycle (J-12) including *blocked payout* copy. **AT-25** capability leak scan: every X-item's surface provably absent/dark in production config.

## 9. Release Checklist (the signature page)

☐ F-ID-1…5 ☐ F-ME-1…4 ☐ F-CO-1…4 ☐ F-OP-1…9 ☐ F-OR-1…8 ☐ F-PA-1…8 ☐ F-SE-1…4 ☐ F-XC-1…4 — each with review verdict + acceptance YES on file
☐ X-1…X-14 verified excluded (AT-25)
☐ AT-1…AT-25 green in production configuration
☐ G-1…G-12 signed (named signatories: CTO, CPO, Security, Legal, Ops on-call lead)
☐ Production run of J-1→J-12 with a real card, witnessed, evidence archived
☐ Roadmap M5 declared; alpha merchant cohort onboarding begins

**Release 1 is complete when this page is fully checked. Nothing else declares it.**

---

*RELEASE-001 in one sentence: one merchant, one buyer, one honest sale — account to payout — on production, under load, behind every gate, with the ceremony firing once.*
