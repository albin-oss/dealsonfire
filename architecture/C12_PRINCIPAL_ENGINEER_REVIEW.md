# C12 PRINCIPAL ENGINEER REVIEW — Launch Foundations, implementation readiness

**Status:** For Founder authorization of C12-1 · 2026-08-09
**Scope:** NOT a strategic review. The roadmap and C12's purpose are accepted. One question only: **is the proposed C12 implementation the simplest safe way to make the seven stranger-test statements true?** — challenged by the engineer who maintains it for ten years.
**Method:** every claim below was checked against code (ports, schemas, the dispatcher, the gates), not against the program plan's own prose.

---

## A. Mail delivery — the plan's semantics were subtly dishonest; corrected here

**Finding A1 (design constraint the plan missed).** Outbox consumers run their handler **inside the delivery transaction** (`OutboxConsumer.handle(tx, event)`, delivery-ledger insert in the same tx). A real provider call inside `handle` would (a) violate the §7 law — no network inside an open transaction — and (b) produce duplicate emails on crash-after-send-before-commit. The C11 sandbox never exposed this because `SandboxMailer` is an in-memory push.

**Correction (binding for C12-1):** the mail consumer composes and journals the letter in-tx; the provider call happens outside, and carries a **provider idempotency key derived from the delivery identity `(consumer, event_id)`**. Most transactional providers honor idempotency keys; where the chosen one doesn't, the send journal itself dedups retries.

**Finding A2 (honest wording).** The plan's "exactly once under event replay" must not be read as exactly-once *email delivery* — no such guarantee exists on SMTP. The technically honest contract:
- **exactly-once composition** per (consumer, event) — ours, ledger-proven;
- **at-least-once handoff** to the provider, collapsed to once *at the provider* by the idempotency key;
- **delivery itself is the provider's and the receiving server's world** — outcomes come back as bounce/complaint facts, never assumed.

**Finding A3 (the table was too big).** `mail_delivery_facts` as proposed conflated three things with different truths:
- *send facts* — already owned by the delivery ledger (+ the provider's idempotency window); duplicating them creates a second authority. **Not persisted.**
- *bounce/complaint facts* — genuinely new state, arriving via the provider webhook, keyed by recipient + provider message ref. **This is the table.**
- *suppression* — a **derived read** over bounce facts (hard bounce ⇒ suppress non-critical), not stored state. An index on (recipient) suffices at launch scale; a projection is fashion until measured.

**Verdict: REPLACE `mail_delivery_facts` → `mail_bounces`** (append-only bounce/complaint facts; recipient, kind, provider ref, occurred_at, letter identity when the provider echoes it). One authoritative truth per fact. Retention and PII: §Part-7 table.

## B. Durable rate limiting — Postgres survives the attack; three corrections

Conceptual attack on the fixed-window row design (`(key, window_start) → count`, atomic `INSERT … ON CONFLICT … SET count = count + 1 RETURNING`):

- **Atomicity under concurrent instances:** the upsert is atomic; two instances race to one row and both see honest counts. ✓
- **Hot-key contention:** one row-lock per increment per key-window. At launch budgets (≤300/min/key) this is trivially inside Postgres comfort. Revisit trigger recorded: sustained >50 increments/sec on one key.
- **Cleanup/retention:** opportunistic deletion of expired windows on write (bounded `DELETE … LIMIT`), no new scheduled job. ✓
- **Correction B1 — IPv6:** raw v6 keys let one host rotate through 2^64 addresses. Public keys must normalize to **/64 for IPv6** (v4 stays exact) before hashing.
- **Correction B2 — don't store raw IPs:** the bucket key must be an **HMAC of (scope, normalized address)** with a server secret. Rate limiting needs equality, not recall; the safest personal datum is the one never persisted.
- **Correction B3 — header trust stated, not assumed:** `x-forwarded-for` is trusted **only because the deployment platform sets it**; the boot-time production gate must refuse a deployment posture where the app is directly internet-reachable. NAT/shared-IP fairness is acceptable at current generous budgets; the abuse-report endpoint additionally dedups per (subject, reporter) so shared IPs cannot be weaponized to silence a shop.

**Verdict: Postgres KEEP.** Redis/KV would be a second infrastructure for a first problem we do not have. The `RateLimiter` seam makes that swap mechanical if measurements ever demand it. (Port becomes async — a small, type-checked call-site sweep.)

## C. WebAuthn challenges — dedicated tiny table stands; reuse examined and rejected

`user_recovery_tokens` was examined for reuse: it is user-bound (`user_id NOT NULL`) and purpose-shaped for possession proofs. WebAuthn **authentication** ceremonies are anonymous (`authentication-options` is a public endpoint — the caller is not yet anyone), so reuse would force a nullable-user carve-out into a table whose invariant is "belongs to a user." Rejected; the invariants differ.

`webauthn_challenges` (ceremony id PK, challenge **hashed at rest**, nullable user binding, 5-min TTL, consumed_at): one-time consumption via `DELETE … RETURNING` (take = consume, atomically — parallel ceremonies are simply distinct rows; replay of a consumed ceremony finds nothing). Opportunistic TTL cleanup on write. The `ChallengeStore` port goes async; `MemoryChallengeStore` remains the test binding. **Verdict: KEEP as proposed.**

## D. Abuse reporting — typed, deduped, and one semantics correction to the plan

**Not a dumping ground:** `subject_type` is a **closed enum** (`store | product | deal | spark | order`), `subject_ref uuid NOT NULL`, reason from a closed list, free text bounded. `UNIQUE (subject_type, subject_ref, reporter_id)` makes flooding one subject idempotent per reporter. Reporter is the pseudonymous visitor id (or user id) — never contact details in free text by design of the form. No linkage to future Trust & Reputation architecture: the row is a *report*, not a reputation event; Phase 4 reads it, never reshapes it.

**Correction D1 — the plan silently broadened `enforcement_hold`.** Verified semantics in code: `enforcement_hold = 'none'` is a **conjunct in every public read** (storefront resolution, home/shops feeds, search, carts, checkout — 20+ sites). A held store therefore **vanishes behind the masked-404 gate**; it does not show a "closed for review" page. The program plan's acceptance criterion ("the storefront answers 'this shop is closed for review'") would have changed the meaning of an existing enforcement state in passing. **Corrected:** C12-2 adopts the existing semantics unchanged — held ⇒ invisible, till closed by the same gates. A buyer-facing closed-shop surface is a Phase-4 decision, recorded as deliberately NOT built now. Also verified and preserved: `enforcement_hold` does not touch payout machinery (that is `risk_paused`, a payments-owned state) — in-flight money completes; freezing a suspect's payouts is likewise a Phase-4 policy question, not a C12 side effect.

**Verdict: KEEP `abuse_reports` + the two operator commands + the alarms arm, with D1 applied.**

## E. Buyer account — trimmed to the stranger minimum; claim machinery verified

Against the six verbs, with the settings-product temptation refused:

- *create / authenticate / recover*: exist; C12-1 makes their letters real. No new work beyond wiring verification into required flows.
- *inspect*: one `/account` page — orders (account-bound, surviving cookie loss), email, sessions, passkeys. Nothing else. No addresses, no preferences, no profile.
- *change*: email-change is the one genuinely new flow (recorded WP-R1-B1 debt). Race rules fixed here: possession of the **new** address + step-up to initiate; the **old** address is notified and **recovery initiated from the old address wins for 72h** (the account-takeover reversal window); recovery tokens outstanding at change-time are invalidated.
- *protect*: session revocation and passkey removal exist; both step-up-gated (passkey removal verified as requiring step-up in C12-3's security checkpoints).
- **Guest order access: REUSE `guest_tokens`** (`scope_type='order'`, hashed at rest, 30-day TTL — the dormant machinery fits exactly; no new table, no PII in URLs beyond the token). The confirmation letter carries the link; cookie loss stops mattering; no registration nag.
- **Claim collision:** `identity_claims` binds a visitor id at register/login. C12-3 must pin the rule *first claim wins, second claim gets nothing silently* (order history is not divisible) with a test — the current machinery implies it; the invariant deserves a name and a proof.
- **Enumeration:** the existing enumeration-proof construction (identical answers, always-hash) is preserved by making the verification letter the only observable difference — "an account exists" and "an account was created" letters are indistinguishable in timing and response.

**Verdict: scope stands, minus one table (guest links ride `guest_tokens`), plus the named claim invariant.**

## F. Legal consent — mechanism, not law

Distinct legal natures (contractual acceptance / privacy acknowledgment / telemetry consent where applicable) share one **mechanism**: an append-only `consent_facts` row — (person, document_id, document_version, action ∈ {accepted, acknowledged, granted, withdrawn}, occurred_at, surface). Which documents exist, which action each requires, at which surfaces, and what withdrawal means are **configuration counsel fills in** (a document registry — data, not code). Versioning: a new version is a new document_version; whether re-consent is required is counsel's row to set. No banner behavior, no legal conclusion, no retention decision is encoded in schema. Audit logs are exhaust and cannot serve as the provable consent record — a queryable, append-only fact table is the minimum honest mechanism. **Verdict: KEEP, exactly this narrow.**

## G. Backup / restore drill — guardrails as code, not prose

The drill must be structurally incapable of touching production:
1. The drill script takes **no default target**: it requires `NUXT_DRILL_TARGET_URL`, refuses to read `NUXT_DATABASE_URL`, and exits if the target host or database name matches a deny-pattern registry that includes the production identifiers.
2. The target database must be **empty or suffixed `_drill`**; anything else is a hard refusal.
3. Production credentials are **absent from the drill environment by construction** (separate env file; the script verifies the production keys are NOT set).
4. The drill is complete only when the restored environment passes the money invariants (L1–L3 recompute), the order-reconstruction runbook, and row-count parity — recorded with date and observed RPO/RTO in a drill report.

**Verdict: the plan's criterion ("we proved we can recover") stands; these guardrails become C12-3 acceptance criteria.**

---

## Part 7 — Data classification of every new persisted field-group

| Store | Fields | Purpose | Owner | PII | Retention | Deletion | Audit | Hash/HMAC | Authority |
|---|---|---|---|---|---|---|---|---|---|
| `mail_bounces` | recipient, kind (bounce/complaint), provider_ref, letter identity, occurred_at | delivery outcomes; derive suppression | platform (mail) | **email = PII** | 12 months then hard-delete (operational exhaust) | scheduled | no (is itself a fact log) | provider_ref plain; recipient plain (needed for suppression equality + ops) | authoritative fact |
| `rate_limit_buckets` | key_hmac, window_start, count | abuse throttling | platform (security) | none persisted (**HMAC of scope+normalized addr; raw IP never stored**) | expired windows deleted opportunistically | on write | no | HMAC required | authoritative, rebuildable-by-nature (loss = one open window) |
| `webauthn_challenges` | ceremony id, challenge_hash, user_id?, expires_at | ceremony one-time state | identity | user linkage only | 5-min TTL; opportunistic delete | on consume/expire | ceremony outcome already audited | challenge hashed | authoritative, ephemeral |
| `abuse_reports` | subject_type, subject_ref, reporter (visitor/user id), reason, note, created_at, resolved fields | safety intake | operations (ops) | pseudonymous reporter id; free text may incidentally contain PII (bounded, flagged sensitive) | 24 months (safety history) then review | operator path | yes — every decision audited | no | authoritative |
| `consent_facts` | person, document_id, version, action, occurred_at, surface | provable consent | identity | user linkage | as counsel directs (default: life of account + statutory) | counsel-directed | append-only (is the record) | no | authoritative, append-only |
| *(guest order links)* | — rides existing `guest_tokens` | order access sans account | identity | token hashed; scope ref | existing 30-day TTL | existing | existing | existing hash | existing |

Unnecessary storage removed relative to the plan: raw IPs (never persisted), send facts (delivery ledger + provider idempotency own that truth), suppression rows (derived).

## Part 8 — The table challenge, verdict per table

| Proposed | Irreducible state | Why no existing primitive | Enforceable invariant | Lost? | Reconstructible? | Duplication temptation | **Verdict** |
|---|---|---|---|---|---|---|---|
| `mail_delivery_facts` | *only* bounces/complaints are irreducible | delivery ledger already owns send truth | suppression correctness | outcomes unknown, re-sends risk annoyance | no (provider may retain) | Phase-3 digests must READ it, not re-record | **REPLACE → `mail_bounces`** |
| `rate_limit_buckets` | live window counts | ports exist, no durable backing | budget holds across instances | one window of grace | yes (self-heals) | none | **KEEP** |
| `webauthn_challenges` | in-flight ceremony | recovery tokens are user-NOT-NULL, wrong invariant | one-time consumption | in-flight logins retry | yes (re-issue) | none | **KEEP** |
| `abuse_reports` | the report itself | timeline is order-scoped; audit is exhaust; alarms are derivations | per-reporter dedup; decision trail | safety history lost | no | Phase 4 reads, never re-shapes | **KEEP** |
| `consent_facts` | provable consent | audit is not a provable, queryable record | append-only provability | legal exposure | no | none | **KEEP** |
| *(implicit 6th: guest order links)* | none — scope fits `guest_tokens` exactly | — | — | — | — | — | **REUSE, no table** |

Net: **five tables stand, one narrowed to a smaller truth, one planned store replaced by reuse.** The count was never the goal; single authoritative truths were.

## Part 9 — Increment boundary review

The three boundaries survive the dependency re-check; no change for novelty's sake. Adjustments from this review folded in: suppression-as-derived (C12-1), the D1 enforcement-semantics correction (C12-2), `guest_tokens` reuse and the claim invariant (C12-3).

| | Independently releasable | Demonstrable | Rollback-safe | Hidden later-increment dependency | Living Street leakage | Legal blocking | Premature infra |
|---|---|---|---|---|---|---|---|
| C12-1 Letters | ✓ (adapter behind port; sandbox stays default until cutover) | real inbox journey | ✓ (rebind port) | none | none | none | none (no queue — outbox is the queue) |
| C12-2 Locks | ✓ (adapters + additive tables) | hold/lift + cross-instance limits + passkey-across-deploy | ✓ (memory bindings remain for tests; tables additive) | letters for acknowledgments are graceful-degrade, not hard | none (alarms arm, no dashboards) | none | none (Postgres only) |
| C12-3 Person & recovery | ✓ | guest-link + claim + drill journeys | ✓ (page + flows additive) | needs C12-1 (delivered mail) — forward-only ✓ | none (account page is not personalization) | **legal pages ship gated; engineering never waits on wording** | none |

## Part 10 — Mail provider (the one vendor decision)

Requirements the choice must satisfy: EU data residency / GDPR processing posture with a DPA · transactional-grade deliverability and reputation isolation (dedicated transactional stream, no marketing pool) · signed bounce/complaint webhooks · idempotency-key support on send (A1) · clean HTTP API with sandbox mode · domain authentication (SPF/DKIM/DMARC alignment on a DOF-controlled sending domain) · usable free/low tier at launch scale (≪10k letters/month) · exportable suppression data (portability).

**Reversibility:** genuinely reversible behind `MailPort` — the adapter surface is one send method plus one webhook route; bounce facts are provider-neutral by design. **Recommendation: authorize engineering to select the provider against these requirements during C12-1**, with the choice and its DPA recorded in the cutover document. No integration has been performed.

---

## C11 FINAL STATUS

**FORMALLY CLOSED.** Certification GO (two real payouts, four-view equality, 18/18 reconciliation, recompute-clean ledger); closure-unblock findings fixed and recorded; the complete release gate ran green as one clean run; `increment/c11-payouts` merged to `main` through the release law; **v1.43.0** tagged on the verified merge commit; indexes updated; main verified from a clean checkout with no uncommitted production changes. The Commerce Program C1–C11 is complete.

## C11 CLOSURE EVIDENCE

Recorded in `architecture/commerce/C11_PRODUCTION_CERTIFICATION.md`: the live payout river (payouts `po_1U1dMb…`/`po_1U1uQX…`, paid webhooks, replay convergence, crash recovery, live key rotation, dispute freeze→won), final reconciliation 18/18 matched with payout identity, `{clean: true, drift: []}` ledger recompute, empty alarm queue, the five certification repairs, and the three closure-unblock findings (combobox ARIA defect fixed at the DOF boundary with a regression suite proven to fail 4/4 unfixed; worker-contention cause-fix; scan-vs-animation determinism fix) — history preserved as it happened, including the sweeps that stopped closure twice.

## C12 PLAN VERDICT

**Sound, with corrections applied.** The plan is the simplest safe path to the seven stranger-test statements *after* this review's amendments: honest mail semantics with the §7-compliant consumer shape (A1/A2), the narrowed bounce table (A3), hashed rate-limit keys with /64 normalization (B1–B3), the enforcement-semantics correction (D1), `guest_tokens` reuse and the named claim invariant (E), consent-as-mechanism (F), and drill guardrails as acceptance criteria (G).

## COMPONENTS TO KEEP

Postgres-backed `rate_limit_buckets` and `webauthn_challenges` behind the existing ports (both ports going async) · `abuse_reports` + two operator commands + the alarms arm under existing enforcement semantics · `consent_facts` append-only mechanism · `/account` page at stranger-minimum scope · email-change flow with the 72h old-address recovery rule · the restore drill with structural guardrails · `workers: 1` and the finite-animation scan gate in the test harness.

## COMPONENTS TO REMOVE OR MERGE

`mail_delivery_facts` → **replaced** by `mail_bounces` (send truth stays in the delivery ledger + provider idempotency; suppression derived) · the planned guest-order-link store → **merged into existing `guest_tokens`** · the "closed for review" storefront copy → **removed from C12** (would have silently broadened `enforcement_hold`; Phase-4 decision) · raw-IP storage → removed everywhere (HMAC keys only).

## DATA MODEL VERDICT

Five small tables, every field classified (purpose/owner/PII/retention/deletion/audit/hash/authority), no raw IPs, no duplicated truths, one deliberate reuse. Manifest-first per ADR-004 for all five.

## INCREMENT BOUNDARY VERDICT

**Three increments confirmed** — independently releasable, demonstrable, rollback-safe; the only cross-dependency (letters before account flows) points forward; legal wording gates pages, never engineering.

## RISKS DISCOVERED

1. The in-tx consumer shape would have produced duplicate emails under crash — caught here, before a single letter was sent (A1).
2. The plan's enforcement copy would have silently redefined `enforcement_hold` (D1).
3. Raw-IP rate-limit keys would have created an unregistered PII store (B2).
4. Async-ification of two security ports touches call sites — mechanical but must not be rushed past type-checking.
5. Email-change/recovery interaction is an account-takeover surface; the 72h old-address rule must be tested hostilely, not just implemented.

## FOUNDER DECISIONS REQUIRED BEFORE C12-1

**None that block implementation.** The mail **provider selection** is recommended for delegation to engineering against the Part-10 requirements (reversible behind `MailPort`; choice + DPA recorded in the cutover document) — say the word and it is delegated. All other Founder items (market/legal identity, growth-values boundary, brand) remain before-public-launch, per the roadmap.

## RECOMMENDED C12-1 AUTHORIZATION

**Authorize C12-1 "The Letters Arrive"** as amended: §7-compliant mail consumer with provider idempotency keys, `mail_bounces` + derived suppression, the dispatch letter, delivered verification/recovery/ops mail, sandbox preserved — no other scope. On its acceptance evidence, C12-2 follows without a new strategic pause.
