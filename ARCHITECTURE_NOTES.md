# DOF Module 1 — Architecture Notes

Load-bearing implementation decisions future modules must respect. Authoritative sources: ADR-001, BLUEPRINT-001, the Engineering Constitution, and `DECISIONS.md` (D-01…D-41). This file is the quick map.

## Shape: DDD modular monolith
- `domains/<domain>/{domain,application,infrastructure}` + `shared-kernel`. Domain code is framework-free (enforced by `check:boundaries`). Server routes are thin adapters; business rules live in domain/application; repository **interfaces** live in the domain (`ports.ts`), implementations in infrastructure.
- Clean extraction seams: each domain owns its own tables and its own event/outbox/audit quartet, so a domain can later become a service without a schema rewrite. Merchant, Business, and Store are distinct aggregates by design.

## Data constitution (ADR-004)
Manifest-first (`contracts/data/manifest.json`, one owner per table, CI-gated), UUIDv7 app-generated PKs, `timestamptz` only, money as bigint minor units, `text + CHECK` instead of native enums, **no cross-domain foreign keys** (integrity by contract + reconcilers), **no `ON DELETE CASCADE`** (explicit tombstoning), forward-only migrations.

## Per-domain quartet (D-22)
Each domain has `*_domain_events`, `*_outbox_events`, `*_event_deliveries`, `*_audit_logs`. One parameterized `PgEventStore` / `OutboxDispatcher` implementation is instantiated per domain with that domain's table names and its own ordering-scope function — one code path, per-domain isolation.

## Transactional outbox + event store
- `PgEventStore.append` writes the domain event **and** its outbox row in the caller's transaction (atomic with the aggregate change). Per-aggregate `sequence` + `UNIQUE(aggregate_type, aggregate_id, sequence)` is the optimistic-concurrency guard.
- `OutboxDispatcher` claims partition-serially with `SKIP LOCKED`, validates payloads (dead-letter on invalid), delivers to consumers with `event_deliveries` idempotency **inside the delivery transaction**, backs off exponentially, dead-letters after 10. Cron is the delivery guarantee; `waitUntil` is opportunistic only.
- **Ordering:** per-business (`partition_key = business_id`) via DB `seq`, not global — the guarantee is honest and not overstated.

## Triple command gate (D-…)
RBAC → Entitlement → Trust/Standing, centralized in `shared-kernel/command-gate.ts`. Store `status` and `enforcement_hold` are **orthogonal** (independent columns + independent checks) — a hold blocks publish regardless of status.

## Contract-first
`contracts/schemas/**` zod schemas are the source of truth; endpoints validate in/out; errors are RFC 9457 problem+json with stable codes; Idempotency-Key supported (D-01); correlation IDs propagated (D-20).

## Composition
`server/utils/container.ts` is the single composition root — one `pg.Pool`, per-domain deps/commands/queries/dispatchers wired explicitly. No service locator, no hidden globals. `getContainer()` is lazy and fails closed without `NUXT_DATABASE_URL`.

## Serverless (Vercel) model
Stateless request handlers; all coordination state in Postgres; bounded, resumable cron for background work; `waitUntil` only for non-critical acceleration. Runtime is Node (not Edge) for pg compatibility.

## Invariants a future module must not break
1. Never add a cross-domain FK; reconcile via events.
2. Never write another domain's tables directly.
3. All mutations go through the command gate + audit + (where a fact changes) an emitted event via the outbox.
4. Append-only tables stay insert-only in code; immutability is enforced by grants/role in prod.
5. New events are registered only when actually emitted (emitted-only law); payloads carry no secrets/unnecessary PII.
