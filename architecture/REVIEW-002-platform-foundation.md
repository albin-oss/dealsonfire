# REVIEW-002 — Principal Engineer Review: Platform Foundation (REV-PLT-001)

**Date:** 2026-07-04 · **Scope:** `platform/` library (19 files), merchant rewiring, gates, tests — reviewed against ADR-001…004, BLUEPRINT-002, DECISIONS D-01…D-25.
**Method:** independent adversarial pass — full re-read of platform modules, empirical probes (redaction behavior, replay pagination analysis), gate re-runs (157 tests, lint, boundaries, data constitution, typecheck, build — all green at review time). Green gates are the *floor*; the findings below are what the gates cannot see.

---

## Findings

### HIGH

**H-1 — Resumable replay LOSES events (ordering key ≠ resume key)**
*Category:* Event system / correctness · *File:* `platform/replay.ts`
The query orders by `(aggregate_id, sequence, id)` but the resume marker filters `id > afterEventId`, and `lastEventId` is the last row of an *aggregate-ordered* page. Concrete failure: aggregate A's events happen to carry higher uuidv7 ids than aggregate B's; page 1 drains A, `lastEventId` = a high id; the continuation call filters `id > lastEventId` — **every event of B is silently skipped**. A resumable replay that drops events is worse than none: it reports success while producing incomplete projections/backfills.
*Risk:* silent data loss in exactly the recovery scenarios replay exists for (Commerce Batch 8 projection backfill, post-restore reconciliation per ADR-004 rule 21).
*Recommendation:* make the cursor match the sort: keyset-paginate on `(aggregate_id, sequence)` with a composite resume token; delete `afterEventId`. Add a pagination test with interleaved aggregates (its absence is why this shipped — L-7).
*Must fix before Commerce?* **Before any replay use — recommend immediately; the fix is small.**

**H-2 — Log redaction false positives gut observability (empirically confirmed)**
*Category:* Observability / correctness · *File:* `platform/logger.ts`
`key.toLowerCase().includes(redactedKey)` with short keys like `ip` redacts: `shipping_method`, `zip_code`, `description`, `recipient_name`, `membership_id` (probe output: all `[redacted]`). For the Commerce domain — whose log fields are precisely descriptions, shipping, and memberships — structured logging becomes unusable, and worse, **`membership_id` redaction destroys the actor traceability the audit/trace machinery exists to provide**. Over-redaction sounds safe; in practice it means engineers bypass the logger, which is how PII ends up in `console.log`.
*Risk:* useless logs at first Commerce incident; logger circumvention re-introducing the PII risk redaction was meant to prevent.
*Recommendation:* token-based matching — split keys on `_`/camelCase boundaries and require whole-token equality for short keys (`ip`, `email`), keeping substring matching only for unambiguous long keys (`password`, `authorization`). Extend the unit test with the probe's exact fixture.
*Must fix before Commerce?* **Yes — Batch 2 starts logging through this.**

### MEDIUM

**M-1 — Replay bypasses payload validation (M-6 gap)**
*File:* `platform/replay.ts`. The dispatcher validates known payloads and dead-letters poison events; replay feeds the same events to consumers **unvalidated** — a dead-lettered poison event is exactly what a naive replay re-executes. *Fix:* accept the same `payloadValidators` map; skip + count invalid events in `ReplayResult`. *Before Commerce?* Before Batch 8 (with H-1).

**M-2 — `ProjectionRegistry.ensure()` breaks for projections with indexes**
*File:* `platform/projection-registry.ts`. `ensure` regex-rewrites only the first `CREATE TABLE` to `IF NOT EXISTS`; a `schemaSql` containing `CREATE INDEX` statements (which `rm_public_listings` will need, BLUEPRINT-002 §6) fails on second deploy. *Fix:* check `to_regclass(name)` and skip entirely when present. *Before Commerce?* Before Batch 8.

**M-3 — Health endpoint leaks configuration detail unauthenticated**
*File:* `server/api/internal/health.get.ts`. Check names, latencies, and details like `"NUXT_DATABASE_URL is not configured"` are served to anyone. Right shape for infra probes; wrong default for the public internet. *Fix:* full detail only when the cron secret is presented (or non-production); bare `{status}` otherwise. *Before Commerce?* No — before public GA.

**M-4 — Two configuration idioms violate "no duplicated platform functionality"**
*Files:* `server/utils/config.ts` vs `platform/config.ts`. The pre-existing server config reads `process.env` ad-hoc; the platform readers (validated, typed) exist but nothing migrated. Commerce will copy whichever it sees first. *Fix:* rebase `getServerConfig()` onto platform readers (mechanical). *Before Commerce?* Yes — cheap, and it decides which pattern Commerce inherits.

### LOW

- **L-1** Replay acquires a pool connection per (event × consumer) — batch by event or reuse a connection per page. Efficiency only.
- **L-2** Endpoint wrappers still `console.error` instead of the container logger — inconsistent with the new observability stance.
- **L-3** `safeStringify` marks shared (non-circular) subtrees as `[circular]` (WeakSet never unwinds). Cosmetic mislabel in diagnostics.
- **L-4** `Clock` is wired but consumed nowhere; no guidance on when SQL `now()` vs `Clock` applies — divergence risk. One paragraph in the module header fixes it.
- **L-5** Merchant repositories predate `PgRepositoryBase` and don't use it — fine, but the adoption rule ("new repos must; old repos opportunistic") is undocumented.
- **L-6** No coverage tooling (c8) — "coverage not reduced" is asserted by test-count, not measured.
- **L-7** Test gaps that matter: replay pagination (would have caught H-1), custom `RetryStrategy`, logger redaction against realistic commerce field names (would have caught H-2). Pattern: the two High findings live precisely where tests are thinnest.
- **L-8** `InMemoryMetrics` unbounded arrays — label test-only in the type name or doc.

---

## Checklist verdicts (condensed)

**Architecture / dependencies:** extraction complete; zero duplicated infrastructure found *except* M-4's config split; boundaries machine-enforced including the new platform rules; no circular deps (platform → shared only; verified by lint + import scan); merchant behavior preserved (kernel suite untouched and green). **Database layer:** UoW/transactions/locking unchanged from proven Module 1 code; migration checksum safety in place; manifest compliant (15 tables). **Event system/outbox:** D-15 partition-serial + M-6 validation + idempotency ledger all preserved through parameterization and still test-covered; correlation/causation intact end-to-end; retry/DLQ configurable with byte-identical defaults. Replay is the weak newcomer (H-1, M-1). **Audit:** immutable (grant-tested), actor-mandatory, in-tx. **Error framework:** consistent Result/DomainError + RFC 9457; retryability classification tested. **Security:** C-1 boundary honored (no authorization semantics leaked into platform); identifier injection guarded (`assertSqlIdentifier`, tested); health detail is the one soft spot (M-3). **Performance:** no hot-path regressions (defaults identical); replay churn noted (L-1); nothing else allocates in loops that matter. **Maintainability:** naming/docs consistent; every module header states its ADR lineage — genuinely good developer experience.

---

## Final Report

1. **Executive summary:** The extraction itself is clean — boundaries hold, merchant is unchanged and proven so, and the constitutional machinery (ordering, validation, idempotency, immutability) survived parameterization intact. The defects are concentrated in the two genuinely *new* code paths shipped this sprint (replay, redaction), both of which lack the adversarial tests the older machinery earned through REVIEW-001. Nothing found undermines the architecture; two things found would hurt in production.
2. **Architecture score: 9/10** — deductions for the config duplication (M-4) and undocumented Clock adoption rule.
3. **Engineering score: 8/10** — two High implementation defects in new paths; everything else disciplined.
4. **Production readiness: 7.5/10** for the platform's current pre-GA role — conditions below; would be 9 with H-1/H-2/M-1/M-2 fixed.
5. **Strengths:** gates-as-code (boundary/data/architecture tests); per-domain instances with owner-supplied ordering scope; honest conflict documentation (C-1/C-2) instead of silent scope creep; real-PostgreSQL testing everywhere; type tests pinning the re-export contracts.
6. **Weaknesses:** new code shipped without the failure-mode tests the old code has; observability additions (logger, health) not yet dogfooded by the code that should use them (L-2, L-4).
7. **Technical debt:** M-3, M-4, L-1…L-8 — all inventoried, none load-bearing today.
8. **Required fixes:** H-2 + M-4 before Commerce Batch 2; H-1 + M-1 + M-2 before any replay/projection use (Batch 8 at the latest — recommended immediately while context is warm).
9. **Recommended improvements:** the L-list, plus c8 coverage in CI to make the coverage claim measurable.
10. **DECISIONS entries proposed (land with fixes):** **D-26** — redaction is token-matched, not substring-matched; short keys require whole-token equality; the commerce-field fixture is the regression test. **D-27** — replay cursors are `(aggregate_id, sequence)` keysets and replay validates payloads with the same registry as the dispatcher; `afterEventId` removed before first production use.
11. **Recommendation: PROCEED WITH CONDITIONS.** The Platform Foundation is architecturally approved for the Commerce Domain; implementation approval is conditional on H-2 and M-4 landing before Commerce Batch 2 begins, and H-1/M-1/M-2 before Batch 8. All five fixes are contained, test-guarded changes to three files.

---

## Remediation Record (VER-PLT-001, same day)

All five conditions applied with regression tests:

| Finding | Fix | Regression test |
|---|---|---|
| H-1 | `(aggregate_id, sequence)` keyset cursor; `afterEventId` removed; `nextCursor` in ReplayResult | 3 aggregates × 3 events paged at limit 2 — all 9 delivered, exact per-aggregate order across page boundaries |
| H-2 | Token-based key matching (`shouldRedactKey`); short keys require whole-token equality | The exact probe fixture: shipping/zip/description/recipient/membership kept; ip_address/userEmail/password_hash/authorization/api_token redacted |
| M-1 | Replay accepts the dispatcher's validator registry; invalid events counted + skipped | Corrupt `standing_changed` → `invalid: 1`, zero deliveries |
| M-2 | `ensure()` existence-checked (multi-statement schemaSql verbatim); **deep form found during verification:** rebuild now normalizes `__shadow` index names post-rename — without this, the SECOND rebuild of any indexed projection collided | ensure×3 preserves data; rebuild×2 with indexes; no `__shadow` residue |
| M-4 | `getServerConfig()` rebased onto `platform/config` readers; identity mode validated | covered by full endpoint suite (config on every request path) |

DECISIONS extended with D-26/D-27. Verification itself caught one additional defect (the M-2 deep form) — recorded inside D-27.
