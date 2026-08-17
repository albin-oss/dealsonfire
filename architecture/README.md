# architecture/ — the map (read this first)

Status legend: **FROZEN** (constitutional — conflicts resolve in its favor) ·
**ACTIVE** (current design, binding) · **SUPERSEDED** (kept for history — do not implement from it).

## The constitutional core (FROZEN — read in this order)
`ADR-001` merchant domain · `ADR-002(-A)` commerce domain · `ADR-003` platform integration ·
`ADR-004` data constitution · `ADR-005` Ignite/AI · `ADR-006` merchant commerce operations ·
`ADR-007` order management · `ADR-008` payments · `CDC-001` operations contracts ·
`DESIGN-SYSTEM-001` · `ENGINEERING-STANDARDS-001` · `UX-BIBLE-001`.

## Commerce Foundation (`commerce/`)
| Document | Status |
|---|---|
| COMMERCE_ARCHITECTURE / CAPABILITY_MAP / ORDER & CHECKOUT state machines / SHIPPING / RETURNS / DOMAIN_EVENTS / IMPLEMENTATION_ROADMAP | **ACTIVE** (founder-approved; roadmap carries the amendment deltas) |
| PAYMENT_REALITY_REVIEW · PAYMENT_POLICY_DECISION · CONNECT_FUNDS_FLOW · PAYMENT_METHOD_SUPPORT_MATRIX · COMMERCE_BLUEPRINT_AMENDMENT_001 | **ACTIVE** (the approved Option A payment corpus) |
| **UPDATED_PAYMENT_LIFECYCLE** | **ACTIVE** — the payment lifecycle of record |
| **PAYMENT_LIFECYCLE** | **SUPERSEDED** by UPDATED_PAYMENT_LIFECYCLE (capture-on-fulfillment was rejected — see the banner in the file) |
| BUYER_* (trust + emotional sets) · MERCHANT_* set · THE_DOF_FEELING · THE_DOF_WORKSHOP · DOF_SIGNATURE_EXPERIENCES · MOMENTS_WORTH_SHARING | **ACTIVE** (founder-approved experience corpus; the checklists bind C3–C12) |
| UI_IMPLEMENTATION_CONTRACT | **ACTIVE — binding on every increment** |
| PRR_C3_C5 · OPERATIONS_REALITY_REVIEW · LONG_TERM_MAINTAINABILITY_REVIEW | **ACTIVE** (review verdicts + their standing gates: no real Stripe keys pre-restructure; C6 definition-of-done) |
| **REAL_MONEY_READINESS_REVIEW** | **ACTIVE** — the C10 launch gates G1–G9 (binding DoD); its two-phase boundary amendment is written law in UPDATED_PAYMENT_LIFECYCLE §7 |
| **C10_REPOSITORY_READINESS_REVIEW** | **ACTIVE** — the pre-certification repository audit + the C11 debt register |
| **COMMERCE_FOUNDATION_RETROSPECTIVE** | **CLOSURE** — the Principal Engineer's retrospective that formally closes C1–C10; binding pattern/anti-pattern reference for C11+ |
| FOUNDER_REVIEW_C6_C9 | **RECORD** (the operational campaign's closing packet) |
| C11_MERCHANT_EXPERIENCE_VALIDATION | **RECORD** (the payout copy read as the maker; five binding corrections, applied) |
| **C11_PRODUCTION_CERTIFICATION** | **CLOSURE** — the live Stripe payout certification (GO, v1.43.0): two real payouts, four-view equality, the five certification repairs, the closure-unblock findings. **The Commerce Program C1–C11 is complete and externally proven.** |
| POST_COMMERCE_STRATEGIC_REVIEW · POST_COMMERCE_ROADMAP | **RATIFIED** — the five-phase direction after commerce (Launch Foundations → Living Street → Merchant Evidence → Trust & Reputation → AI on real signals) |
| C12_LAUNCH_FOUNDATIONS_PROGRAM_PLAN · C12_PRINCIPAL_ENGINEER_REVIEW · C12_2_READINESS_REVIEW | **APPROVED** — the stranger test, the three increments, the PE corrections, the amended C12-2 scope |
| MAIL_PROVIDER_DECISION | **DECIDED** (Founder-delegated) — Resend behind MailPort; portability recorded |
| **C12_1_EXTERNAL_CERTIFICATION** | **CLOSURE** — The Letters Arrive (GO, v1.44.0): real provider + real inbox walk, the payout.paid race found and fixed, binding production-mail cutover gates |
| **C12_2_CERTIFICATION** | **CLOSURE** — Locks for Strangers (GO, v1.45.0): durable HMAC rate limits, one-time WebAuthn ceremonies, named boot refusals, the audited abuse loop with enforcement_hold semantics preserved to the cent, the webhook invariant generalized |

Operational runbooks live in `docs/runbooks/` — `order-reconstruction.md` (support
reconstructs any order without SQL, incl. the §7 provider-operation journal) and
`reconciliation.md` (disputes, external reconciliation, risk pause/resume).

## Everything else (top level)
Blueprints (`BLUEPRINT-*`), reviews (`REVIEW-*`), UX packages (`UX-*`), and execution
docs (`EXEC-*`, `WP-*`, `CER-*`) are historical working documents: accurate at their
date, superseded where any FROZEN/ACTIVE document disagrees. When in doubt, the ADR wins.
