# DOF Platform — ADR-008

# Payments Domain Architecture

**Status:** Accepted (constitutional — the final ADR before full-platform implementation) · **Version:** 1.0 · **Date:** 2026-07-07
**Authors:** Chief Financial Systems Architect / Principal Payments, Security, Commerce & Distributed-Systems Architects / CTO (one pen)
**Binding docs honored:** Engineering Constitution · Platform & Product Bibles · ADR-001…ADR-007 (the **ADR-007 §6 PaymentPort is conformed to verbatim**; CDC-001 §2.3's refund choreography likewise) · BLUEPRINT-003 v1.1 · OPS-001B-DESIGN · UX-BIBLE-001 v1.1 · DESIGN-SYSTEM-001 · DECISIONS.md. ADR-003 §7's frozen payments taxonomy is adopted; ADR-003 §9's extraction posture (Payments extracts second, for compliance isolation) is a design input, not an afterthought.
**Contains:** no code, no schemas, no APIs.

---

## 1. Executive Summary

Payments is the domain of **money truth on a multi-merchant platform**. Its central design decision: **the PSP moves the money; Payments owns the truth about the money** — an append-only, double-entry internal ledger over provider facts, with per-merchant balances (available, held/escrow), platform fees, and payout liabilities modeled from day one. That single decision makes everything the brief defers — split payments, platform fees, payouts, escrow, multi-party settlement, gift cards, store credit — a *balance operation on an existing ledger* rather than a redesign. Card data never enters DOF (PCI SAQ-A posture: provider-hosted fields, tokens only inward); PSPs sit behind a capability-sliced port with an adapter registry, so provider #2 is an adapter, never a migration. A payment is composed of **tender legs** now (one card leg at launch), so liability tenders (gift cards, credit) plug in without touching the intent lifecycle. Escrow is not a system — it is a **named balance state** executing ADR-001's frozen trust promise (`unverified merchants sell; funds hold; verification releases`). Reconciliation is a first-class aggregate whose job is to make drift loud. Every money movement is idempotent end-to-end (Orders' attempt key → intent → PSP idempotency key), every fact is an event under the frozen taxonomy, and nothing financial is ever automated by AI at any autonomy setting.

## 0. Challenges to the Brief (Read First)

**0.1 Ledger-of-record, not processor.** A payments domain that merely proxies a PSP inherits the PSP's model and can never answer DOF's own questions (what does DOF owe merchant X? what is held in escrow? did the statement match our facts?). The internal **double-entry ledger** — accounts for PSP clearing, per-merchant available, per-merchant held, platform fees, refund/chargeback liabilities, future buyer-credit liabilities — is the domain's spine. Every provider fact posts balanced entries; balances are the ledger's cached sums (the Operations S2 law, applied to money, with the same recompute gate).

**0.2 Marketplace money from day one, marketplace features later.** DOF is a platform of merchants, so the money model must be multi-party even while v1 behaves like simple checkout: charges post to (merchant balance − platform fee), payouts draw from merchant balances, escrow is a balance state. The PSP integration assumes **connected-account capability** (`PlatformAccountsPort`) so provider-side splits map 1:1 to ledger legs. Deferred features change *policy values*, never structure.

**0.3 Tenders are legs.** "Support cards, wallets, PayPal, Interac, ACH, gift cards, store credit" is one abstraction: a PaymentIntent carries a **tender plan** of legs, each leg an instrument kind + amount. PSP tenders execute externally; liability tenders (gift card, store credit — future) execute *inside the ledger* and never touch a provider. v1 ships exactly one leg (PSP card/wallet); mixed-tender checkout arrives as a plan with two legs, not a redesign.

**0.4 The port was written by our consumer — we conform.** ADR-007 froze `authorize(attemptKey, totals, method)` / `capture(orderRef, amount)` / `refund(orderRef, amount, cause)` with idempotency by attempt/order keys, capture-on-fulfillment default, and a sandbox adapter from day one. CDC-001 froze the return-refund choreography (`operations.return.resolved` carries intent → Payments executes → `payments.refund.issued` closes the loop). This ADR adds no synchronous surface beyond that port plus webhook ingestion.

**0.5 Risk holds money, Administration judges people.** Fraud scoring can pause an intent (`requires_review`); the *decision* belongs to Administration's casework (ADR-001/ADR-003 jurisdiction), and merchant-standing consequences flow through Merchant, never from Payments directly. Merchants see honest but non-instructive decline language (never a fraud-evasion manual); buyers see UX-BIBLE-grade honesty.

## 2. Domain Vision (10 years)

Today: the promise "your money is exactly where we say it is," kept by a ledger that reconciles to the cent. 2030: instant-payout eligibility computed from the trust ladder, multi-PSP routing by cost/acceptance, dispute evidence assembled automatically from the order/shipment record (win rates as a Trust-Fabric fact). 2035: the settlement fabric of agentic commerce — machine-negotiated orders (ADR-007) settle through the same intents and ledger, and a decade of clean money facts is what regulators, banks, and buyer agents underwrite.

## 3. Bounded Context

**Owns:** PaymentIntent (+ tender legs, timeline) · authorization/capture/void facts · Refunds (full/partial) · the money Ledger (accounts + entries) · Escrow policy execution · Payouts · Disputes/Chargebacks (+ evidence bundles) · Settlement/Reconciliation · PSP adapters + routing · merchant payment configuration (enabled tenders) · payment audit.
**Does NOT own:** orders (Orders) · products/prices (Commerce) · stock/fulfillment/returns handling (Operations) · verification/trust levels (Merchant — Payments *consumes* trust events to gate payouts/escrow) · buyer identity (Identity) · fraud *enforcement* (Administration) · marketplace ranking.
**Module layout** (`domains/payments/`): `intent/` · `ledger/` · `refund/` · `payout/` · `dispute/` · `reconciliation/` · `providers/` (ACL adapters) · shared-kernel + the D-22 quartet (`payments_domain_events` …). Contract-purity law (ADR-003 §9): this module is built for extraction — no other domain may ever import it; all touch is the port + events.

## 4. Aggregate Design

**PaymentIntent** (root) — order/attempt refs (by value) · amount + currency (minor units) · tender plan (legs: kind, amount, PSP ref) · state: `created → authorized | requires_action | requires_review | failed` → `captured` (supports partial captures) → terminal `voided | fully_captured` · RiskAssessment VO · PSP idempotency keys per operation · append-only PaymentFact timeline. Invariants: **P1** intent amounts equal the sum of legs; **P2** captures never exceed authorization; refund liabilities never exceed captures (the ADR-007 O4 twin, enforced at the source); **P3** every state change cites a provider fact or an explicit platform decision; **P4** one intent per attempt key, forever (replays return it).

**Refund** (root) — cause (`return_case | cancellation | goodwill | dispute`, by-value ref) · amount · legs (which tender gets money back — mirrors the plan) · state `requested → executing → issued → settled | failed` · bounds checked against the intent (P2). Partial refunds are first-class; refund-to-liability-tender (future gift card) is a ledger-only leg.

**LedgerAccount / LedgerEntry** — double-entry, append-only, **immutability-granted like audit logs** (ADR-004 C4); account kinds: `psp_clearing` · `merchant_available(business)` · `merchant_held(business)` (escrow) · `platform_fees` · `refund_liability` · `dispute_reserve` · future `buyer_credit(buyer)`. Invariants: **L1** every posting balances to zero; **L2** entries are never edited (corrections are reversing postings); **L3** balances = ∑ entries (recompute gate, the money `check:ledger`).

**Payout** (root) — business ref · period + entry set it sweeps · amount · state `scheduled → in_transit → completed | blocked | failed` · PSP transfer ref. Invariants: **PO1** draws only from `merchant_available`; **PO2** trust-gated (the frozen ladder: payout capability requires identity verification; `payout.blocked` is the standing/trust consequence, evented, with educating merchant copy per the VerificationNudgePolicy spirit).

**Dispute** (root) — PSP case ref · stage `opened → evidence_due → submitted → won | lost | accepted` · deadlines (Pulse tasks with real deadlines — the one legitimate urgency, UX-BIBLE §1.3) · EvidenceBundle VO (order snapshot, delivery facts, policy text, MediaRefs — assembled via cross-domain *queries*, stored as a frozen copy for the record) · ledger effects (reserve on open, resolve on outcome).

**ReconciliationBatch** (root) — provider statement import · matched facts · **discrepancies as first-class records** (loud, Administration-visible, never auto-adjusted; every correction is a human-decided reversing posting).

**Merchant PaymentProfile** (root) — enabled tenders, payout schedule preference, connected-account ref. Buyer instruments are PSP tokens referenced by value; DOF stores no PAN, ever.

**Value objects:** Money · TenderLeg · PspRef · FeeBreakdown (rate + fixed, versioned policy data) · RiskAssessment (score, signals digest, decision) · EvidenceBundle · PayoutSchedule · DeclineReason (buyer-safe + merchant-safe renderings).
**Specifications:** `CaptureWithinAuthorization` (P2) · `RefundWithinCaptured` · `PayoutEligible` (PO1+PO2 + trust) · `EscrowReleasable` (trust level or policy window).
**Policies (event-reactive):** `EscrowPolicy` (charge → held vs available by merchant trust; `merchant.trust_level_raised` → release sweep → `escrow.released`) · `PayoutSchedulingPolicy` · `DisputeDeadlinePolicy` · `ReviewEscalationPolicy` (requires_review → Administration case) · `SettlementMatchPolicy`.
**Domain services:** `TenderPlanner` (v1 trivial) · `PspRouter` (method/region/currency → adapter; failover rules declared) · `FeeService` (policy data, versioned) · `EvidenceAssembler` · `LedgerPoster` (the only writer of entries — the S2-style single write path).

## 5. Lifecycle — the money story in seven stages

| Stage | Customer expects | Merchant expects | Domain behavior | Events |
|---|---|---|---|---|
| **Intent** | seamless pay sheet (hosted fields — card data never touches DOF) | nothing | intent created under the attempt key; tender plan; risk assessed (may → `requires_review`) | *(internal)* |
| **Authorization** | instant yes/no; honest retry on decline (no jargon) | still nothing (ADR-007 A7-8: merchants see certainty) | PSP authorize with per-op idempotency key; facts appended | `payments.authorization.{succeeded,failed}` *(additive, §13)* |
| **Capture** | usually invisible; card shows the charge when it ships (capture-on-fulfillment, ADR-007) | "money is really coming" — balance rises | capture ≤ auth (P2); **ledger posts: clearing → merchant_available (or merchant_held per EscrowPolicy) + platform_fees** | `payments.charge.succeeded` / `payments.charge.failed` *(frozen names = capture facts)* + `payments.escrow.held` when applicable |
| **Settlement** | invisible | payout math becomes real | provider statement ingested; ReconciliationBatch matches facts to entries; discrepancies loud | *(internal + reconciliation alarms)* |
| **Refund** | fast, honest, to the original tender | one decision, executed for them (choreography: the return/cancel decision *was* the approval) | Refund aggregate executes via PSP; ledger reverses proportionally (merchant balance, fees per policy) | `payments.refund.issued` *(frozen)*, `payments.refund.settled` *(additive)* |
| **Chargeback** | (initiated at their bank) | a deadline task with the evidence 80% pre-assembled | Dispute opens; `dispute_reserve` posting; EvidenceAssembler drafts the bundle from order/shipment truth; merchant reviews & submits (R2 — words to a bank are merchant-signed) | `payments.dispute.{opened,submitted,resolved}` *(additive)* |
| **Resolution / Payout** | — | money arrives on schedule; blocked payouts explain themselves and name the fix | dispute outcome posts; PayoutSchedulingPolicy sweeps `merchant_available` → transfer; trust gates enforced | `payments.payout.{scheduled,completed,blocked}` + `payments.escrow.released` *(frozen)* |

## 6. Integration Strategy & Event Taxonomy

**Inbound (synchronous):** the ADR-007 PaymentPort, verbatim — `authorize/capture/refund`, fail-closed, idempotent, sandbox adapter from day one. Nothing else synchronous inbound; there is no "charge API" for other domains.
**Inbound (events consumed):** `operations.return.resolved` (refund intent — CDC-001 §2.3) · `orders.order.cancelled` (void/refund cause) · fulfillment milestones (capture triggers per ADR-007 capture policy) · `merchant.trust_level_raised` / standing events (escrow + payout gates).
**Outbound events (ADR-003 frozen + additive registered before first emission):** `payments.charge.{succeeded,failed}` · `payments.escrow.{held,released}` · `payments.payout.{scheduled,completed,blocked}` · `payments.refund.issued` — plus additive `payments.authorization.{succeeded,failed}`, `payments.refund.settled`, `payments.dispute.{opened,submitted,resolved}`. Payloads producer-owned, registry-locked, PII-free, amount-bearing in minor units.
**PSP boundary (ACL, ADR-003 §6):** capability-sliced ports — `ChargePort`, `RefundPort`, `PlatformAccountsPort` (connected accounts/transfers), `WebhookVerifier`, `StatementPort` — adapter registry with per-adapter sandbox twins; webhooks are authenticated, **idempotently ingested keyed by provider event id**, translated to internal facts before any domain logic, and ordered per intent (partition key = intent id). Provider #2 = new adapters + router entry.
**Orders remains the only caller of money movement; Marketplace/Analytics consume events; Administration consumes review/dispute/reconciliation signals and acts through its own jurisdiction.**

## 7. Security Architecture

**PCI boundary:** SAQ-A posture — provider-hosted payment fields; PAN/CVV never transit or rest in DOF; the domain holds tokens and facts. This is *structural* (there is no field to store a PAN in) and preserved by review law. **Tokenization:** buyer instruments = provider customer/method tokens by value. **Secrets:** provider keys in platform secret config, per-environment, rotated; webhook secrets likewise; no secrets in domain state. **Least privilege:** money data is finance-grade (the D-38/ADR-006 class): `finance.payments.view` for facts, payout configuration behind the frozen sensitive-operation protocol (step-up; ownership-verified); ledger tables INSERT+SELECT only (ADR-004 C4); support access via consent delegation, audited. **Auditability:** every command audited; every ledger entry cites its cause fact; reconciliation discrepancies are records, not logs. **Encryption:** provider refs and buyer contact snapshots encrypted at rest posture; D-26 redaction tokens extended (`iban`-class, token ids). **Compliance isolation:** the module's contract purity is the PCI/extraction strategy (ADR-003 §9 — Payments extracts second; nothing may couple to its internals in the meantime).

## 8. Data Ownership

Sole writer of intents, ledger, refunds, payouts, disputes, reconciliation, payment profiles. Cross-domain by value only. **The ledger is the money truth; the PSP is the money mover; reconciliation is the treaty between them** — declared freshness: authorization synchronous; capture/settlement facts eventual (webhook-lag, seconds-to-hours, honestly surfaced as "processing"); merchant balances eventual to the last posted entry; payout amounts strong at scheduling time.

## 9. AI Touchpoints (advisory forever)

**The constitutional ceiling, restated hard: no AI initiates, approves, or retries a financial action at any autonomy setting** (ADR-001 §13.3 → R3 across the board; the Autonomy Ledger cannot be configured around it). Advisory rows (quartet-bearing, data-floors apply):

| Capability | Evidence | Ceiling |
|---|---|---|
| Payment optimization | the merchant's own acceptance/decline mix by method/region | R0 insight → **R2 configuration proposal** ("enable Apple Pay — 23% of your checkouts are Safari-mobile") — config, never money |
| Failed-payment insights | decline reason distributions (buyer-safe categories only) | R0 narrative |
| Refund trends | refund causes joined to Operations' return reasons | R0 → R2 fix proposals routed to the owning domain (photos, sizing) |
| Chargeback analysis | dispute outcomes + evidence completeness | R0 coaching ("orders with tracking win 4× — 2 of your disputes lacked it"); evidence *submission* is merchant-signed R2 |

## 10. Scalability

Intents are write-once-plus-facts; the hot path is authorize (synchronous, provider-bound — pooled, timeout-budgeted, fail-closed). Idempotency is layered end-to-end: attempt key (Orders) → intent (P4) → per-operation PSP idempotency keys → webhook event-id ledger — a retry storm at any layer converges. Ledger entries partition by month (append-only, audit-granted); balances are indexed sums with the recompute gate. Webhook fan-in orders per intent and parallelizes across intents. Multi-PSP routing spreads regional load and provides failover (declared, tested with sandbox twins). Regional deployment follows the merchant's region (ADR-006 A6-5); provider residency requirements route via the PspRouter. Replay-safe: consumers ledgered; projections (merchant balance views, payout statements) rebuild from entries.

## 11. Risks

**R-a** Provider dependency/outage on the authorize path — fail-closed checkout with honest buyer copy; multi-PSP failover is designed but v1 ships one provider: accept and monitor (extraction of this risk is the router's existence). **R-b** Reconciliation drift — the treaty aggregate makes it loud; the residual risk is *unmatched* facts aging silently → SLA on discrepancy triage (Administration dashboard requirement). **R-c** Regulatory surface (money transmission, KYC/AML on payouts) — mitigated by the connected-accounts model (the provider is the regulated money mover; DOF instructs) — this is a *legal-review gate before GA*, recorded here so it cannot be forgotten. **R-d** Dispute deadlines are hard external clocks — the one place DOF *must* nag; deadline tasks are exempted from calm-notification rules by design (real deadlines are the sanctioned urgency). **R-e** Escrow UX — held funds anger merchants unless the release path is always visible ("verify identity to release €412" — the frozen nudge policy, applied). **R-f** Tender-leg generality could tempt premature wallet features — held by v1's single-leg law (structure now, features by their own ADRs).

## 12. Recommendations

1. **BLUEPRINT-005 (Payments implementation)** after Orders' first sprint proves the port against the sandbox adapter; first Payments sprint = intent + ledger + capture/refund against one PSP sandbox, reconciliation from day one (never retrofit the treaty).
2. Choose PSP #1 for **connected-accounts capability** (the marketplace ledger depends on it); record the selection as a decision with exit criteria.
3. Ship escrow with the first real charge (it is a policy branch on an existing posting — cheapest trust promise DOF will ever keep).
4. Extend CDC-002 (Orders' consumer contracts) with the payments-facts subset Marketplace/Analytics may read; freeze dispute-evidence query needs with Operations (shipment facts) now.
5. Legal/compliance review gate (R-c) scheduled before any real-money GA; PCI SAQ-A attestation path documented with the first provider integration.
6. The trust-record projection (AMENDMENT-001) gains dispute-rate and refund-speed facts once these events exist — with the §9 buyer-safe rendering rules.

## 13. Reconciliation & Decision Register

**Reconciliations:** R-1 ADR-007 PaymentPort conformed verbatim; no additional synchronous surface. R-2 CDC-001 §2.3 refund choreography adopted; `refund.settled` added additively. R-3 ADR-003 §7 payments taxonomy adopted; `charge.*` mapped to capture facts; seven additive names registered before first emission. R-4 ADR-001 §10 escrow executed as a ledger balance state gated by the frozen trust ladder. R-5 ADR-003 §9 extraction posture honored structurally (contract purity, no inward coupling).

**Decisions:** **A8-1** The PSP moves money; Payments owns money truth — an append-only double-entry ledger with per-merchant balances, platform fees, and escrow as account states; balanced postings, reversing corrections, recompute-gated. **A8-2** Marketplace money structure from day one (connected accounts, fee legs, payout sweeps); marketplace *features* later change policy, never structure. **A8-3** Payments are tender plans of legs; PSP tenders execute externally, liability tenders in-ledger; v1 = one leg. **A8-4** PCI SAQ-A structurally: hosted fields, tokens only, no PAN fields exist. **A8-5** Escrow = `merchant_held` postings under EscrowPolicy; releases ride trust events; the release path is always merchant-visible. **A8-6** Risk pauses, Administration decides, Merchant standing punishes — Payments never judges people. **A8-7** Idempotency layered end-to-end (attempt key → intent → PSP op keys → webhook event ids). **A8-8** Reconciliation is an aggregate; discrepancies are loud records; corrections are human reversing postings. **A8-9** Dispute deadlines are the sanctioned urgency: real-deadline tasks with evidence pre-assembled, merchant-signed submission. **A8-10** No AI-initiated financial action at any setting, forever — the hardest R3 line in the platform.

---

*ADR-008 in one sentence: DOF never touches the card and never loses the plot — the provider moves the money, a double-entry ledger remembers every cent's story, escrow keeps the trust promise, and when the statement and the story disagree, the platform says so loudly and fixes it by writing, never by erasing.*
