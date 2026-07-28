# DOF Buyer Experience — BUYER_CONFIDENCE_SYSTEM

**Status:** For Founder approval (design only) · v1.0 · 2026-07-27
The mechanics: how every confidence signal is computed from recorded events, when it appears, when it hides, and who may never touch it. This is the enforcement half of BUYER_TRUST_MODEL.

---

## 1. Signal registry (source of truth for every buyer-facing trust fact)

| Signal | Computed from (real events only) | Appears when | Hides when | Ships |
|---|---|---|---|---|
| Presence line: followers | `store_follows` count (existing read) | > 0 | = 0 (absence, not "0 followers") | now |
| Presence line: liveness | max(spark, deal publish timestamps) | ≤ 60 days old | older → falls back to opened-date | now |
| Opened-date ("since March") | `stores.published_at` | always | never | now |
| "From the maker" strip | latest published sparks (existing read) | ≥ 1 spark | none → story block carries voice alone | now |
| Delivery expectation (promise) | merchant-set promise date | C3+ | — | C3 |
| Delivery expectation (evidence) | p25–p75 of actual ship intervals from fulfillment cases | ≥ 5 shipments | below → merchant promise only | C6 |
| Outcome counts ("41 of 43") | orders with delivery ≤ promise date vs total completed | ≥ 3 completed orders | below → honest-newness line | C5/C6 |
| Repeat buyers | distinct buyers with ≥ 2 confirmed orders | ≥ 2 such buyers | below → absent | C5+ |
| Refund fairness ("made right in ~2 days") | refund issued_at − return/cancel decision, median | ≥ 3 refunds | below → absent (and that's good news) | C8/C9 |
| Keystone sentence | the payout-hold mechanics themselves | C3 live + legal wording approved | never (it is structural) | C3 |
| Real stock scarcity | tracked `stock_items` availability | tracked AND ≤ 3 | untracked, or > 3 | C3+ |
| Promise-check ("arrived as promised?") | buyer's one-tap answer post-delivery | delivery confirmed | — | C6 |

## 2. Threshold law
Every evidence signal has a floor (col. 3) below which it is **absent, not zero**. Sparse evidence invites the doubt it exists to remove. Floors are platform constants, identical for every merchant (no per-merchant tuning — that would be ranking's foot in the door).

## 3. Integrity laws
1. **Merchants cannot edit outcomes.** Promise-kept counts, refund medians, ship intervals render from Orders/Operations/Payments facts; no merchant-facing surface can alter, hide, or reorder them. (Merchants CAN see their own record before buyers do — the workspace shows it first, with the educating framing: "this is what buyers will see.")
2. **AI may never author a trust fact.** R-class law extended: trust surfaces render recorded events verbatim through fixed templates; AI may *coach the merchant* about their record (R0/R2 in the workspace) but no generated sentence ever appears on a buyer trust surface.
3. **Nothing ranks on trust.** The street stays chronological; search stays match-only. Trust facts inform the buyer at the decision point — never the feed order (L6).
4. **Denominators are visible.** Any count shown carries its total ("41 of 43", "3 refunds, median 2 days") — a numerator alone is marketing.
5. **The keystone is one sentence, one style, everywhere** — its wording is versioned platform copy under legal review at C4's gate; stores never customize it.
6. **Buyer privacy in evidence:** all outcome facts aggregate; no individual order is ever exposed as social proof ("J. from Ghent bought this" is banned — surveillance-smell, and PII).

## 4. Failure honesty (what buyers see when the record is bad)
A merchant with "31 of 43 on time" shows "31 of 43 on time, 12 late." No euphemism, no hiding — and the merchant's workspace shows the same number with coaching (the mentor voice: "your last 5 shipped on time — the record heals as you keep promises"). The record is *recoverable by behavior*, never by payment or support ticket. This is the fairness half of showing receipts: the same honesty that protects buyers protects good merchants having a bad month, because recency is visible in the evidence trail (counts link to a dated list, C6+).

## 5. Cold-start summary (the day-zero shop)
Presence line (opened-date form) + voice (story/promise) + "From the maker" strip + keystone. Nothing else — and per this model, that is *enough to buy*, because F2/F4 are carried structurally. The Learning Ledger measures whether reality agrees (§7).

## 6. The one designed seam: buyer questions
Public Q&A (buyer asks on a product; merchant answers publicly) is the strongest *unbuilt* candidate (F3 killer; every answer is Class-3 evidence with a timestamp — liveness compounding). It is a **new business capability** and stays a seam: designed shape = questions as first-class public objects on products, merchant-answered, chronological, no votes. **Gate:** Founder approval + street evidence (buyers actually attempting to contact merchants — watch shares, the friction log, and "how do I ask…" verbatims). Not scheduled; never built without the gate.

## 7. Instrumentation (Learning Ledger hooks)
Product-page 5s bounce rate · add-to-cart rate on pages with vs without a live "From the maker" strip (the liveness hypothesis, H-33) · checkout abandonment at DP-3/DP-4 · promise-check response rate · time-to-second-purchase. All aggregate, all existing-pipeline (`npm run learning` extensions), all feeding Founder review — the evidence discipline applies to this design too: **if liveness doesn't move add-to-cart, this model revises.**
