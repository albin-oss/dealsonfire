# DOF Platform — IMPLEMENTATION-ROADMAP v1.0

**Status:** Accepted (master execution plan) · **Date:** 2026-07-07
**Authors:** CTO / VP Engineering / Principal Architect / Staff EM / Principal PM / TPM (one pen)
**Binding docs:** Engineering Constitution · Platform & Product Bibles · ADR-001…ADR-008 · BLUEPRINT-001…003 · OPS-001-BLUEPRINT/OPS-001B-DESIGN · CDC-001 · UX-BIBLE-001 · DESIGN-SYSTEM-001 · DECISIONS.md (D-01…D-39). *Honesty note:* BLUEPRINT-004 (Orders) and BLUEPRINT-005 (Payments) are mandated by ADR-007/008 but not yet authored — this roadmap schedules their authoring as the first batch of their tracks; a roadmap may not treat unwritten documents as immutable.
**This document plans; it decides nothing architectural.** Every batch below executes frozen contracts.

---

## 1. Executive Summary

DOF's constitution is complete (eight ADRs, three blueprints, two experience constitutions, one CDC, 39 decisions) — and unusually for a roadmap, **a working, gated core already exists**: the platform machinery, Merchant kernel, Commerce product slice, the full UI Foundation + Workspace Shell + Ignite journey, and Operations Batch 1 are implemented, principal-reviewed, hardened, and green across a 13-gate CI chain (~600 tests across unit/integration/UI/E2E). Roughly **55% of Release 1 and 40% of Release 2 are done and frozen**.

The plan: six releases, each a set of implementation batches run through the proven five-stage discipline (Implementation → Principal Review → Hardening → Business Acceptance → Freeze — the exact loop that caught H-1-class defects in every cycle so far). The critical path to real money is one line: **Identity sessions → Stock Ledger (OPS-001B) → Orders checkout (ORD) → Payments (PAY) → buyer-facing storefront** — everything else parallelizes around it. The keystone milestone (M4) is *one real merchant completing one real sale end-to-end on staging*: Ignite-created store, tracked stock, reserved checkout, captured payment, packed shipment, first-sale ceremony. Public launch keys to Release 3 (a marketplace needs buyers *and* sellers; launching before Discovery exists strands early merchants).

## 2. Release Plan

> Complexity: S ≈ 1 batch-sprint · M ≈ 2–3 · L ≈ 4–6 · XL ≈ 7+. A batch-sprint = one implementation batch through all five stages. ✅ = already frozen.

### Release 1 — The Commercial Core (sell a thing, move a thing, get paid)
**Objective:** a merchant can create a business, list products, track stock, take an order, and receive money — the platform's economic engine, end to end.
**Batches:** ✅ Platform Foundation · ✅ Merchant Kernel · ✅ Commerce Product Slice (+D-31 hardening) · ✅ OPS-001A Locations/Ghost (+D-39) · **R1-B1 Identity & Sessions** (real auth replacing dev-mode; buyer gate class from ADR-007 §6; guest tokens; claim flow) · **R1-B2 OPS-001B Stock Ledger** (per OPS-001B-DESIGN; reservations dark per OD-5) · **R1-B3 OPS-002 Shipping Profiles** + Ignite Reveal wiring · **R1-B4 BLUEPRINT-004 authoring + CDC-002** · **R1-B5 ORD-001 Cart+Checkout+Placement** (sandbox PaymentPort) · **R1-B6 ORD-002 Lifecycle+Timeline+Buyer views** · **R1-B7 BLUEPRINT-005 authoring + PSP selection** (connected-accounts gate, ADR-008 rec. 2) · **R1-B8 PAY-001 Intent+Ledger+Capture/Refund+Escrow** · **R1-B9 OPS-005 Fulfillment+Shipments** (Phase B activates) · **R1-B10 PAY-002 Payouts+Reconciliation+Disputes** · **R1-B11 OPS-006 Returns** (+ refund choreography) · **R1-B12 OPS-003 Suppliers/receiving** *(parallelizable, non-critical)*.
**Dependencies:** B1 precedes anything buyer-facing; B2 precedes B5; B5 precedes B8/B9; B8 precedes B10/B11. **Complexity:** XL (12 remaining batch-sprints, ~7 on the critical path).
**Reviews:** REVIEW-OPS-002/003, REVIEW-ORD-001/002, REVIEW-PAY-001/002 (adversarial, per precedent). **Acceptance gates:** black-box acceptance suites per domain (the ACCEPTANCE-001 pattern — attack from the merchant/buyer angle, made permanent). **Freeze criteria:** CDC contract locks committed; all 13+ CI gates green; acceptance verdict YES; DECISIONS updated.

### Release 2 — The Store Experience (what buyers see, what merchants shape)
**Objective:** every store is beautiful by default and shapeable without a designer; Ignite onboarding creates *complete* stores.
**Batches:** ✅ UI Foundation (tokens/primitives/patterns/shells) · ✅ Workspace Shell (UI-COM-001) · ✅ Ignite Journey (UI-COM-002) · **R2-B1 Media Domain** (upload, variants, CDN posture — unblocks photos everywhere; the Ignite Show-Me door goes real) · **R2-B2 Storefront Rendering** (public store pages on the storefront theme scope; BrandKit runtime; trust surfaces pinned per CDC §2.4) · **R2-B3 Product Management UI** (catalog grid, product editor, options journey, stock posture surfaces per OPS-001B-DESIGN §3) · **R2-B4 Store Builder + Theme Engine** (sections, homepage editor — DS-2 scope machinery is done; this is composition) · **R2-B5 Ignite completion** (Reveal writes real shipping/policy artifacts; import dossiers land real products; media in the journey) · **R2-B6 SEO + Domains** (metadata, sitemaps, custom-domain seam) · **R2-B7 Taxonomy (minimal)** (the ACCEPTANCE-001 product recommendation, finally) · **R2-B8 Orders UI** (merchant needs-action list, order detail, packing runs; buyer order pages).
**Dependencies:** B1 → B2/B3/B5; B2 → B6; R1-B5/B9 → B8. **Complexity:** L–XL (8 remaining). Storefront rendering (B2) and Product UI (B3) parallelize across frontend pods.
**Reviews/acceptance:** UX-BIBLE conformance review (G-11) is a *named gate* for every UI batch; acceptance = grandma-journey scripts on staging. **Freeze:** visual baselines committed; Playwright journey suites green; Lighthouse budgets met.

### Release 3 — The Marketplace (demand arrives)
**Objective:** buyers discover stores and deals; trust renders everywhere; the flywheel starts.
**Batches:** **R3-B1 Discovery/Search** (indexing pipeline off the event taxonomy; people-first browse per UX-BIBLE §9) · **R3-B2 Deals** (the namesake offer type — commerce offers module + deal surfaces + truth-telling clocks) · **R3-B3 Marketplace surfaces** (home, category, store profiles; availability display via CDC ports) · **R3-B4 Reviews** (verified-purchase structural — order-line ref required; Community/Commerce boundary per AMENDMENT-001 rec. 5) · **R3-B5 Trust surfaces live** (track-record projection per AMENDMENT-001 rec. 1; DofTrackRecord/marks wired to real facts) · **R3-B6 Reputation & anti-manipulation** (Administration casework surfaces).
**Dependencies:** R1 complete (orders feed reviews/trust); R2-B2 (storefronts to discover). B2 (Deals) can start against frozen offer contracts in parallel. **Complexity:** L.
**Freeze:** search relevance acceptance script; trust-rendering audit vs UX-BIBLE §3; load test on browse paths.

### Release 4 — Community (the braid)
**Objective:** commerce acts become stories; stores become characters worth following.
**Batches:** **R4-B1 Notification domain** (channel providers behind ports; calm rules as API — prerequisite for everything social) · **R4-B2 Following + feed** · **R4-B3 Sparks & threads** (launch/drop/milestone moments seed conversations) · **R4-B4 Messaging** (merchant↔buyer, order-scoped first) · **R4-B5 Communities + moderation tooling** (dignity rules; Administration integration).
**Dependencies:** R3-B4 reviews share moderation machinery; R1 order events feed the braid. **Complexity:** L. Largely parallel to R3 after B1.
**Freeze:** abuse red-team pass; notification-volume audit (calm budget); moderation SLA dashboard.

### Release 5 — Ignite Everywhere (the copilots)
**Objective:** the ADR-005 proposal engine goes live beyond onboarding — one brain, four surfaces.
**Batches:** **R5-B1 AI domain + ModelProviderPort + proposal persistence** (Moment Ledger, Autonomy Ledger aggregates) · **R5-B2 Merchant Copilot** (ask-bar dialect #2; proposals in Pulse; the LLM implementation behind the IgniteIntelligence port that UI-COM-002 left rule-based) · **R5-B3 Operations Copilot** (low-stock/reorder/anomaly rows from ADR-006 §7 with real evidence) · **R5-B4 Marketplace Copilot** (deal/pricing proposals, R2 ceilings) · **R5-B5 Customer Copilot** (buyer-side Q&A grounded in store facts — advisory, never checkout-acting) · **R5-B6 Standing Rules + autopilot** (bounded, earned-trust ladder; self-demotion telemetry live).
**Dependencies:** R1–R3 event history is the evidence corpus; R4-B1 for digest delivery. **Complexity:** XL — and gated by the quartet/data-floor laws (every capability ships with its honesty thresholds tested).
**Freeze:** reversal-rate budget instrumented; AI-forbidden command list enforced in tests; red-team prompt-injection pass on every surface.

### Release 6 — Analytics & Foresight
**Objective:** merchants see how they're doing in sentences; Ignite gets its deepest evidence.
**Batches:** **R6-B1 Analytics domain** (event-consuming warehouse projections; KPI computation per CDC §2.6) · **R6-B2 Pulse v2** (health narrative — the readiness-checklist law at business scope) · **R6-B3 Reports & exports** (accountant-grade; the leave-ability promise) · **R6-B4 Insights + trends** · **R6-B5 Forecasting** (data-floor law hard-enforced) · **R6-B6 AI recommendation loops** (closing evidence → proposal → outcome → learning, within ADR-005 privacy isolation).
**Dependencies:** everything emits; this consumes. Can start B1 as early as post-R1 in parallel. **Complexity:** M–L.
**Freeze:** KPI parity audit vs source-domain facts; forecast honesty review; privacy isolation test (one merchant's data never in another's model context).

## 3. Batch Plan Template (binding on every batch above)

Every batch runs: **scope** (frozen-doc citations only) → **implementation** (contracts-first: schemas + OpenAPI + registry locks land in the same PR as code; manifest-first for tables) → **principal review** (adversarial, empirical probes, findings H/M/L) → **hardening** (every required fix + regression tests from the review's own evidence) → **business acceptance** (black-box journey suite, made permanent) → **freeze** (contract locks, DECISIONS entry, debt register update). **Exit criteria, uniformly:** all CI gates green (boundaries · data-constitution · check:operations-class structural gates · tokens · lint · typecheck · unit · integration · UI · E2E · builds · contract locks) + review verdict resolved + acceptance YES. *No exceptions — the discipline found real defects in five of five cycles to date.*

## 4. Critical Path & Risk Analysis

**Critical path:** R1-B1 Identity → R1-B2 Stock Ledger → R1-B5 Checkout → R1-B8 Payments core → R1-B9 Fulfillment → M4 (first real sale) → R2-B2 Storefront → R3-B1/B3 Marketplace → public launch. Seven of Release 1's batches sit on it; everything else staffs around it.
**Parallelizable:** all Release 2 UI batches vs Release 1 backend (two pods, proven pattern); OPS-003/004 off-path; R6-B1 analytics ingestion any time after R1; R4 after its notification prerequisite.
**Highest technical risk:** the checkout saga × payments idempotency seam (R1-B5/B8) — mitigations: CDC contract suites first, sandbox PSP from day one, the flash-sale race test as an acceptance gate (A7-2/A8-7 verified empirically, not asserted).
**Highest business risk:** launching a two-sided marketplace one-sided — mitigated by the launch strategy (§9): merchants onboard in beta *before* buyer-facing launch, so Release 3 opens with inventory to discover.
**Highest UX risk:** Ignite over-promising while the intelligence is rule-based (pre-R5) — mitigated by the honesty laws already in the journey (confidence `guess`, evidence citing only merchant input) and by keeping the copilot dialect dark until R5-B2.
**Standing risks carried:** PSP dependency (single provider until PAY-002 router), Linux visual baselines, dev-identity removal verified in R1-B1's review.

## 5. Engineering Cadence

Two-week batch-sprints; one batch = one sprint *including* its review+hardening (reviews are same-sprint, not queued — the OPS-001A cycle proved the loop fits). Freeze Fridays: contract locks + DECISIONS land before a batch closes. Trunk-based with the full gate chain on every PR; feature exposure via the capability registry (entitlements) and Surface Levels — **code ships dark, capabilities turn on** (no long-lived branches, no launch-day merges). Quarterly: extraction rehearsal (CDC-001 §7), dependency upgrades, baseline refresh.

## 6. Team Structure (growing org — workstreams, not silos)

| Workstream | Pods (target) | Owns |
|---|---|---|
| **Backend Domains A** | Commerce+Operations pod | OPS ladder, commerce growth, availability |
| **Backend Domains B** | Orders+Payments pod | the money path (critical-path priority staffing) |
| **Frontend A** | Design System + Workspace pod | DS evolution, merchant UI batches, UX-BIBLE gate ownership |
| **Frontend B** | Storefront + Marketplace pod | buyer surfaces, themes, performance budgets |
| **AI** | Ignite pod (grows at R5) | proposal engine, model ports, honesty/telemetry laws |
| **Platform/Infra** | 1 pod | CI, embedded→managed PG path, observability, secrets, regional posture, extraction rehearsals |
| **QA** | embedded per pod + 1 platform QA | acceptance suites, race/load tests, red teams; owns the *permanence* of black-box suites |

Principal reviewers rotate **across** pods (the reviewer never reviews their own pod's batch — independence is the discipline's active ingredient).

## 7. Milestones

**M1** ✅ Constitutional freeze + working core (today). **M2** Real identity live; dev-mode retired from every path (R1-B1). **M3** Stock ledger green under flash-race tests (R1-B2). **M4 — keystone:** one real end-to-end sale on staging: Ignite store → tracked product → reserved checkout → captured sandbox payment → packed shipment → first-sale ceremony fires from `orders.order.confirmed` (R1-B9). **M5** Real-money GA gate passed (PSP live, legal/compliance R-c review, PCI SAQ-A attestation) — private alpha starts. **M6** Store experience complete; 100 design-partner merchants onboarded via Ignite (R2). **M7** Marketplace live to the public (R3) — the launch. **M8** Copilots on (R5) with reversal budgets holding; Analytics narrative live (R6).

## 8. Production Readiness Gates (platform-wide, before M5/M7)

Security review + external pen test (auth, buyer gate, payment boundary) · load tests: checkout race profile, browse profile, webhook storm · observability: dashboards + alerting for outbox depth, dead letters, reconciliation discrepancies, gate-chain health (closing the long-standing debt item) · backup/DR drill with restore-time target · data-retention/PII audit vs manifest declarations · legal/compliance gate (ADR-008 R-c) · accessibility audit (WCAG AA across buyer+merchant surfaces) · runbook set (payment incident, oversell storm, PSP outage) · on-call rotation staffed.

## 9. Launch Strategy

**Phase 1 — Private alpha (post-M5):** 10–20 design-partner merchants, real money, concierge support; Ignite is the only door (it *is* the pitch). Success: Time-to-First-Deal median, zero Sev-1 money incidents. **Phase 2 — Closed beta (M6):** invite-scaled to ~100s of merchants; storefront links shareable (merchants bring their own buyers — the launch-card loop); marketplace surfaces dark. **Phase 3 — Public launch (M7):** marketplace + Deals open; the two-sided moment with supply already on the shelves. **Phase 4 (M8):** copilots as the retention story. Kill-switches per capability; every phase gate has rollback semantics (capabilities off, never code out).

## 10. Recommendations

1. Staff the Orders+Payments pod first and fully — seven critical-path batches live there.
2. Author BLUEPRINT-004 + CDC-002 immediately (R1-B4 is unblocked *today*; everything after it queues on the contracts).
3. Select PSP #1 this quarter against the connected-accounts requirement (ADR-008 rec. 2) — it gates R1-B7/B8 procurement lead time.
4. Do not let Release 2 polish absorb critical-path staffing: the storefront must be *good enough to sell from* at M4, beautiful by M6.
5. Keep the review rotation independent and the acceptance suites permanent — the discipline's track record (real H-severity finds in every cycle) is the roadmap's actual insurance policy.
6. Revisit this roadmap at each milestone; re-baseline batch estimates against actuals after M4 (the first cycle with all four workstreams running).

---

*The roadmap in one sentence: one straight line to a real sale, everything else built in parallel around it, every batch through the same five-stage crucible that has caught a real defect every single time — and no launch until both sides of the marketplace have a reason to show up.*
