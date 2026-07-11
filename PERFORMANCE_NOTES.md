# DOF Module 1 — Performance & Scalability Notes

Decisions that let the Merchant Kernel scale to millions of merchants/stores without an architectural rewrite. Grounded in `db/migrations/0001_merchant_kernel.sql` and the platform layer.

## Indexing strategy
- **Shard-key-leading composites.** Every business-scoped index leads with `business_id` (`idx_stores_business_status (business_id, status)`, `idx_domain_events_business (business_id, occurred_at)`, `idx_audit_business (business_id, created_at DESC)`). This keeps a business's rows physically clustered for its own reads and is forward-compatible with hash/range partitioning by `business_id` when a single business's volume demands it.
- **Partial indexes for hot, sparse predicates.** `idx_outbox_pending (status, next_attempt_at) WHERE status='pending'` keeps the dispatcher's claim scan proportional to the *backlog*, not the *history*. Likewise `idx_businesses_bad_standing WHERE standing<>'good'`, `idx_entitlements_live WHERE revoked_at IS NULL`, `idx_store_handles_store WHERE store_id IS NOT NULL`. These stay small as dispatched/good/live rows dominate.
- **Uniqueness as an index.** `idx_one_owner_per_business` (partial unique) enforces the owner invariant *and* serves owner lookups; `stores.handle`/`store_handles.handle` are `citext` unique (case-insensitive) doubling as handle-resolution indexes.

## Outbox dispatch (the throughput-critical path)
- **Batch-bounded, row-per-tx.** `dispatchPending(limit=50)`, each row its own transaction → resumable and serverless-safe (no long-held locks, bounded execution).
- **`FOR UPDATE … SKIP LOCKED`** lets N concurrent dispatchers share the backlog with zero lock contention; the `NOT EXISTS (… seq < o.seq)` clause preserves per-business ordering without a global lock.
- **`seq` (bigint identity), not UUID, for ordering** — UUIDv7 is not monotonic within a millisecond, so a DB-assigned sequence is the correct ordering key.
- **Housekeeping** purges dispatched rows >7d and pre-creates the next audit partition each run — table growth is bounded, not linear-forever.

## Table-growth management
- `audit_logs` is **month-partitioned** (`PARTITION BY RANGE (created_at)`) with a default partition + auto-extension → old months detach/archive cheaply; no monolithic audit table.
- `request_idempotency_keys` purged at 24h ([idempotency-store.ts](platform/idempotency-store.ts)).
- `domain_events` is append-only and indexed by `(business_id, occurred_at)` and `(event_type, occurred_at)` for replay/projection rebuild.

## Known N+1 (bounded, deliberate)
`workspaceOverviewQuery` loads business + stores per membership. At a normal merchant's membership count this is trivial; the file already documents it becomes a **projection/read-model when Pulse (Module 3) lands**. Not a rewrite — a planned read-model swap behind the same query interface.

## Serverless / connection posture
- Single `pg.Pool` per container instance; the outbox is pulled by **cron** (bounded) plus opportunistic `waitUntil` (best-effort) — no permanently-running worker assumed.
- No process-local durable state; all coordination is in Postgres (outbox status, `event_deliveries`, idempotency keys).

## Deferred (not premature)
- Per-business partitioning of `stores`/`domain_events` — only when a single business's volume warrants it; the `business_id`-leading schema makes it a non-breaking change.
- Capability-resolution / handle-lookup caching — measure first; the queries are single-index lookups today.
