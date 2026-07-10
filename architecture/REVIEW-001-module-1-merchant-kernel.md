# REVIEW-001 — Principal Engineer Review: Module 1 (Merchant Kernel)

**Date:** 2026-07-02 · **Reviewed against:** ADR-001 v1.1, BLUEPRINT-001 v1.0, DECISIONS.md, Engineering Constitution v1.0, Platform Bible v1.0
**Verification performed:** full test suite re-run (50 unit + 26 integration on real PostgreSQL), `check:boundaries` (45 files clean), `tsc --noEmit` clean, production `nuxt build` clean, greps for skipped tests / TODOs / placeholders / mocks (none found), plus targeted empirical probes (handle derivation, dispatcher ordering analysis).

---

## Findings

### HIGH

**H-1 — Outbox breaks per-business ordering under backoff**
*File:* `domains/merchant/core/infrastructure/outbox-dispatcher.ts` · *Violates:* BLUEPRINT §7 ("per-business ordering preserved")
When an event for business X fails and backs off (`next_attempt_at` in the future), the next `dispatchOne()` claims the *next* row for the same business and delivers it — younger events overtake older failed ones. For Module 1's only consumer (StandingConsequencePolicy) the damage window is small, but Module 2 wires Search/Community projections that assume ordered streams; delivering `store.published` before a failed `store.created` retries produces corrupt read models.
*Fix:* make the claim partition-aware — skip any pending row whose partition has an earlier row that is pending/backing off, e.g. `WHERE NOT EXISTS (SELECT 1 FROM outbox_events x WHERE x.partition_key = o.partition_key AND x.id < o.id AND x.status = 'pending')`, and add index `(partition_key, id) WHERE status = 'pending'`. A stuck head-of-line then holds only its own partition (dead-lettering after 10 attempts already unblocks it).
**Must fix before Module 2: YES.**

**H-2 — Vercel cron cannot invoke the dispatch route (GET vs POST)**
*File:* `server/api/internal/outbox-dispatch.post.ts` + `vercel.json`
Vercel cron issues **GET** requests; the route only answers POST → 405 on every tick. In production, events would only dispatch opportunistically after `publish` — standing changes, future verification events, and all housekeeping (partition creation, idempotency purge, outbox purge) would silently stall. This is the platform spine failing quietly.
*Fix:* rename to a method-agnostic handler (`outbox-dispatch.ts`) or add a `.get.ts` twin; keep the Bearer-secret check on both.
**Must fix before Module 2: YES** (one-line deployment blocker).

**H-3 — Handle derivation fails for non-Latin and reserved-colliding names**
*File:* `domains/merchant/core/application/handle-service.ts` (`deriveFromName`)
Empirically confirmed: `deriveFromName('毛糸の店' | '☕☕' | '!!!' | 'Store')` → `"store"` → reserved → `409 HANDLE_TAKEN` *with no fallback* (validation fails before the numbered-fallback loop runs). Every merchant with a non-Latin store name cannot create a store without manually supplying a handle. This violates ADR §9 ("never error on our own suggestion"), the Grandma Test, and the global-expansion mandate (ADR §2).
*Fix:* (a) when the slug is empty/too short/reserved, derive `store-<4 random alphanumerics>` and retry; (b) in `claimWithFallback`, treat a reserved-word validation failure on a *derived* handle as fallback-eligible, not terminal.
**Must fix before Module 2: YES** (Ignite, Module 3, sits directly on this path; fix is small and testable now).

### MEDIUM

**M-1 — Idempotency keys can wedge `in_flight` for 24h**
*File:* `domains/merchant/core/infrastructure/idempotency-store.ts`
`complete()` runs after the command transaction commits. A crash between commit and `complete()` leaves `response_status NULL`; every retry then gets `409 CONFLICT (in flight)` until the 24h purge. *Fix:* treat NULL-status rows older than ~60s as reclaimable in `begin()` (update `created_at`, return `fresh`). Not a data-integrity risk (the command committed; the client re-sending gets a domain-level conflict), but a bad client experience. **Before Module 2: no** — fold into Module 2's endpoint work.

**M-2 — `store.published` emitted on resume-from-paused**
*File:* `domains/merchant/core/domain/store.ts`
Publishing a paused store re-emits `store.published`. ADR §5.5 defines `StoreResumed` as a distinct event; Community would re-celebrate a vacation return as a launch. Unreachable today (no pause API), but the event contract is published language — fix it before any consumer exists. *Fix:* emit `merchant.store.resumed` when `publishedAt` was already set. **Before Module 2: yes (cheap, contract-level).**

**M-3 — EntitlementService resolution cache grows without bound**
*File:* `domains/merchant/core/application/entitlement-service.ts`
Keys include the axes, so superseded entries are never overwritten or evicted — a long-lived instance serving many businesses leaks memory slowly. *Fix:* cap with simple LRU or sweep expired entries on insert. **Before Module 2: no.**

**M-4 — Concurrent first-business creation can 500**
*File:* `create-business.ts` — two simultaneous requests for the same new user both pass `findByUserId → null`, both insert, one dies on `UNIQUE(user_id)` as an unhandled exception (500 instead of a clean retry/replay). *Fix:* `ON CONFLICT (user_id) DO NOTHING` + re-fetch, keeping `merchant.onboarded` emission conditional on actually inserting. **Before Module 2: no** (retry succeeds; Ignite's claim step will make this path hotter — fix by Module 3).

**M-5 — Dispatch queue lacks a scale-ready claim index**
The pending partial index is `(status, next_attempt_at)` but the claim orders by `(partition_key, id)`. Fine at kernel volume; regressing at scale. Fold into H-1's fix (same index). **Before Module 2: with H-1.**

**M-6 — Consumers trust event payloads without validation**
`standing-consequence-policy.ts` casts `event.payload` unchecked; `contracts/schemas/events/envelope.schema.ts` exists but nothing consumes it. One malformed producer away from a poison-pill event that dead-letters. *Fix:* per-event payload schemas parsed at the dispatcher boundary before `handle()`. **Before Module 2: yes** — Module 2 multiplies consumers; establish the pattern now.

**M-7 — Post-response dispatch may be frozen on Vercel**
*File:* `server/api/v1/stores/[storeId]/publish.post.ts` — `void dispatcher.dispatchPending()` fire-and-forget can be suspended when the serverless instance freezes after responding; the launch moment then waits for the next cron tick (≤60s). *Fix:* use the request's `waitUntil` (Nitro `event.waitUntil`) so the platform keeps the instance alive. **Before Module 2: no** (cron is the guarantee; this is latency polish).

### LOW

- **L-1** `MemoryRateLimiter` clears *all* state at 50k keys (momentary global reset) and the blueprint's global 300/min authed limit is not implemented — acceptable under D-08; revisit with the KV adapter.
- **L-2** `check-boundaries.mjs` doesn't forbid `pg` imports inside `*/domain/**` (only infrastructure should touch the driver). Add `pg` to a domain-folder-only forbidden list.
- **L-3** `runtimeConfig` is declared in `nuxt.config.ts` but all reads go through `process.env` (`server/utils/config.ts`) — intentional (D-12 testability) but the unused declaration invites drift; comment or remove.
- **L-4** MerchantAccount `display_name` is seeded from the first business's name — semantically the person's merchant persona, not the business. Cosmetic until account settings exist.
- **L-5** No DB CHECK constraining `staff_memberships.roles` values; domain validates, DB accepts anything via raw SQL. Consistent with A5 flexibility; note for the Module 4 staff work.
- **L-6** Step-up plumbing exists end-to-end (`auth.stepUpVerified` → `requestContext` → gate) but no command passes it to `resolveAndAuthorize` yet — dormant until the first sensitive endpoint; keep on the Module 4 checklist.
- **L-7** Test gaps: rate limiter, dev-identity production refusal, internal cron route auth, multi-business workspace, support-agent expiry via HTTP. None guard shipped invariants; add opportunistically.
- **L-8** Blueprint's `02.merchant-context` middleware was replaced by per-endpoint `resolveAndAuthorize` — a real improvement (route-param-dependent context can't be a global middleware), but it's an undocumented deviation. Record it (proposed D-14).

---

## Scorecard (the 20 review axes)

| # | Axis | Verdict |
|---|---|---|
| 1 | Architecture correctness | **Pass** — aggregates, gates, events, and lifecycle match ADR-001; no contradictions found beyond documented deviations |
| 2 | Domain boundary integrity | **Pass** — 45 files, zero cross-subdomain or framework imports (CI-enforced) |
| 3 | Nuxt 3 structure | **Pass** — thin Nitro adapters, framework-free kernel, contract-first `contracts/` |
| 4 | TypeScript type safety | **Pass** — strict + noUncheckedIndexedAccess clean; branded ids; casts confined to infra rehydration (accepted pattern) |
| 5 | PostgreSQL schema quality | **Pass** — invariants in DDL (one-owner partial unique), shard-key discipline, text+CHECK statuses |
| 6 | Migration safety | **Pass** — forward-only, advisory-locked, per-file transactions, idempotent seed (all tested) |
| 7 | RBAC | **Pass** — matrix matches BLUEPRINT §6; AI guardrails structurally absent, test-asserted |
| 8 | Capability Registry | **Pass** — seed matches BLUEPRINT §5; D-06 trust/tier asymmetry implemented and tested |
| 9 | Trust/Standing gate | **Pass** — triple-gate order verified; growth vs write blocking distinction tested |
| 10 | Audit logging | **Pass** — in-tx for accepted, out-of-tx for denied-sensitive, atomicity proven by test |
| 11 | Outbox reliability | **Conditional** — durable and idempotent, but ordering contract broken under backoff (H-1) and prod trigger broken (H-2) |
| 12 | Idempotency | **Pass with M-1** — replay/conflict/release all tested; wedge window documented |
| 13 | Error handling | **Pass** — single Result/DomainError path, RFC 9457 everywhere, correlation ids |
| 14 | Test coverage | **Good** — all shipped invariants covered; gaps are peripheral (L-7) |
| 15 | Security | **Pass** — fail-closed identity, existence masking, secret-gated cron, no AI side door; H-2 is availability not exposure |
| 16 | Scalability | **Pass with M-3/M-5** — shard-key indexes in place; queue index needed with H-1 |
| 17 | Production readiness | **Blocked on H-2** only |
| 18 | Vercel compatibility | **Blocked on H-2**; M-7 is polish; Neon pooler URL recommended for pool sizing at scale |
| 19 | Developer experience | **Strong** — one-command self-contained test suite on real PG, typed contracts, container test hook |
| 20 | Technical debt | **Low and inventoried** — every deferral has a DECISIONS entry or an item in this review |

**Mandate checks:** no prototype code ✓ · only declared dev adapters (IdentityPort D-04, CatalogAbsent D-03) ✓ · no framework leakage in domain ✓ · no cross-subdomain imports ✓ · no skipped tests ✓ · hidden assumptions — one found and now surfaced (Latin-script names in handle derivation, H-3) · no ADR/BLUEPRINT contradictions beyond documented deviations (D-02 partitioning, publish-order 423-before-409, L-8 middleware).

---

## Verdicts

### Must-fix before Module 2
1. **H-1** — partition-aware outbox claiming + `(partition_key, id)` pending index, with an ordering regression test.
2. **H-2** — cron route must accept GET (Vercel cron), test both methods' auth.
3. **H-3** — handle derivation fallback for non-Latin/reserved/empty slugs, with the empirical cases as regression tests.
4. **M-2** — emit `merchant.store.resumed` (not `store.published`) on paused→live, before any consumer exists.
5. **M-6** — payload-schema validation at the dispatcher boundary (the consumer-pattern Module 2 will copy).

### Nice-to-fix (scheduled, not blocking)
M-1 (idempotency wedge reclaim), M-3 (cache LRU), M-4 (account-creation race — by Module 3/Ignite), M-5 (folds into H-1), M-7 (`event.waitUntil`), L-1…L-8.

### Approved architectural decisions (re-affirmed by this review)
- Enforcement-hold-before-readiness (423 beats 409) at publish — sound; a held store must not leak readiness.
- Result-aware `PgUnitOfWork` rollback — proven by the no-partial-writes audit test.
- Per-endpoint access resolution instead of global merchant-context middleware (record as D-14).
- DB-level one-owner invariant; idempotent republish as no-op; existence masking via 404.
- D-01 through D-13 all remain valid; none contradicted by implementation.

### Proposed DECISIONS.md additions (land with the fixes)
- **D-14:** merchant context resolves per-endpoint (`resolveAndAuthorize`), not via global middleware — route-param-dependent and gate-fused.
- **D-15:** outbox claims are partition-serial: a backing-off event holds its partition (and only its partition) to preserve per-business ordering; dead-lettering unblocks a poisoned partition.
- **D-16:** derived handles always fall back to `store-<random>` rather than surfacing HANDLE_TAKEN on platform-generated suggestions; explicit merchant-chosen handles still fail loudly.

### Recommendation
**PROCEED to Module 2 after the five must-fix items land** (estimated: small — two are one-liners, three are contained changes with tests). The architecture held under review: every serious finding is an implementation defect inside a correctly-drawn boundary, not a boundary mistake — which is exactly what the modular design was supposed to buy us.

---

## Remediation Record (same day)

All must-fix AND nice-to-fix items were applied and regression-tested:

| Finding | Fix | Regression test |
|---|---|---|
| H-1 | Partition-serial claim (`NOT EXISTS` older pending sibling) + `idx_outbox_pending_partition` (migration 0002) | `review-fixes.test.ts` — failing head holds its partition, other partitions flow, drain order verified |
| H-2 | Cron route renamed method-agnostic (`outbox-dispatch.ts`) | GET + POST both dispatch; secret enforced on both |
| H-3 | `deriveFromName` always returns valid+unreserved (random `store-<suffix>` fallback); derived claims walk numbered→random fallbacks | CJK/Arabic/emoji/reserved cases from the review probe |
| M-2 | Paused→live emits `merchant.store.resumed`; first publish remains the only `store.published` | Rehydrated-paused-store unit test |
| M-6 | Payload validators (contracts → shared/validation port → dispatcher); invalid payloads dead-letter with 0 retries | Corrupt `standing_changed` payload test |
| M-1 | 60s in-flight reclaim (D-17) | Aged-claim reclaim test |
| M-3 | Resolution cache: expired sweep + oldest-first eviction at 5k entries | — (bounded by construction) |
| M-4 | `insertIfAbsent` (ON CONFLICT DO NOTHING) + re-fetch on race | — (race-safe by construction) |
| M-5 | Folded into H-1's index | — |
| M-7 | `event.waitUntil` on post-publish dispatch | — (cron remains the guarantee) |
| L-1 | Targeted limiter eviction + BLUEPRINT §9 global 300/min in both wrappers | Sliding window + key-independence tests |
| L-2 | Boundary script: `zod` banned in domains/, `pg` banned in domain layers | CI rule (49 files clean) |
| L-3 | `runtimeConfig` removed; env docs point at `server/utils/config.ts` | — |
| L-4 | Persona-naming constraint documented at the source | — |
| L-5 | `chk_staff_roles` CHECK (migration 0002, D-18) | — (DDL) |
| L-6 | `stepUpVerified` plumbed endpoint→command→gate on all business-scoped commands | Gate unit tests already cover enforcement |
| L-7 | New tests: rate limiter, identity prod refusal, cron auth, multi-business workspace | added |
| L-8 | Recorded as D-14 | — |

DECISIONS.md extended with D-14…D-18. **Module 2 is unblocked.**

---

## Final Verification (PROMPT 005, same day)

Full battery re-run from scratch: 71 unit + 32 integration (real PostgreSQL) all passing · migrations + seed verified · `tsc --noEmit` clean · production build clean · boundaries clean (45 files) · hygiene greps clean (no skipped/focused tests, no TODO/FIXME, no mocks/placeholders outside tests and declared adapters).

**Verification caught one real defect in a "fixed" item:** H-1's partition ordering used the outbox UUIDv7 id as the ordering key, but UUIDv7 is not monotonic within a millisecond — multi-event appends from one transaction (the common case) ordered randomly, so the fix was only *probabilistically* correct and failed on re-run. Corrected with a DB-assigned `seq` identity column (migration 0002 amended pre-ship); the ordering test now passes deterministically (3× consecutive runs). D-15 updated. Two items previously verified only "by construction" (M-3 cache bound, M-4 creation race) now have real tests: a 5,100-business cache-bound test and a 5-way concurrent-creation test asserting zero failures, one merchant account, and exactly one `merchant.onboarded` event.

**Verdict: all ten items verified. PROCEED to Module 2.**
