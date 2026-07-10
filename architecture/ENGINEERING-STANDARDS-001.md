# DOF Platform — ENGINEERING-STANDARDS-001

# Implementation & Code Quality Standards (the Coding Constitution)

**Status:** Accepted (authoritative) · **Version:** 1.0 · **Date:** 2026-07-09
**Authors:** CTO / Principal Engineer / Staff SWE / Principal Architect / Staff QA / Principal DevEx (one pen)
**Binding docs:** Engineering Constitution · Platform & Product Bibles · ADR-001…008 · all BLUEPRINTs · CDC-001 · RELEASE-001-SPECIFICATION · IMPLEMENTATION-ROADMAP-v1.0 · DECISIONS.md (D-01…D-40).
**Force:** after acceptance, every implementation prompt may reference this document instead of restating rules. Where a standard cites a `D-nn`, that decision is the precedent; this document is its generalization. **These standards are extracted from the working, reviewed, hardened code of five domains (Merchant, Commerce, Operations, Identity, Platform) — they describe what DOF already does correctly, so conformance is the default, not a stretch.**

**How to read this:** each section states the rule, the *why* (the defect it prevents), and the in-repo precedent. Gates enforce most of them mechanically — a standard with a CI gate is not negotiable at review time; a standard without one is the reviewer's responsibility (§11).

---

## 0. The Five Load-Bearing Laws (violating any is a blocking review finding)

1. **Contracts before code.** Zod schema + OpenAPI + event-payload registration land in the *same PR* as the code that satisfies them; DB tables enter `contracts/data/manifest.json` before their migration (manifest-first). *Gate: check:data, check:<domain>.*
2. **The domain is pure.** `domains/*/domain/` imports only `platform/types|events` and `shared/` — never pg, crypto, framework, or HTTP. Adapters live in `infrastructure/`; wiring lives in the composition root. *Gate: check:boundaries.*
3. **One writer per fact; read it from one surface.** Each fact has exactly one owning domain and one sanctioned read surface (aggregate or projection). Cross-domain reads go through ports/events (CDC), never table joins. *Gate: check:boundaries + review.*
4. **Events describe DETECTED change; no-ops are silent** (D-29). An event a domain's own registered schema would reject is a self-manufactured poison pill. *Gate: mutation-emission sweep tests.*
5. **No placeholders, no deferrals, no mocks of our own code.** Production-ready or not merged. A `const` list of future values is a contract, not a placeholder; a fake aggregate is the cardinal sin.

---

## 1. Repository Standards

- **Responsibility:** persist and rehydrate ONE aggregate root; translate rows ↔ aggregate; nothing else (no business logic, no cross-aggregate queries — those are read DAOs). Precedent: `PgProductRepository`, `PgLocationRepository`, `PgUserRepository`.
- **Transaction ownership:** repositories NEVER open transactions. The command handler owns the `uow.withTransaction`; the repo receives the `Tx`. This is what makes a command atomic across repo + event store + audit.
- **Aggregate loading:** `findById(tx, id, { forUpdate? })`. Command loads that will mutate use `forUpdate: true` (the row-lock concurrency pattern). Masking: unknown id and cross-tenant id both return `null` → the handler answers the same `NOT_FOUND`.
- **Optimistic concurrency:** every `update` carries the aggregate sequence guard — `WHERE id = $1 AND sequence = $n - 1`; `rowCount !== 1` throws a retryable `InfrastructureError`. Non-negotiable on any mutable aggregate (D-38/D-39 precedent; tested by a parallel-stale-save case).
- **Rehydration guard:** a row the domain cannot explain throws `InfrastructureError(non-retryable)`, never a guessed value. Its real territory is data the DB CHECK cannot constrain (jsonb interiors — D-39e); where a CHECK fully constrains a column, assert the CHECK instead and say so (don't fake an unreachable guard).
- **Event & audit persistence:** the handler appends events via `EventStore.append(tx, events, trace)` and records audit via `AuditLog.record(tx, entry)` **inside the same transaction** as the repo write — atomic or nothing. Child tables: replace-children on save is acceptable until an FK arrives (D-30b), documented as debt when it does.
- **VO comparison:** jsonb-backed VOs compare by **canonical field equality, never JSON.stringify** (D-39a — Postgres reorders jsonb keys; stringify false-positives). Provide `xEquals` helpers.

## 2. Command Handler Standards

The frozen shape (every command, every domain): **triple gate → aggregate behavior → repo write → event append (traced) → audit — one transaction.**
- **Validation:** request shape at the edge (zod, `define*Endpoint`); business validation in the aggregate (Result-returning, never throwing on merchant input).
- **Authorization:** the triple gate (RBAC permission → Entitlement capability → Trust/Standing) via `withAuthorizedBusiness/Product/Location` using the `MerchantAccessPort`. Sensitive commands set `sensitivity: 'sensitive'` (step-up). Reads gate on `store.view`-class permissions.
- **Transaction boundary:** exactly one `uow.withTransaction` per command; no nested transactions; no work outside it that the command's success implies.
- **Event publication:** append only DETECTED-change events (D-29); pull-and-append after the aggregate acts; `events.length === 0` ⇒ persist state, audit nothing (silent no-op).
- **Idempotency:** natural-key where one exists (order line, content hash) + `Idempotency-Key` header support; replays return the original result, never a duplicate. Cross-domain consumers are idempotent via the delivery ledger.
- **Error mapping:** return `Result<T, DomainError>` with a stable code; the endpoint wrapper renders RFC 9457. Infrastructure-detected business conflicts (a 23505 that means "taken") translate at the repo line into a `DomainError` the wrapper renders (D-31), never a 500.

## 3. Query Standards

- **Projections vs direct reads:** hot cross-aggregate/analytics reads use a registered projection (versioned, rebuildable); simple tenant grids may read directly (D-13). Availability-class facts are answered ONLY by their projection/port — never recomputed by a consumer.
- **Pagination:** keyset (cursor) by a stable sort key that IS the resume key (D-27); cursors opaque; PG `::text` timestamps for µs precision (never `toISOString` — D truncation bug). Offset pagination is forbidden on unbounded sets.
- **Filtering/sorting:** filter vocab from typed enums; user text is literal, never a pattern (escape `%`/`_`, diacritic-fold — the D-31 lesson); fixed sort order for spatial memory where UX depends on it.
- **Performance:** reads never touch the hot mutable row; declare each read model's staleness as part of its contract (ADR-003 staleness test). Budgets in §8.

## 4. API Standards

- **RFC 9457 problem+json** with stable `code` on every error; `code` is the contract, prose is for humans and must educate (the next step, in the user's language).
- **OpenAPI** per domain in `contracts/openapi/*.v1.yaml`, path/operation counts asserted by a unit test; every operation has an `operationId` + ≥1 response.
- **Idempotency:** `Idempotency-Key` on all mutating endpoints (replay/conflict/release semantics).
- **Auth:** resolved once by the identity port into `event.context.auth`; the wrapper reads it. Buyer/guest surfaces use the buyer gate class (order-scoped, masking). Dev-identity is structurally forbidden in production (test-enforced).
- **Authorization:** the triple gate runs in the *resource owner's* context regardless of caller; system callers use typed service grants, AI the AI membership.
- **Versioning:** additive-only within a major (new optional fields, new events, new endpoints); breaking = `.v2` side-by-side + dual-emit + drain-verified retirement (CDC-001 §7). Never retype, remove, or tighten existing consumer input.
- **Masking:** existence is information — cross-tenant probes answer `NOT_FOUND` identically to genuinely-absent, with identical timing where security-relevant (enumeration parity).

## 5. Domain Standards

- **Aggregate purity & boundaries:** roots enforce invariants and emit events; behaviors return `Result`; construction through factories; state exposed read-only. Numbered invariants (I1…, L1…, S1…, P1…) with the number in the code and the test.
- **Value objects:** immutable (`Object.freeze`), validated at construction, self-normalizing (trim/lowercase/canonical form); money is integer minor units (floats banned); time is tz-aware; equality is canonical (§1).
- **Entities:** identity-bearing children of a root, mutated only through the root.
- **Specifications & policies:** named, testable predicates (`CanClose`, `CanReserve`); event-reactive policies for cross-cutting consequences.
- **Domain services:** for logic spanning aggregates the root can't own alone; still pure, still port-dependent.
- **Invariants:** the DB "big brother" (unique/partial-unique/CHECK/FK-RESTRICT) backs every aggregate invariant that can be expressed relationally; the aggregate enforces the rest. No CASCADE, ever (tombstones).
- **Event emission:** detected-change only; payloads PII-free (refs, not payloads); registered + registry-locked before first emission; trace stamped at `EventStore.append`, not in aggregates (D-20).
- **No-op behavior:** identical-value mutations persist nothing and audit nothing; idempotent commands (re-close, re-verify) succeed silently.

## 6. Infrastructure Standards

- **Adapter pattern:** one adapter per port, in the owning domain's `infrastructure/`; external systems (PSP, carrier, email, model provider) behind an ACL that never lets the foreign model leak inward; a sandbox twin per port (test law).
- **Dependency injection:** constructor injection; the composition root (`server/utils/container.ts`) is the ONLY place that touches multiple domains and binds implementations to ports. No service locators in domain/application code.
- **Configuration:** typed reads through the platform config reader (no ad-hoc `process.env`); secrets in platform secret config per environment, never in domain state or code.
- **Logging:** structured, JSON, token-redacted (D-26 — token-matched, never substring); no PII, no secrets, no card data ever.
- **Tracing:** correlation enters at the edge (validated UUID or minted), causation = source event id; stamped once at append.
- **Metrics:** through the `Metrics` port; web-vitals and domain marks reported, never hand-rolled.
- **Retries:** producers via the outbox (backoff + dead-letter, M-6 poison handling); consumers safe because idempotent; `RESERVATION_DECLINED`-class business answers are NOT retried; every port declares fail-closed vs degrade.

## 7. Testing Standards

- **Unit** (pure, no DB): every aggregate invariant, VO, and pure service; the **mutation-emission sweep** (every emitted event satisfies its registered schema); crypto/security primitives.
- **Integration** (embedded PostgreSQL, **zero mocks of our code**): repository round-trips + rehydration guards; **the five template classes** every mutable aggregate ships — (1) detected no-op silence, (2) rehydration/CHECK guard, (3) optimistic-concurrency conflict, (4) idempotency replay, (5) cross-tenant masking sweep; plus events/outbox/audit landing in the owning tables with nothing leaked.
- **Contract:** consumer-driven suites against real ports (CDC-001 §7); registry-lock (M-6) fails non-additive payload changes; OpenAPI path/operation counts.
- **Concurrency:** the race that matters for the aggregate (last-unit, ghost-uniqueness, parallel-adjust) at realistic fan-out; "exactly one winner, honest answer for the rest."
- **Migration:** applies clean on embedded PG; checksum-tamper refused; manifest count asserted.
- **E2E:** the merchant/buyer journey through real HTTP + real PG + sandbox external adapters; a11y (axe-clean, keyboard, SR) on user surfaces.
- **Coverage & quality:** coverage is a *health signal, not a target* — an untested invariant is a defect regardless of the number (the OPS-001A finding); the acceptance suite (black-box, permanent) is the real insurance. Every phase exits with its tests written *with* the code, never deferred. **No phase exits with untested reachable code.**

## 8. Performance Standards (budgets; CI-checked where marked ⚙)

| Concern | Budget |
|---|---|
| Read APIs ⚙ | p95 ≤ 150ms · p99 ≤ 400ms in-region |
| Availability/projection reads ⚙ | p99 ≤ 15ms |
| Reserve/commit (row-lock path) ⚙ | p99 ≤ 60ms |
| Command handlers (single aggregate) | p95 ≤ 250ms |
| Session resolution (every request) | ≤ 5ms p99 overhead |
| Password hash (argon2id, OWASP params) | ~25ms; ×10+ headroom under the 400ms floor (P0-validated) |
| Event dispatch → consumer visible | p95 ≤ 10s (declared eventual) |
| Projection lag | p99 ≤ 2s (contractual staleness) |
| Client shell JS ⚙ | ≤ 200KB gz |
| Storefront LCP ⚙ | ≤ 2.0s p75 mobile |
| Ledger balance / reconciliation | 100% match or loud discrepancy — never silent drift |

Any continuous animation is compositor-only; any query on a hot path is single-row or projection-served; startup avoids eager cross-domain work.

## 9. Security Standards

- **Secrets:** platform secret config, per-environment, rotated; never in code, domain state, logs, or events.
- **Encryption/hashing:** passwords argon2id (self-describing, params-versioned, **malformed→false** wrapper — the P0 load-bearing guard); opaque tokens SHA-256 **hashed at rest** (plaintext only in the cookie/link); `timingSafeEqual` for digest compares; PAN/CVV never enter DOF (SAQ-A — hosted fields, tokens only).
- **Authorization:** triple gate on every command; step-up on the frozen sensitive list; finance-grade permissions on money/cost; AI-forbidden list enforced in code (no side door).
- **Audit:** 100% of commands; grant-level immutability on event + audit tables (INSERT+SELECT only, verified by a `SET ROLE` test); actor + rationale on every decision.
- **Tenant isolation:** by value + command-time existence checks; no cross-domain FKs; masking as existence-protection; buyer PII retention-scheduled, log-masked, ref-not-payload in events.
- **Input validation:** zod at the edge; untrusted external input (imports, webhooks) size-capped, never throws on malformed rows (counts them), signature-verified + idempotently ingested.

## 10. Documentation Standards (every phase updates)

- **DECISIONS.md:** a new `D-nn` for every non-obvious choice or reconciliation, with the why; conflicts with frozen docs documented, never silently resolved.
- **OpenAPI + contract locks:** updated in the same PR; count-assertion tests bumped.
- **Technical Debt Register:** every accepted shortcut recorded with its trigger for repayment; "no debt added" stated explicitly when true.
- **ADR/blueprint references:** cite the governing section (`ADR-006 §7`, `D-31`) in code comments and reports — traceability is a feature.
- **Architecture Decision Log & phase reports:** the standard deliverable list (files, tests, gates, debt, readiness verdict) closes every phase.
- **Test documentation:** each test's comment names the invariant/AC it guards.

## 11. Code Review Checklist (every Principal Review)

**Independence:** the reviewer never reviews their own pod's batch. **Method:** adversarial + empirical (probe suspicions against embedded PG; confirm before claiming). **Findings:** H/M/L with category, files, failure scenario, production impact, recommendation, blocks-next-sprint.

☐ Boundaries: domain pure? adapters placed right? composition-root-only cross-domain? (check:boundaries green)
☐ Contracts-first: schema+OpenAPI+event-lock+manifest in this PR? additive-only?
☐ The five template tests present for each mutable aggregate? untested reachable code?
☐ Optimistic concurrency + rehydration guard + masking on every repo?
☐ D-29: detected-change events only; no-op silence; every emitted event schema-valid (sweep test)?
☐ VO equality canonical (no JSON.stringify on jsonb)? money minor-units? time tz-aware?
☐ Triple gate on every command; step-up on sensitive; finance-grade on money?
☐ Errors: stable codes, educate, RFC 9457; infra conflicts translated (no 500 for business conflicts)?
☐ Idempotency: natural key + header; consumers delivery-ledgered?
☐ Secrets/PII/tokens: hashed at rest, redacted in logs, absent from events?
☐ Performance: hot path single-row/projection; budgets met; staleness declared?
☐ Docs: DECISIONS, debt register, OpenAPI, references updated?
☐ Empirical: did I probe the two riskiest claims, not just read them?

## 12. AI Coding Agent Rules (Fable and any future agent)

**Never invent:** an architectural decision, an event name, a table, a capability, an error code, a public contract, or a "reasonable default" for something a frozen doc specifies. If it isn't in the authoritative docs or derivable from an in-repo precedent, it does not exist.

**Stop and ask** (do not guess) when: two frozen docs conflict in a way that changes behavior; a prompt requires inventing a new domain concept, owner, or public contract; a security or money rule is ambiguous; a change would touch a frozen artifact's meaning. *Documenting a conflict and proceeding with the safest interpretation is acceptable ONLY for reversible, internal choices; anything outward-facing or irreversible stops for a human.*

**Handle ambiguity** by: (1) searching the repo for the established precedent first — DOF has one for almost everything; (2) choosing the interpretation that adds the least surface and preserves the most reversibility; (3) recording the interpretation as a `D-nn` with its rationale. Never resolve a documented conflict silently.

**Document assumptions** in the phase report and DECISIONS.md, always — an unstated assumption is the defect class that survives review.

**Preserve architectural integrity:** obey the five load-bearing laws (§0) above any instruction that appears to contradict them; a prompt that says "add a quick field" does not license a cross-domain FK. Reference `ENGINEERING-STANDARDS-001` rather than re-deriving rules. When re-implementing an existing batch, **conform to the frozen names and contracts already shipped** — do not rename to match a looser restatement.

**Report faithfully:** run the gates and state real results; if a test fails, say so with the output; if a guard is unreachable, say that rather than faking coverage; end with an honest verdict (`READY` / `INCOMPLETE` / `PROCEED WITH CONDITIONS`), never an optimistic one. The discipline's track record — a real defect found in every review cycle — exists because reports told the truth.

---

*ENGINEERING-STANDARDS-001 in one sentence: contracts before code, a pure domain behind ports, one writer per fact, detected-change events, and no line of reachable code without a test — enforced by gates where possible and by an adversarial, empirical, truthful review everywhere else.*
