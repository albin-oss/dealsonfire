# DOF Platform Data Constitution

**Document:** ADR-004 — Platform Data Constitution
**Status:** Proposed (v1.0)
**Date:** 2026-07-03
**Scope:** The permanent rules governing all data in DOF, for every current and future bounded context. This document designs no schemas; it constrains everyone who does. ADR-001/002/003 are frozen; where a rule below generalizes something Module 1 shipped, the shipped code is cited as precedent. Where Module 1 must change, it is listed in the closing section — nowhere else.

**Format:** every rule states **R** (the rule), **Why**, **Example**, **Exceptions**, **Enforced by**. An exception not listed here requires an ADR.

---

## 1. Primary Keys

**R:** Application-generated **UUIDv7** for all aggregate and entity tables, surfaced in code as branded types. Tables needing *total insertion order* carry an additional DB-assigned `seq bigint identity` — never rely on UUIDv7 for ordering. Natural keys are permitted as PKs only for registry/ledger tables whose identity *is* the natural key. External systems' identifiers are stored as opaque `text` attributes, never as our keys.
**Why:** UUIDv7 gives index-friendly time-ordering without coordination; branding makes cross-entity ID confusion a compile error (Module 1 precedent). The `seq` rule exists because we were burned: UUIDv7 is **not monotonic within one millisecond** — multi-row inserts from one transaction order randomly (D-15, caught by the PROMPT-005 verification).
**Example:** `stores.id uuid` + `StoreId` brand; `outbox_events.seq` for claim ordering; `capabilities.key text PK`, `store_handles.handle citext PK`; `payments.provider_ref text` (Stripe id, opaque).
**Exceptions:** join/child tables may use composite PKs of their parents (`collection_listings`, `event_deliveries` precedent).
**Enforced by:** migration lint (every new table PK is uuid, composite-of-uuid, or a documented registry key; ordering-sensitive tables must have `seq`); code review for branding.

## 2. Naming Conventions

**R:** `snake_case` everywhere in the database. Tables: plural nouns (`businesses`), no prefixes except `rm_` for read models. Columns: `*_id` references, `*_at` timestamps, `*_count` counters; booleans are affirmative predicates (`default_available`, `social_amplify` — never `not_x`, never `flag`). Indexes `idx_<table>_<purpose>`, uniques `uq_`, checks `chk_`, triggers `trg_`, functions descriptive verbs. Events: `<domain>.<aggregate>.<past_tense_fact>` (ADR-003 §4). Migrations: `NNNN_short_description.sql`, zero-padded, strictly increasing.
**Why:** predictability is a query-writing and incident-response speed multiplier; the reader should never wonder whether it's `storeId`, `store`, or `fk_store`.
**Example:** `idx_outbox_pending_partition`, `chk_staff_roles`, `merchant.store.published`.
**Exceptions:** none — naming has no valid exceptions.
**Enforced by:** migration lint (regex checks on DDL identifiers); schema-registry naming check for events.

## 3. Timestamps

**R:** `timestamptz` only — `timestamp` (without zone) is banned. `created_at` on every table; `updated_at` (trigger-maintained, Module 1's `set_updated_at`) on every *mutable* table; append-only tables have **no** `updated_at` by construction. Nullable `*_at` columns are **fact markers**: presence means the fact occurred (`published_at`, `deleted_at`, `revoked_at`) — never booleans duplicating them.
**Why:** UTC-normalized storage kills a whole bug family; fact-marker timestamps carry *when* for free and cannot disagree with a sibling boolean.
**Example:** `stores.published_at` doubles as "has ever launched" (drives the `store.published` vs `store.resumed` distinction).
**Exceptions:** none for new tables.
**Enforced by:** migration lint (`timestamp` keyword without `tz` fails; new mutable table without the trigger fails).

## 4. Soft Delete vs Hard Delete

**R:** Data is classified (rule 20) and its class decides. **Business facts** (aggregates with event history) are never hard-deleted: reversible removal = domain state (`archived`, `closed`); irreversible removal = **tombstone** (`deleted_at` + PII scrub, id never reused). **Operational data** (idempotency keys, dispatched outbox rows, expired reservations/handle holds) is hard-deleted on schedule — keeping it is the anti-pattern.
**Why:** aggregates anchor events, audit, and finance obligations; deleting the row orphans history. Operational rows are exhaust, and "soft-deleting" exhaust builds landfills.
**Example:** store lifecycle closed→deleted-tombstone with 90-day reopen + handle quarantine (ADR-001 §7); `request_idempotency_keys` purged at 24h (shipped).
**Exceptions:** legal erasure orders may scrub tombstones harder — via the rule-19 erasure procedure, never ad-hoc SQL.
**Enforced by:** table manifest declares delete class; migration lint rejects `ON DELETE CASCADE` (rule 12) and reviews any `DELETE`-issuing repository method against the class.

## 5. Archival & Retention

**R:** every table declares a **retention class** in its manifest: `permanent` (aggregates, ledgers), `windowed(N)` (operational, with N), `partition-archived` (monthly partitions moved to cold storage after M months), `regulatory(policy)` (audit/finance — jurisdiction-driven). Undeclared retention = failed review.
**Why:** retention decided at incident time is retention decided wrong; regulators ask for the policy, not the vibes.
**Example:** `audit_logs` partitions → cold storage per compliance schedule; `outbox_events` dispatched rows `windowed(7d)` (shipped); `domain_events` permanent while any referenced aggregate lives.
**Exceptions:** none; "we'll decide later" is `permanent` until amended.
**Enforced by:** manifest completeness check in CI; archival jobs are named per class, not per table.

## 6. Audit Logging

**R:** Module 1's audit is the platform standard, verbatim: every accepted command writes its audit row **inside the command transaction**; denied *sensitive* commands are audited outside any transaction; rows carry actor (mandatory — no anonymous writes), command name, sensitivity, target, PII-minimized before/after digests, correlation context. Append-only: the application role has **no UPDATE/DELETE grant** on audit tables. Month-partitioned from day one. Each domain writes its own audit table; Administration aggregates via projection (ADR-003 §3).
**Why:** in-tx auditing makes "it happened but wasn't audited" impossible (proven by the Module 1 atomicity test); grant-level immutability survives application bugs.
**Example:** shipped `audit_logs` + `PgAuditLog` (D-10).
**Exceptions:** none.
**Enforced by:** the command-endpoint wrapper (structural); deploy-time role grants; partition-existence housekeeping (shipped).

## 7. Multi-Tenancy

**R:** shared-schema, shared-database tenancy. Every business-scoped table carries the tenant key (`business_id`), which **leads every composite index** and is the future shard key. Isolation is enforced at the repository + gate layer with existence masking (cross-tenant probes answer 404). Tenant key is immutable after insert. Non-business-scoped domains (Identity, Community) declare their own scoping key in the manifest.
**Why:** merchant workloads are naturally tenant-isolated (ADR-001 §14); shared schema is operationally sane at 10M tenants *because* the key discipline makes sharding a deployment change, not a redesign.
**Example:** shipped kernel — every table, every index.
**Exceptions:** platform-global registries (`capabilities`, taxonomy) are tenant-less by nature. Postgres RLS is *not* used day one (the app is the only client); it becomes mandatory defense-in-depth the day any second client (BI tool, admin console with direct SQL) touches the database.
**Enforced by:** migration lint (business-scoped table without leading-`business_id` index fails); masking behavior integration-tested (shipped pattern).

## 8. Money

**R:** integer minor units (`bigint`) + ISO-4217 `char(3)`, always together, represented in code exclusively by the kernel `Money`/`Price` VO. Floating point for money is **constitutionally banned** — in columns, JSONB, events, and analytics exports alike. Percentages/rates stored as basis points (`int`).
**Why:** A3 since Module 1; float money is the classic irreversible data corruption.
**Example:** `price_amount bigint, price_currency char(3)`; event payloads `{amount, currency}`.
**Exceptions:** none. Not analytics, not "just a cache."
**Enforced by:** migration lint (`real|double|numeric` on `*amount*|*price*` columns fails); CI grep for float money in code; schema registry rejects number-typed money in event payloads.

## 9. Time Zones

**R:** storage is UTC (rule 3). Wall-clock intent (schedules, "back on Monday") is stored as the **Schedule VO pattern**: IANA zone name + local wall time, resolved to UTC at evaluation. Raw UTC offsets are banned (they lie twice a year).
**Why:** a merchant's "sale ends Friday midnight" means *their* Friday; storing the zone preserves intent across DST.
**Example:** `offers.schedule jsonb {starts_at, ends_at, tz: "Europe/Berlin"}` (ADR-002).
**Exceptions:** none.
**Enforced by:** Schedule VO is the only sanctioned shape; schema registry checks event schedule payloads.

## 10. JSONB Usage

**R:** JSONB is for **value-object documents** (BrandKit palette, Schedule, provenance, policies), **extensible attribute maps**, and **context blobs** (audit context). JSONB is **not** for: anything filtered/joined relationally at scale (promote to a column the moment it needs an index), anything carrying FK-like semantics, bare money amounts, or entity lists that grow unboundedly. Long-lived JSONB documents carry an internal `version` key. Size budget: 100KB soft ceiling per document.
**Why:** JSONB buys schema flexibility at the price of opacity; the rule keeps the flexibility where opacity is harmless.
**Example (good):** `brand_kits.palette`. **(banned):** `orders.line_items jsonb` — line items are entities.
**Exceptions:** read models may denormalize aggressively into JSONB (they are disposable, rule 16).
**Enforced by:** design review via manifest (each JSONB column declares its document type); GIN indexes require a named query justification (ADR discipline: complexity when justified).

## 11. Enums vs Lookup Tables

**R:** closed, platform-defined, deploy-changing sets → `text` + `CHECK` constraint (A5). Data-driven, runtime-growing sets → registry tables. Native PostgreSQL `ENUM` types are **banned**.
**Why:** CHECK edits are ordinary migrations; PG enums fight every alteration. Registry tables (capabilities precedent) make the set itself data, reviewable like code.
**Example:** `stores.status` CHECK; `capabilities` table; `chk_staff_roles` (D-18 — deliberate migration friction for a security-relevant list).
**Exceptions:** none.
**Enforced by:** migration lint (`CREATE TYPE ... AS ENUM` fails).

## 12. Foreign Keys

**R:** **within a domain:** real FKs, `ON DELETE RESTRICT` — cascade deletion is banned (tombstoning is explicit, rule 4). **Across domains:** FKs are banned; integrity is by contract, events, and reconciliation (rule 24). Nullable FKs require a stated meaning for NULL.
**Why:** in-domain FKs are cheap correctness; cross-domain FKs physically weld bounded contexts together and make extraction (ADR-003 §9) a lie. `RESTRICT` turns "oops, cascaded the catalog" into an error instead of an incident.
**Example:** `stores.business_id REFERENCES businesses RESTRICT`; `merchant_accounts.user_id uuid` — *no* FK to Identity (shipped precedent).
**Exceptions:** none for cascade; cross-domain FK exceptions do not exist.
**Enforced by:** migration lint (CASCADE fails; FK targets checked against the domain's own manifest).

## 13. Indexing

**R:** every FK used on a write or lookup path is indexed. Composite indexes lead with the tenant key (rule 7). **Partial indexes** are the default tool for sparse states (pending rows, bad standing, one-owner invariants). Every repository query names its supporting index at review; speculative indexes are removed, not kept "just in case."
**Why:** indexes are the write tax you pay for read speed — pay it deliberately. Partial indexes make invariants and queues nearly free (`idx_one_owner_per_business`, `idx_outbox_pending_partition` precedents).
**Example:** the shipped kernel's index set — none unused, none missing (REVIEW-001 checked).
**Exceptions:** GIN/GiST require a named query and a size estimate first.
**Enforced by:** migration review checklist; periodic `pg_stat_user_indexes` unused-index report as an ops job.

## 14. Partitioning

**R:** append-only, high-volume tables (audit, events, future order/message logs) are **range-partitioned by month from creation**, with an ensure-partition function + DEFAULT safety partition, and PKs including the partition key. Huge mutable tables (products, listings) are **hash-partition-ready** (every query leads with the tenant key) but partitioned only at measured volume. **The D-02 law:** if a load-bearing unique constraint cannot include the partition key, the table is *not* partitioned until the constraint is redesigned — correctness beats partitioning.
**Why:** retrofitting partitions is painful; but PostgreSQL's global-uniqueness limitation is real and we refuse to weaken invariants for it (D-02: `domain_events` stays unpartitioned to keep the concurrency guard).
**Example:** `audit_logs` (partitioned, shipped); `domain_events` (documented exception, shipped).
**Exceptions:** exactly the D-02 pattern, documented per table.
**Enforced by:** migration lint (new append-only table above the volume class without partitioning fails review; partitioned table whose unique excludes the key fails hard).

## 15. Event Storage

**R:** per ADR-003 §4, physically: append-only `domain_events` per module — no UPDATE/DELETE grants; envelope columns include `correlation_id`/`causation_id` (W1) and `partition_key` with owner-defined scope (W3); per-aggregate `sequence` with the unique concurrency guard; outbox rows written in the producing transaction; events are **never rewritten** — evolution happens in consumers (upcasting) and via schema versions; payload schemas live in the registry and are validated at the dispatcher (M-6).
**Why:** the event log is the platform's memory and every read model's parent; a rewritable event log is a novel, not a ledger.
**Example:** shipped `domain_events` + `outbox_events` + `event_deliveries` trio.
**Exceptions:** none.
**Enforced by:** role grants; schema-registry CI gate; dispatcher validation (shipped).

## 16. Read Model Storage

**R:** `rm_` prefix; owned by the consuming domain; built **only** from events; no FKs to source tables (sources may live in another service tomorrow); registered in the **projection registry** with source event types and rebuild procedure; rebuildable via shadow-table + atomic rename with a CI drill (W4); truncating a read model must never lose business facts, by construction.
**Why:** ADR-003 rules 5–6 need physical teeth: prefixes make accidental writes reviewable, registration makes the rebuild drill enumerable.
**Example:** `rm_store_public` (Module 2b).
**Exceptions:** none.
**Enforced by:** migration lint (`rm_` tables may not be FK targets, may not be written outside their builder); projection-registry drill in CI.

## 17. Migration Strategy

**R:** forward-only, numbered, one transaction per migration, advisory-locked runner (shipped). No down-migrations — recovery is roll-forward or restore. Breaking shape changes use **expand → migrate → contract** across separate releases. Large-table data changes are separate, batched, resumable jobs — never inside schema migrations. **Amendment rule:** a migration file may be edited only while no persistent environment has applied it (the 0002 precedent, now law); after that, amendments are new migrations.
**Why:** down-migrations are fiction under data loss; expand/contract keeps deploys zero-downtime; the amendment rule keeps history honest without ritualizing pre-ship churn.
**Example:** shipped `db/migrate.ts`; 0002 amended pre-ship for the `seq` fix.
**Exceptions:** none.
**Enforced by:** runner design (shipped); migration lint (numbering gaps, edits to applied files detected via checksum table).

## 18. Backward Compatibility

**R:** additive-first, always. Column removal: deprecate (manifest flag) → stop writing → stop reading → drop, across ≥2 releases. Renames are banned — add new, dual-write, backfill, drop old. Contract compatibility (events, DTOs) follows ADR-003 §4 (dual-publish windows for breaking event versions).
**Why:** the monolith deploys atomically today, but read models, replicas, and tomorrow's extracted services do not; additive discipline is what makes ADR-003 §9's strangler migration possible at all.
**Example:** adding `correlation_id` to `domain_events` is additive (nullable, backfill-free) — exactly why W1 is cheap now and expensive later.
**Exceptions:** pre-ship amendments (rule 17).
**Enforced by:** migration lint (DROP/RENAME without a deprecation marker fails); schema-registry compatibility gate.

## 19. PII Classification & Encryption

**R:** four tiers, declared per column in the manifest: **P0** (no personal data), **P1** (pseudonymous ids), **P2** (personal — names, emails, addresses), **P3** (sensitive — KYC evidence, government ids). Rules: PII minimization is a design requirement (a domain that can hold an id instead of a name must — kernel precedent); **P2+ never appears in event payloads, audit digests, logs, or read models serving other domains**; P3 lives only in its owning domain (Identity/Trust/Media) with application-layer envelope encryption on top of provider at-rest encryption; erasure = tombstone + scrub with regulatory carve-outs, executed by a per-domain erasure procedure, never ad-hoc.
**Why:** the cheapest PII to protect is the PII you never copied; classification makes "where is this person's data" a query over the manifest instead of an archaeology project.
**Example:** kernel audit digests are PII-minimized by design (shipped); KYC documents are MediaRefs into encrypted Media storage (ADR-001 §10).
**Exceptions:** Notification necessarily handles P2 (delivery addresses) — declared, scoped, and purged per retention class.
**Enforced by:** manifest completeness check; schema-registry payload scan (P2-classified field names flagged in event schemas); log-scrubbing middleware.

## 20. Data Lifecycle Management

**R:** every table declares exactly one **class** — `aggregate`, `ledger` (append-only business ledger), `event`, `read_model`, `operational`, `registry` — and the class binds the rules: delete semantics (4), retention (5), audit expectations (6), partitioning defaults (14). The manifest row is: *table, class, owner domain, tenancy key, PII tier, retention, delete class*.
**Why:** twenty-five rules are unusable per-table unless bundled; the class system is the bundling.
**Example:** `outbox_events` = operational/windowed(7d)/P0; `businesses` = aggregate/permanent/P2(display_name).
**Exceptions:** a table that fits no class is a design smell — ADR required.
**Enforced by:** the manifest is machine-readable in `contracts/data/`; CI fails migrations creating unmanifested tables.

## 21. Backup & Recovery

**R:** managed-Postgres PITR as baseline; targets: **RPO ≤ 5 minutes, RTO ≤ 1 hour** for the OLTP cluster; quarterly restore drills into an isolated environment (a backup is a rumor until restored); read models excluded from recovery objectives (rebuildable, rule 16); the event log is a *consistency check* and read-model recovery source — the relational aggregates remain the source of truth for state recovery.
**Why:** honest RPO/RTO numbers change design conversations; drills convert them from aspiration to property.
**Example:** post-restore reconciliation = replay recent `domain_events` against restored aggregates to detect torn recovery.
**Exceptions:** Analytics warehouse may declare looser targets.
**Enforced by:** scheduled drill runbook with pass/fail recorded; alerting on backup age.

## 22. Performance Standards

**R:** budgets by query class, measured at p95: storefront read models ≤ 50ms at origin (edge-cached above), workspace queries ≤ 200ms, command transactions ≤ 300ms, sync Query APIs ≤ 100ms with declared timeout+fallback (ADR-003 §5). No repository query ships without a supporting index (rule 13). Cross-domain N+1 is banned (ADR-003); in-domain N+1 requires justification. Command transactions hold locks for the command only — no external calls inside a database transaction, ever.
**Why:** budgets make "slow" an objective regression, not a mood; the no-external-calls-in-tx rule prevents the classic pool-exhaustion outage.
**Example:** Ignite AI steps are queued *outside* transactions with their own p95 budgets (ADR-001 §14).
**Exceptions:** budget changes are declared per endpoint in contracts, not silently.
**Enforced by:** latency assertions in integration tests for hot paths; explain-plan review for scale-table queries; lint for `await fetch|http` inside `withTransaction` callbacks.

## 23. Data Validation Responsibilities

**R:** three layers, each with a distinct job — **contracts** (zod at the boundary: shape, types, bounds), **domain** (VOs + aggregates: invariants, transitions, business rules), **database** (constraints: the invariants that must survive application bugs — uniqueness, one-owner, closed sets, tenancy immutability). The database is the *last* line, never the only line; the UI is *no* line.
**Why:** each layer catches what the previous cannot (concurrent writers defeat app-level uniqueness — the DB catches them; malformed requests never deserve a transaction).
**Example:** exactly-one-owner enforced in the aggregate *and* the partial unique index (shipped, tested at both layers).
**Exceptions:** none.
**Enforced by:** the layering is structural (endpoint wrapper → aggregate → constraint); review checklist asks "which invariants are DB-backed?"

## 24. Referential Integrity

**R:** in-domain: FKs (rule 12). Cross-domain: **contract + reconciliation** — the referencing domain stores the id, subscribes to the owner's lifecycle events for cleanup, and a scheduled **reconciliation job** per reference class detects orphans/drift and emits anomaly events (to Administration/ops), never auto-deletes.
**Why:** cross-domain integrity is a *process*, not a constraint; silent drift is the failure mode, so detection is the requirement. Auto-repair is banned because the reconciler cannot know which side is wrong (ADR-003 rule 6 does: the owner).
**Example:** Commerce listings referencing a closed store react to `merchant.store.closed`; a weekly reconciler verifies no published listing points at a closed store.
**Exceptions:** none.
**Enforced by:** each cross-domain reference declared in the manifest with its cleanup event + reconciler named; CI checks the declaration exists.

## 25. Data Ownership & Stewardship

**R:** the **table manifest** (rule 20) is the single stewardship record: every table has exactly one owning domain; migrations may only touch tables the migrating module owns; cross-domain data questions are answered by the manifest, not by grep. The manifest lives in `contracts/data/` (machine-readable), is versioned with the code, and is the input to the CI checks in rules 7, 16, 19, 20, 24.
**Why:** ADR-003 §3 assigned owners to *concepts*; this binds owners to *bytes*. Ownership that isn't machine-checkable erodes at the third urgent Friday deploy.
**Example:** the kernel's 14 tables → manifest rows owned by `merchant`.
**Exceptions:** none.
**Enforced by:** CI manifest gate (the master enforcement point for this constitution).

---

## Closing Deliverables

### 1. Required changes to Merchant (and Commerce plans) before Module 2 implementation

| # | Change | Rule | Size |
|---|---|---|---|
| C1 | **Migration 0003:** add nullable `correlation_id uuid` + `causation_id uuid` to `domain_events`; thread both through the envelope, event store, dispatcher, and command wrapper (audit already carries correlation) | 15 / ADR-003 W1 | small, additive |
| C2 | **Create the table manifest** (`contracts/data/manifest`) covering all 14 kernel tables: owner, class, tenancy key, PII tier, retention, delete class — and wire the CI manifest gate | 20/25 | small |
| C3 | **Codify `partition_key` semantics** in the event-store contract (owner-defined ordering scope; kernel's `business_id ?? aggregate_id` is the merchant implementation) — documentation + contract comment, no schema change | 15 / ADR-003 W3 | trivial |
| C4 | **Deploy-time role grants:** application role loses UPDATE/DELETE on `audit_logs` and `domain_events` (currently convention, not grant) | 6/15 | infra task |
| C5 | **Projection registry scaffold + rebuild drill** lands with Commerce's first `rm_` table — built into BLUEPRINT-002, not retrofitted | 16 / W4 | with Module 2b |
| C6 | BLUEPRINT-002 must specify Commerce tables **manifest-first** (class/PII/retention per table before columns) | 20 | process |

### 2. Platform-wide standards enforced in CI (the executable constitution)

Existing: boundary lint · typecheck · unit+integration on real PG · schema-registry payload validation (M-6).
**Added by this ADR:** migration lint (naming, timestamptz, no PG enums, no CASCADE, no float money, partition-key-in-unique, forward-only checksums, DROP/RENAME deprecation gate) · **table-manifest gate** (unmanifested tables fail; migrations touching unowned tables fail) · event-schema compatibility gate (breaking change without version bump fails) · projection rebuild drill (per registered `rm_` table) · no-external-calls-in-transaction lint · PII field-name scan on event schemas.

### 3. Recommendation

**Approve, with conditions:** C1–C4 land before BLUEPRINT-002 is written (C1 is the only code change and it is additive); C5–C6 are obligations *on* BLUEPRINT-002 itself. Nothing here reopens ADR-001/002/003 — this constitution is compatible with everything shipped, because it was largely *derived* from what shipped survived: REVIEW-001 and the PROMPT-005 verification are effectively this document's first two case studies.

---

*ADR-004 of the DOF Operating System. Amendments require a superseding ADR naming the rule modified. The table manifest and CI gates defined here are constitutional machinery: disabling them is an architecture change, not a configuration change.*
