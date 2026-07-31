# Founder Review Packet — Operational Commerce Campaign (C6 → C9)

**Date:** 2026-07-31 · **Versions:** v1.35.0 → v1.38.1 · **PRs:** #44–#48 · **Status:** campaign complete, all gates green

---

## 1. Executive Summary

The campaign took DOF from "money can be taken" to "commerce can be operated." Four increments shipped, each independently tested, merged, and tagged, with no Founder Review Gate triggered:

- **C6 — Fulfillment & Shipping** (v1.35.0): shipping profiles, the immutable promise snapshot, fulfillment cases with split shipments, pack/dispatch/pickup/digital flows, the aging keystone (nudge → disclosure → automatic refund), and the hold-release policy (payout never released at "shipped" alone).
- **C7 — Notifications** (v1.36.0): letters as outbox consumers — buyer and merchant hear about confirmation, shipping, delay disclosure, refunds — replay-deduped by the delivery ledger, zero new infrastructure.
- **C8 — Cancellations & Refunds** (v1.37.0): the decision sits with whoever bears the consequence — untouched orders cancel instantly at the buyer's tap; once packed, the maker decides. Money moves atomically with the decision or not at all.
- **C9 — Returns** (v1.38.0): request → authorize/decline → send back → one settlement act (inspect + disposition + refund). Returns **append** to a completed order; they never rewind it. Plus the minimal audited operator surfaces and the runbook-without-SQL.
- **v1.38.1**: three buyer-facing untruths found by walking the demo journeys in a real browser; copy law enforced.

The keystone promise — *charged at purchase; the maker isn't paid until it ships; no-ship means automatic refund* — is now **mechanically true**: schema CHECKs bound refunds, one cron tick walks the aging ladder, the hold policy is a single injected function, and no code path releases payout at dispatch for manual shipping.

## 2. Business Value

- **A buyer can be wronged and made whole without a human**: no-ship auto-refunds (with shipping when nothing shipped), instant cancellation before packing, and a return path where generosity ("refund, they keep it") is one tap.
- **A merchant runs their side from one card**: everything needed to pack, the promise date as a commitment (not a metric), one-decision blocks for cancellations and returns. No admin dashboard was built.
- **Support can operate without engineering**: full order reconstruction, alarms derived from state, audited goodwill refunds, internal notes — all without SQL, all gated and logged.
- **The trust surface compounds**: every letter, timeline chapter, and refund line is a recorded fact. Nothing is simulated; a truth that expires is treated as an untruth.

## 3. Increment Reports

### C6 — Fulfillment & Shipping
Migration 0021 (profiles, cases, promise/aging/hold columns). Confirm snapshots the promise; checkout quotes real shipping (found and fixed two real bugs: shipping dropped from TOTAL and CAPTURE; method never forwarded). Cases split by shipment; pickup and digital have their own vocabulary. Aging ladder in one resumed cron tick: stage 1 merchant nudge → stage 2 buyer disclosure + `promise_missed` event → stage 3 refund + line cancellation + alarm on failure. Hold release: one policy function (digital=grant, pickup=handover, ship=dispatched+7 quiet days), ledger `merchant_holding → merchant_payable` balanced postings. 6 integration tests.

### C7 — Notifications
`MailPort` + `SandboxMailer`; consumers ride the existing outbox dispatchers, so replay-dedupe came free from the delivery ledger. Letters follow the letter idiom: what happened, what happens next, what you can do. Merchant owner resolution via staff membership. 3 integration tests including the replay storm.

### C8 — Cancellations & Refunds
Migration 0022. Decision-owner model; approve refunds the undispatched part only; refund failure rolls the whole decision back (withTransaction law). Armed two-tap on the buyer side. Ledger reversal holding-first-then-payable. 4 integration tests including the 666.01 refund-failure injection.

### C9 — Returns + Operator Surfaces
Migration 0023 (`return_cases`, `return_case_lines`). One open case per order; 30-day window from fulfillment evidence; the merchant's single decision surface; resolution refunds through the one primitive (`return:<caseId>`), restocks only when something physically returned and the maker chose the shelf. Returns append — `line_state='returned'`, order state untouched. Operator kit: reconstruction GET, state-derived alarms with human ack, note pen (internal-by-default, filtered from the buyer read), bounded idempotent ops refund — all audited (`audit_logs`), gated by `NUXT_OPS_USER_IDS`, dark by default (verified 401 in the live demo). 4 + 2 integration tests.

## 4. Hostile Scenario Convergence (all 12)

| # | Scenario | Where proven |
|---|---|---|
| 1 | Double dispatch tap | fulfillment.test.ts — one case, one event |
| 2 | Refund retried after timeout | payments.test.ts — causeKey idempotence |
| 3 | Aging tick crashes mid-walk | confirm.test.ts — resumed tick converges |
| 4 | Outbox replay storm | notifications.test.ts — delivery ledger dedupe |
| 5 | Return resolution repeats | returns.test.ts — quiet convergence, refund once |
| 6 | Cancel decision races dispatch | cancellations.test.ts — row locks decide |
| 7 | One line of several returns | returns.test.ts — scarf lives on, order unrewound |
| 8 | Refund fails at provider | cancellations.test.ts — whole decision rolls back |
| 9 | No-ship with partial dispatch | confirm.test.ts — undispatched refunds + shipping |
| 10 | Two operators resolve at once | returns.test.ts — Promise.all race, one act of money |
| 11 | Hold release before quiet days | fulfillment.test.ts — policy says no |
| 12 | Stuck payment with sold stock | ops-surfaces.test.ts + confirm — alarm + honest failure |

No duplicate money anywhere; no silent divergence — every failure either rolls back whole or lands in the alarms queue with a named manual step.

## 5. Demo Journeys (browser-driven, real UI, v1.38.x)

1. **Happy path**: storefront → cart (2 lines) → checkout (real shipping quote, keystone wording) → confirmed letter with promise date → Rosa packs/dispatches with tracking → buyer timeline gains the shipped chapter. ✓
2. **Partial return**: buyer opens the return door on the delivered order, picks the blanket, writes why → Rosa authorizes with her own words → buyer adds send-back tracking → Rosa settles (restock + €45 refund) → line `returned`, scarf `fulfilled`, order state unchanged, refund on the timeline. ✓ (this run also caught the three copy untruths — fixed in v1.38.1)
3. **Cancellation**: proven in C8's browser run — instant when untouched; maker-decided once packed. ✓
4. **No-ship auto-refund**: proven by integration (clock-staged aging to stage 3, refund + shipping back, lines closed); not browser-drivable without waiting out real days. ✓

## 6. Real Stripe Readiness (against the binding gate)

| Gate condition | State |
|---|---|
| Payment Element client confirmation | **Open** — sandbox provider confirms server-side; the Element mount is C10 work. The seam (`client_secret` out, webhook facts in) exists. |
| No provider calls in long DB transactions | **Held** — provider calls sit outside `withTransaction`; facts are written inside. |
| Stripe-hosted onboarding + `charges_enabled` gating | **Open** — C10. No account-creation code exists yet (deliberately). |
| Pinned API version reverified | **Held** — `2026-06-24.dahlia` pinned in one constant, used by adapter and webhook alike. |
| Webhook signatures | **Held** — `constructEvent` verification, 400 on bad signature, 200 on duplicates. |
| Legal keystone wording | **Held** — checkout and product page state it; AI never authors trust copy (all wording human-reviewed in PRs). |

**No real Stripe key exists in the repo or its history.** The gate stays closed until the two Open rows close in C10.

## 7. Operational & Support Readiness

Runbook (`docs/runbooks/order-reconstruction.md`) now ends in "do it without SQL." Alarms are derived from state, so they cannot drift from reality; acknowledgement is a human note that survives on the order. The ops refund is schema-bounded — an operator cannot overdraw even deliberately. Everything an operator does lands in `audit_logs` with their identity. Residual manual steps: orphaned-stock adjustment after 24h payment failure (alarmed, runbook-named) and provider-dashboard work only after repeated refund failure (alarmed loudly).

## 8. Quality Reviews (lightweight, per campaign rule)

- **Accessibility**: axe-clean across the sweep (147 e2e including WCAG checks); the C8 contrast defect (4.35:1) was found by the gate and fixed before merge. Return chips are real buttons with radio/pressed semantics; announcements ride `announce()`.
- **Performance**: no new N+1 on hot paths; returns join the merchant list in one extra query per business, not per order. The reconstruction endpoint fans out in parallel inside one snapshot.
- **Security**: buyer gate masks to 404; merchant access through the triple gate; ops gate is allowlist + masked nothing + audited; internal notes filtered at the read; no PII in ledger causes.
- **Experience**: the street language held — no "RMA," no "status: PROCESSING," no admin table. The judge's bench is three sentences and three buttons.
- **Maintainability**: every C9 event registered through the M-6 ritual; manifest at 78 tables with the constitution test pinning it; the rollback law documented where it bit.

## 9. Technical Debt (named, bounded)

1. Return quantities are all-or-nothing per line (schema supports partial; UI and refund math don't yet).
2. Buyer identity is still the visitor cookie — an order is lost with cleared cookies until accounts arrive (C11).
3. `listOpenByBusiness` walks cases per order (fine at street scale; index exists when it isn't).
4. Ops surfaces have no UI page — deliberate; endpoints + runbook until Administration is a real domain.
5. The letter's `LETTER` map lives in the page; a second consumer of state-aware prose should extract it.

## 10. Open Launch Gates

- Real Stripe (two Open rows above) — C10.
- Legal pages (terms, returns policy wording as legal text, impressum) — founder decision required on wording, C11.
- Accounts & sign-in for buyers (order persistence beyond the cookie) — C11.
- Production infrastructure (real mail provider behind `MailPort`, real media storage, backups) — C12.

## 11. Revised C10–C12 Timeline

- **C10 — Real Money** (next): Stripe-hosted onboarding, `charges_enabled` gating, Payment Element mount, live-mode config gates, provider-event reconciliation dashboard-in-a-runbook. Exit: a real €1 moves in test mode end-to-end through the Element.
- **C11 — Accounts & Legal**: buyer accounts (orders follow the person), the legal keystone pages (founder wording gate), merchant settings consolidation.
- **C12 — Production Hardening**: real mail/media adapters, backup/restore drill, load pass on the street pages, launch checklist execution.

## 12. GO / NO-GO

**GO** — for C10 immediately. The commerce core is mechanically honest under hostile conditions, operable without engineers, and every constitutional law held through four increments without a gate trigger. The only things standing between DOF and real money are the two named Stripe gate rows — which are exactly C10's scope.
