# DOF Platform — REVIEW-OPS-001

# Principal Engineer Review — Operations Batch 1 (Locations + Ghost Location)

**Reviewer:** independent Principal Engineer (adversarial production gate) · **Date:** 2026-07-07
**Scope:** OPS-001A exactly — migration 0006, Location aggregate, Ghost policy, PgLocationRepository, operations event store/outbox/audit, MerchantAccessPort integration, Location API, event registration, contract snapshots, tests, CI gates. Inventory and future modules not reviewed.
**Method:** code read against the frozen stack (Constitution, ADR-001…006, BLUEPRINT-003 v1.1, OPS-001-BLUEPRINT, CDC-001, DECISIONS.md, REVIEW-001/002/003 precedents) plus **empirical probes against embedded PostgreSQL** where a suspicion warranted evidence. No code was modified; the one probe test was written, run, and deleted.

---

## Executive Summary

OPS-001A is disciplined, idiomatic, and close to exemplary in its plumbing: the quartet mirrors the proven 0004 shapes, L1 has a real database big brother, the Ghost is race-proof (20-way test), the first cross-domain consumer is correctly ledgered and deliberately non-load-bearing, and the new `check:operations` gate seeds CDC-001's lock discipline. The review nevertheless found **one HIGH defect — empirically confirmed**: the aggregate's detected-change comparison for addresses is defeated by PostgreSQL's jsonb key reordering, so a PATCH carrying an unchanged address emits a spurious `location.updated` event — a violation of constitutional law D-29, the exact defect class REVIEW-003 H-1 established as high-severity. Four MEDIUMs (derived ghost flag that mislabels a renamed default, a GET that writes, missing test classes, a capability-gating edge on tier downgrade) and six LOWs round out the findings. **Verdict: PROCEED WITH CONDITIONS.**

---

## Findings

### H-1 — jsonb key reordering defeats the address no-op detection (D-29 violation) — CONFIRMED EMPIRICALLY

- **Category:** Domain Model / Event System · **Files:** `domains/operations/locations/domain/location.ts:162`, `domains/operations/locations/infrastructure/location-repository.ts:46`
- **Technical explanation:** `Location.update()` compares `JSON.stringify(changes.address) !== JSON.stringify(this.props.address)`. The stored side is the raw jsonb object from PostgreSQL, which **canonicalizes key order (length, then byte order)**; the incoming side is the VO's insertion order. Probe output against embedded PG: stored `city,line1,line2,postal,region,country` vs fresh `line1,line2,city,region,postal,country` → `stringify equal: false` for identical content.
- **Production impact:** every PATCH that includes an unchanged address (the common "edit form resubmits everything" client pattern) emits `operations.location.updated { fields_changed: ['address'] }`, bumps the aggregate sequence (inviting optimistic conflicts), writes an audit row, and dispatches to every future consumer — noise that D-29 exists to forbid ("events describe DETECTED change; no-ops are silent"). The same class of bug (`operating_window`) is currently masked only because the repo's reconstruction happens to match the VO's key order — fragile, not correct.
- **Recommendation:** compare canonically — field-by-field VO equality (an `addressEquals`/`windowEquals` helper) or stable-key serialization; add the regression test with a jsonb round-tripped aggregate. Fix is ~15 lines.
- **Blocks next sprint:** YES — Batch 2's StockItem adopts the same aggregate idioms; the broken comparison pattern must not be copied.

### M-1 — the ghost flag is a derived heuristic, and it lies after a rename

- **Category:** Domain Model / API · **Files:** `application/dto.ts:40`
- **Explanation:** `ghost: isDefault && kind === 'home'` is computed, not persisted. A merchant who (with a second location present, hence visible) renames the default to "My kitchen" still gets `ghost: true`; if the second location later closes, clients following the DTO contract will hide a location the merchant explicitly named. System-authorship is a fact known at creation; deriving it discards it.
- **Impact:** UI mislabeling/hiding of a customized location; semantic drift in every future consumer of the flag.
- **Recommendation:** persist the fact (a `system_authored`/`ghost` column, set only by `createGhost`) or clear ghost-ness on first merchant mutation — decide and record in DECISIONS. Column add is cheap now (one migration in Batch 2), painful after UI ships.
- **Blocks next sprint:** NO — but must land before any UI consumes the flag.

### M-2 — ListLocations is a GET that writes

- **Category:** API / Security / Performance · **Files:** `application/queries/locations.ts`, `locations.get.ts`
- **Explanation:** the list query lazily ensures the Ghost — an INSERT plus event plus audit inside a safe-method request, taken under a per-business advisory lock on **every** list call. OPS-001-BLUEPRINT did specify lazy ensure on the query, so this is a *blueprint-inherited* smell rather than an implementation deviation — but the review must flag it: (a) HTTP semantics: GET must be safe; retries/proxies/prefetchers may now write; (b) authorization asymmetry: a `support_agent` holding read-grade `store.view` triggers a system write from a read gate; (c) the advisory lock serializes concurrent lists per business needlessly once the ghost exists.
- **Impact:** low practical risk today (idempotent, system-authored) but a precedent the platform should not normalize.
- **Recommendation:** short-circuit before locking (`findDefault` first, lock only on miss — removes the steady-state lock), and record the accepted GET-write exception in DECISIONS with its rationale (the product-created consumer already covers the common path; the lazy ensure is the belt for pre-0006 businesses). Optionally skip ensure for read-grade memberships.
- **Blocks next sprint:** NO.

### M-3 — missing test classes

- **Category:** Testing · **Files:** `tests/integration/operations/locations.test.ts`
- **Missing:** (1) **rehydration-guard** integration test (corrupt `kind`/`status` row → InfrastructureError) — the commerce precedent has one; the guard is currently dead-untested code; (2) **sequence-guard concurrency** (two parallel PATCHes on one location → exactly one wins, one gets the retryable conflict); (3) **consumer negative path** (a `digital` product must NOT create a ghost — only the positive path is asserted); (4) **Idempotency-Key replay** on create-location (pattern proven elsewhere, unproven on this endpoint).
- **Impact:** untested invariants rot; Batch 2 inherits the suite as its template.
- **Recommendation:** add all four; ~80 lines total.
- **Blocks next sprint:** YES (cheap, and the suite is Batch 2's template).

### M-4 — update/close require the creation capability: tier downgrade strands locations

- **Category:** Security / Policy · **Files:** `update-location.ts`, `close-location.ts` (spec `capability: 'ops.locations'`)
- **Explanation:** `ops.locations` is Growth-gated. A business that created locations at Growth and later lapses to Starter loses the *capability*, and with it the ability to rename or **close** its own existing locations — trapping state the merchant can no longer manage (and L2/L1 make closure the only exit path).
- **Impact:** support tickets and a Trust-Fabric sour note at exactly the moment (downgrade) the relationship is fragile.
- **Recommendation:** keep the capability on CREATE; gate update/close on permission only (`ops.location.write`) — managing what exists is not the tier line, creating more is. Matches the PRODUCT_TIER_LIMITS philosophy (caps creation, never management).
- **Blocks next sprint:** NO — but decide before merchants exist.

### LOW findings

- **L-1** `operationsOrderingScopeOf` lives in `locations/domain/events.ts` but is domain-wide wiring (container imports it; Batch 2 stock events will extend it) — move to `shared-kernel` with the event helper. *(Maintainability)*
- **L-2** The ghost consumer closure in `container.ts` references `operationsDeps`, declared ~40 lines later — safe at runtime (invoked post-construction) but a refactor away from a TDZ crash; hoist the operations block above the commerce dispatcher. *(Maintainability)*
- **L-3** `hashtext()` is 32-bit: distinct businesses can share an advisory lock key. Correctness unaffected (spurious serialization only); note it, or use `pg_advisory_xact_lock(hashtextextended(...))`/two-int form. *(Performance, cosmetic)*
- **L-4** `update-location.ts:34/40` — the `x ? undefined : x` initializer is correct but hostile to the next reader; restructure. *(Readability)*
- **L-5** `GET /locations` returns an unbounded list — acceptable for a per-business cardinality of dozens, but state the bound in the OpenAPI description so the exception is deliberate. *(API)*
- **L-6** The contract lock hashes whole source files, so *additive* changes also fail until `--update` — stricter than CDC-001's additive-only intent. Already registered as debt (D-38h); keep until `check:contracts` generalizes. *(Process, accepted)*

---

## Checklist Assessment

| Area | Verdict |
|---|---|
| **Architecture** | Clean: strict downward deps, domain pg-free, structural MerchantAccessPort reuse (no new adapter), composition-root-only cross-domain touch, OB-1 shared-kernel ports honored. L-1/L-2 are polish |
| **Database** | Quartet faithful to 0004 (seq identity, D-02 exception, partitioned audit + 12 pre-seeded partitions + housekeeping); `uq_locations_default` is textbook L1 enforcement; L4 window CHECK present; grants extended incl. partitions; forward-only per house law (no rollback scripts by design). No schema issues found |
| **Domain** | L1–L4 implemented and unit-proven; D-29 discipline intended but broken for jsonb VOs (H-1); close idempotent; educating error copy throughout |
| **Events** | Ordering scope correct (business-scoped); exactly three payloads registered (M-6 lock respected — no future events); emission-vs-schema sweep test present; replay-ready via standard ledger |
| **API** | RFC 9457 + stable codes (`LOCATION_HAS_STOCK` added properly), masking sweep tested, step-up on close, idempotency headers supported (replay untested — M-3); GET-writes (M-2) |
| **Security** | Triple gate everywhere; staff/AI absent from `ops.location.write` (CDC AI-forbidden list starts in the matrix — good); PII kept out of digests and payloads; tier edge M-4 |
| **Testing** | 20 new tests incl. the 20-way ghost race, consumer replay idempotency, L1 index kill-test, cross-domain leak check — strong; four missing classes (M-3) |
| **Performance** | Single-row locks, short transactions, partial-index-served findDefault; steady-state advisory lock on list (M-2) is the only avoidable cost |
| **Maintainability** | Excellent doc-comments citing invariants/decisions; naming consistent with the kernel; L-4 aside |
| **Operational readiness** | Outbox drains clean, partitions auto-extend, dead-letter path inherited; no dashboards yet (platform-wide debt, unchanged) |

## Scores

**Architecture: 9.3/10** · **Engineering: 8.6/10** (H-1 and the untested guard cost it) · **Production Readiness: 8.4/10**

## Strengths

The Ghost design (advisory-lock belt + partial-unique suspenders + freshness-only consumer) is the best-engineered piece of concurrency-sensitive code in the domain layer to date; the first cross-domain consumer was pioneered exactly where failure is harmless; `check:operations` makes contract drift a CI fact; educating error copy is uniformly excellent; the payload-sweep test institutionalizes the REVIEW-003 lesson.

## Weaknesses / Technical Debt

H-1 (comparison correctness), derived ghost flag (M-1), GET-write precedent (M-2), the four missing test classes (M-3), tier-downgrade management gap (M-4); accepted debt: source-hash locks (L-6), no SetDefaultLocation until multi-location tooling, `noStockRecordedYet` port (honest, replaced in Batch 2).

## Required Fixes (conditions)

1. **H-1** — canonical VO equality for address/window + jsonb round-trip regression test. *(Blocks Batch 2.)*
2. **M-3** — the four missing test classes. *(Blocks Batch 2 — the suite is the template.)*
3. **M-1** — persist or clear ghost-ness; record the decision. *(Before any UI consumes the flag.)*
4. **M-2** — short-circuit the ensure before locking; record the GET-write exception in DECISIONS. *(Before Batch 2 copies the query pattern.)*
5. **M-4** — drop `capability` from update/close specs (permission-only) or record the contrary decision. *(Before merchants exist.)*

## Nice-to-have

L-1 move ordering scope to shared-kernel (do it in Batch 2's natural touch) · L-2 hoist the operations block · L-3 lock-key note · L-4 readability · L-5 OpenAPI bound note.

## Proposed DECISIONS updates

- **D-39 (proposed):** "jsonb-backed VOs are compared by canonical field equality, never JSON.stringify — PostgreSQL canonicalizes jsonb key order (empirically: `city,line1,…` vs insertion order). Applies to every aggregate storing VO documents." (The D-29 companion rule.)
- Amend **D-38** with: the ghost-flag persistence decision (M-1), the accepted-and-bounded GET-write exception (M-2), and the capability-on-create-only gating rule (M-4).

## Recommendation

# PROCEED WITH CONDITIONS

Merge after Required Fixes 1–2 land with green gates (an afternoon, not a rework); fixes 3–5 are decision-plus-small-change items that must land before Batch 2 completes. The batch's foundations — quartet, Ghost, consumer, gates — are production-grade and safe for Batch 2 to build on; the conditions exist precisely because Batch 2 will *copy this code as its template*, and templates must not carry a confirmed constitutional-law violation.
