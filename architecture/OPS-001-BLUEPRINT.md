# DOF Platform — OPS-001-BLUEPRINT

# Locations + Inventory Core — Sprint Implementation Blueprint

**Status:** Accepted (the OPS-001 sprint contract) · **Version:** 1.0 · **Date:** 2026-07-07
**Derives from:** ADR-006 (incl. refinements F-1…F-8) · BLUEPRINT-003 v1.1 · ADR-001…ADR-005 · ADR-004 Data Constitution · Merchant Kernel · Platform Foundation · Commerce Product Slice idioms · DECISIONS.md.
**Scope discipline:** Locations + Ghost policy · StockItem + movement ledger · adjustments · tracking enable/disable · Availability projection · low/out/restocked/oversold events · CSV stock source · MerchantAccessPort + CatalogPort · the Operations event quartet. **Nothing else** — shipping, suppliers, transfers, counts, fulfillment, returns, orders, UI are later sprints. No code in this document; every name below is binding vocabulary for the implementer.

---

## 1. Folder Structure — `domains/operations/`

Mirrors `domains/commerce/` exactly (boundary-lint rules apply unchanged: framework-free, zod-free, domain layers import only `platform/types|events`, never pg):

```
domains/operations/
├── shared-kernel/
│   ├── ids.ts                 # LocationId, StockItemId, SourceBatchId (branded, asXxxId)
│   └── reason-codes.ts        # REASON_CODES const + ReasonCode type; SUB_REASONS
├── locations/
│   ├── domain/
│   │   ├── location.ts        # aggregate root (L1–L4)
│   │   ├── value-objects.ts   # LocationKind, Address, OperatingWindow, LocationStatus
│   │   └── events.ts          # event constructors + operationsOrderingScopeOf (shared)
│   ├── application/
│   │   ├── ports.ts           # OperationsDeps (shared with inventory/ — see §2 note)
│   │   ├── access.ts          # withAuthorizedBusiness / withAuthorizedLocation
│   │   ├── dto.ts
│   │   └── commands/{create-location, update-location, close-location, ensure-ghost-location}.ts
│   │   └── queries/locations.ts
│   └── infrastructure/
│       └── location-repository.ts
├── inventory/
│   ├── domain/
│   │   ├── stock-item.ts      # aggregate root (S1–S5 + F-3/F-4)
│   │   ├── movement.ts        # StockMovement record type + invariant helpers
│   │   ├── value-objects.ts   # TrackingMode, Bucket, SafetyStock, Threshold
│   │   └── events.ts
│   ├── application/
│   │   ├── dto.ts
│   │   ├── commands/{enable-tracking, disable-tracking, adjust-stock}.ts
│   │   └── queries/{stock, availability}.ts
│   └── infrastructure/
│       ├── stock-repository.ts        # StockItem + same-tx ledger append (S2 lives here)
│       ├── movement-read-dao.ts       # the biography query (keyset)
│       └── availability-projection.ts # projection handler (registry-registered)
└── sourcing/
    ├── application/
    │   ├── source-adapter.ts          # StockSourceAdapter contract (capability matrix)
    │   ├── csv-source.ts              # header mapping + row → movement plan (pure)
    │   └── commands/import-stock.ts   # batch orchestration
    └── infrastructure/
        └── source-batch-repository.ts
```

Composition-root additions (`server/utils/`): `operations-access.ts` is **not** created — the existing `merchantAccessAdapter` instance satisfies operations' port by structural typing (§2). New: `catalog-port.ts` (the Commerce adapter), container wiring (§7), endpoints under `server/api/v1/` (§6).

**Port-sharing note:** `OperationsDeps` lives once in `locations/application/ports.ts` and is imported by `inventory/` and `sourcing/` via a re-export from `domains/operations/shared-kernel` types barrel? **No** — shared-kernel stays pg-free types only; `ports.ts` sits at `domains/operations/application-ports.ts`? **Decision OB-1:** follow commerce precedent exactly — one `ports.ts` per domain at `domains/operations/locations/application/ports.ts` is wrong for three modules; instead `domains/operations/shared-kernel/ports.ts` holds the `OperationsDeps` interface (types only — interfaces of repos/ports, no pg imports; this is exactly what shared-kernel is for). Boundary rule check: shared-kernel may hold cross-module *interfaces*; implementations stay in each module's `infrastructure/`.

## 2. Aggregates & Value Objects

**Location** (root; identity `LocationId`):
- Props: businessId · kind (`home | store | warehouse | fulfillment_center | partner | temporary | popup`) · name (1–80) · address (VO, nullable) · pickupInstructions (≤500, nullable) · operatingWindow (VO, nullable; **mandatory for `popup`/`temporary`**) · status (`active | closed`) · isDefault · sequence.
- Behaviors: `create` (factory) · `rename/update` (D-29 detected-change; archived-closed refuse) · `close(hasStock)` — refuses when the caller-supplied stock check says nonzero sellable/on-hold anywhere at this location (L2; the *command* performs the check via StockRepository, the aggregate enforces the passed fact) · `markDefault` (internal only this sprint).
- Invariants: **L1** one active default per business (DB partial unique index is the big brother; the Ghost command is the only writer of `isDefault=true`) · **L2** close requires zero stock (educating error names the transfer door, arriving OPS-004) · **L3** `partner` refuses manual adjustments (enforced in AdjustStock, not here) · **L4** popup/temporary expiry is a warning fact, never auto-close (no OPS-001 behavior; window stored for later).

**StockItem** (root; identity `StockItemId`; one per (variantId, locationId), lazily created):
- Props: businessId · variantId (by value) · locationId · trackingMode (`untracked | tracked | digital | service | made_to_order`) · buckets `{ sellable, damaged, on_hold, quarantine }` (non-negative integers) · safetyStock (≥0, default 0) · lowStockThreshold (nullable) · incoming (0 this sprint; column exists for OPS-004) · sequence.
- Behaviors (each returns detected-change events + the movement rows to append — the repository persists both in one tx):
  - `enableTracking(openingQuantity, actor)` — mode → `tracked`, seeds one movement (`reason: opening_count`, bucket sellable, delta = opening) unless already tracked (silent no-op → CONFLICT? **Decision OB-2:** re-enable when already tracked is a silent no-op per D-29; enabling on `digital/service/made_to_order` modes is a VALIDATION error that educates about what those modes mean).
  - `disableTracking(actor)` — mode → `untracked`; balances stay recorded, ledger stays (S3); emits `tracking_disabled` with the frozen balances snapshot.
  - `adjust(bucket, delta, reason, subReason, actor)` — appends one movement; recomputes bucket; **threshold transitions computed here** (D-29 detected change): crossing `sellable − safetyStock` ≤ threshold downward ⇒ `low_stock`; hitting available 0 ⇒ `out_of_stock`; rising from 0 ⇒ `restocked`. Negative-result rejection with educating copy — except `reason: count`, where reality wins: clamp at 0, emit `oversold_detected { shortfall }` (S1 + ADR-006 emission path).
- Invariants: **S1** buckets never negative through commands (count clamps + events) · **S2** every balance change = exactly one ledger line, same transaction (repository law, gate-tested §13) · **S4** reserved-vs-sellable deferred to Phase B (no reservations this sprint) · **S5** condition moves deferred (no MoveCondition command in OPS-001; adjustments target one bucket).
- ATP (F-4): `available = max(0, sellable − safetyStock)`; `null` (∞) when mode ∈ {untracked, digital, made_to_order}; `service` reports `null` this sprint (capacity engine later).

**Value objects:** `LocationKind`, `Address { line1, line2?, city, region?, postal, country }` (ISO country, no validation service — format only), `OperatingWindow { startsAt, endsAt, timezone }`, `TrackingMode`, `Bucket`, `ReasonCode` = `opening_count | received | adjustment | count | import` with `SubReason` = `damaged | lost | found | correction | import_undo | other` (transfer/return/sold codes are declared in `reason-codes.ts` now, unused until their sprints — a const list is not placeholder code, it is the contract), `SafetyStock`, `Quantity` (int ≥ 0, guards `Number.isSafeInteger`).

## 3. PostgreSQL Table Plan (migration `0006_operations_core.sql`)

**The quartet — copy migration 0004's shapes byte-for-byte with renamed tables:** `operations_domain_events` (id uuid PK, aggregate_id, aggregate_type, sequence, event_type, payload jsonb, actor jsonb, occurred_at, correlation_id, causation_id, partition_key) + `operations_outbox_events` (seq bigint identity ordering — D-15, domain_event_id, partition_key, status, attempts, next_attempt_at, dead_lettered_at…) + `operations_event_deliveries` (consumer, domain_event_id ledger) + `operations_audit_logs` (month-partitioned, INSERT+SELECT grants via `db/grants/immutable-tables.sql` — extend that file, and `npm run db:grants` re-covers partitions).

**`locations`** — id uuid PK · business_id uuid NOT NULL (no FK — cross-domain by value) · kind text NOT NULL CHECK (7 kinds) · name text NOT NULL CHECK (length 1–80) · address jsonb NULL · pickup_instructions text NULL · operating_window jsonb NULL · status text NOT NULL CHECK (`active|closed`) DEFAULT 'active' · is_default boolean NOT NULL DEFAULT false · sequence bigint NOT NULL DEFAULT 0 · created_at/updated_at timestamptz NOT NULL DEFAULT now().
Indexes: `idx_locations_business (business_id)` · **`uq_locations_default UNIQUE (business_id) WHERE is_default AND status = 'active'`** (L1's big brother) · CHECK: popup/temporary ⇒ operating_window NOT NULL.

**`stock_items`** — id uuid PK · business_id uuid NOT NULL · variant_id uuid NOT NULL (by value; existence via CatalogPort at command time) · location_id uuid NOT NULL **REFERENCES locations(id) ON DELETE RESTRICT** (same-domain FK, allowed; RESTRICT never CASCADE) · tracking_mode text NOT NULL CHECK (5 modes) DEFAULT 'untracked' · on_hand_sellable/on_hand_damaged/on_hand_on_hold/on_hand_quarantine bigint NOT NULL DEFAULT 0 **CHECK (≥ 0)** each (S1's big brother) · safety_stock bigint NOT NULL DEFAULT 0 CHECK (≥ 0) · low_stock_threshold bigint NULL CHECK (≥ 0) · incoming bigint NOT NULL DEFAULT 0 · sequence bigint NOT NULL DEFAULT 0 · timestamps.
Indexes: **`uq_stock_variant_location UNIQUE (variant_id, location_id)`** · `idx_stock_business (business_id)` · `idx_stock_variant (variant_id)`.

**`stock_movements`** — **RANGE-partitioned by occurred_at (monthly), append-only, immutability-granted like audit logs** (O-15): id uuid · stock_item_id uuid NOT NULL · business_id uuid NOT NULL · bucket text NOT NULL CHECK · delta bigint NOT NULL CHECK (delta <> 0) · reason text NOT NULL CHECK (full declared list) · sub_reason text NULL CHECK · cause_type text NULL CHECK (`source_batch` this sprint; order_line/count/transfer/return declared) · cause_id uuid NULL · actor jsonb NOT NULL · note text NULL (≤ 300) · occurred_at timestamptz NOT NULL DEFAULT now() · **PK (id, occurred_at)** (partition-key law).
Indexes per partition: `(stock_item_id, occurred_at)` · `(cause_type, cause_id)`. Create current + next month partitions in-migration; partition-maintenance follows the audit-log precedent.

**`availability_projection`** — variant_id uuid PK · business_id uuid NOT NULL · available bigint NULL (NULL = unlimited) · tracked boolean NOT NULL · incoming bigint NOT NULL DEFAULT 0 · locations jsonb NOT NULL DEFAULT '[]' (per-location breakdown for S2+ surfaces) · updated_at timestamptz.
Registered with the platform ProjectionRegistry (`operations_availability`, v1) — table comment carries the version stamp; rebuild uses the __shadow rename discipline (D-27/M-2 machinery as-is). Index `idx_availability_business (business_id)`.

**`inventory_source_batches`** — id uuid PK · business_id uuid NOT NULL · source text NOT NULL CHECK (`csv|excel`) · filename text NULL · mode text NOT NULL CHECK (`set|add`) · status text NOT NULL CHECK (`landed|undone`) · stats jsonb NOT NULL (`{rows, applied, skipped_no_title?, skipped_unknown_sku, skipped_bad_qty}`) · content_sha256 text NOT NULL · created_at · undone_at NULL.
Index `(business_id, created_at)` · **`uq_source_batch_content UNIQUE (business_id, content_sha256)`** — the idempotency big brother (§10).

## 4. Manifest Entries

`contracts/data/manifest.json`: 22 → **31** tables. Nine new entries, each with owner `operations`, purpose line, retention (`stock_movements`: retain ≥ 7y, partitioned; `operations_audit_logs`: audit-class), pk/uniques as above, and the two immutability-granted tables flagged. Manifest lands **in the same commit as** migration 0006 (manifest-first gate order).

## 5. Event Taxonomy for OPS-001 (registered payloads + registry lock)

New file `contracts/schemas/events/operations-payloads.ts` (mirrors `commerce-payloads.ts`): `operationsPayloadValidators()` + entries in the registry-lock test. Events (all envelope-standard; ordering scope: location events → `business_id`, stock events → `stock_item_id`):

| Event | Payload (sketch) |
|---|---|
| `operations.location.created` | location_id, kind, name, is_default, ghost:boolean |
| `operations.location.updated` | location_id, fields_changed[] (detected — D-29) |
| `operations.location.closed` | location_id |
| `operations.inventory.tracking_enabled` | stock_item_id, variant_id, location_id, opening_quantity |
| `operations.inventory.tracking_disabled` | stock_item_id, balances snapshot |
| `operations.inventory.adjusted` | stock_item_id, bucket, delta, reason, sub_reason?, resulting `{bucket: balance}` |
| `operations.inventory.received` | stock_item_id, delta, cause `{type, id}` (import batches emit received in `add` mode) |
| `operations.inventory.low_stock` | stock_item_id, variant_id, available, threshold |
| `operations.inventory.out_of_stock` | stock_item_id, variant_id |
| `operations.inventory.restocked` | stock_item_id, variant_id, available |
| `operations.inventory.oversold_detected` | stock_item_id, variant_id, shortfall, cause reason |

Threshold events are **aggregate-computed on transitions only** (never re-emitted while remaining below — D-29's no-noise law). `location.default_changed` is declared in BLUEPRINT-003 but **not registered in OPS-001** (no command emits it; M-6 lock registers only emitted events).

## 6. API Contracts (contracts-first: `contracts/schemas/operations/*.schema.ts` + `contracts/openapi/operations.v1.yaml`)

All endpoints ride `define-command-endpoint`/`defineQueryEndpoint` (idempotency, RFC 9457, correlation, rate limits). Masking law: cross-tenant anything → 404.

| Endpoint | Contract essentials |
|---|---|
| `POST /api/v1/businesses/:businessId/locations` | kind (no `home` — ghost-only), name, address?, pickup_instructions?, operating_window (required for popup/temporary) → 201 LocationDTO. Gate: P `ops.location.write` · E **`ops.locations`** (Growth+ — multi-location is the tier line; the ghost needs no gate, it's system-authored) |
| `GET /api/v1/businesses/:businessId/locations` | list (active first; ghost included with `ghost: true` only when >1 exists — the invisibility rule lives in the DTO layer) |
| `PATCH /api/v1/locations/:locationId` | name/address/pickup/window; detected-change semantics |
| `POST /api/v1/locations/:locationId/close` | step-up header required (ADR-001 §12.3); L2 educating 409 `LOCATION_HAS_STOCK` |
| `GET /api/v1/stock` | query: business_id (req), variant_id?, location_id?, cursor/limit keyset → rows of StockDTO (buckets, mode, threshold, available) |
| `GET /api/v1/stock/movements` | query: business_id, stock_item_id, keyset by (occurred_at, id) — the biography |
| `POST /api/v1/stock/tracking/enable` | variant_id, location_id? (default = ghost), opening_quantity ≥ 0 → 200 StockDTO. Gate: P `ops.inventory.write` · E `ops.inventory` (all tiers) |
| `POST /api/v1/stock/tracking/disable` | variant_id, location_id? → 200 |
| `POST /api/v1/stock/adjustments` | variant_id, location_id?, bucket (default sellable), delta (int ≠ 0), reason ∈ {received, adjustment, count}, sub_reason?, note? → 200 StockDTO. `count` semantics: body carries `counted` absolute instead of delta (schema union) |
| `GET /api/v1/availability` | business_id + variant_ids[] (≤100) → `{ [variant_id]: { available: number\|null, tracked, incoming } }` — reads the projection; `null` = unlimited |
| `POST /api/v1/inventory/imports` | `{ source: 'csv'\|'excel', filename?, mode: 'set'\|'add', content }` (≤ 1MB, text) → 201 `{ batch_id, applied, skipped: {…} }` |

New error codes in `shared/errors.ts`: `LOCATION_HAS_STOCK` (409) · `UNKNOWN_SKU` (422, import row-level — reported in stats, not thrown) · `TRACKING_MODE_INVALID` (409). New permissions registered in the merchant capability registry: `ops.location.write`, `ops.inventory.write` (owner/manager full; staff gets `ops.inventory.write` — packing-adjacent reality); reads ride `store.view`. Capabilities: `ops.inventory` (Starter+), `ops.locations` (Growth+).

## 7. Command & Query Handlers (application layer, kernel shape)

Commands (each: triple gate via `withAuthorizedBusiness`-style access helper → aggregate → repo → eventStore.append(trace) → audit, one transaction): `createLocation` · `updateLocation` · `closeLocation` (queries StockRepository for nonzero balances at location before aggregate close) · `ensureGhostLocation` (system-actor; advisory-lock `pg_advisory_xact_lock(hash(business_id))` + upsert-where-none — idempotent under race; invoked lazily by every stock command and the ListLocations query, **plus** registered as a consumer of `commerce.product.created` (physical) on the **commerce dispatcher** with delivery-ledger idempotency — belt and suspenders, both specified) · `enableTracking` / `disableTracking` / `adjustStock` (all: CatalogPort existence check first — unknown variant masks as 404; `partner` location refuses manual adjustment, L3) · `importStock` (§10).

Queries: `listLocations` · `getStock`/`listStock` (read DAO, keyset) · `listMovements` · `getAvailability` (projection read; **fallback**: variants absent from the projection return `available: null, tracked: false` — untracked-by-default semantics make projection lag benign).

Container: `container.operations = { deps, dispatcher, audit, commands(7), queries(4) }` — its own `PgEventStore({ eventsTable: 'operations_domain_events', outboxTable: 'operations_outbox_events', orderingScope: operationsOrderingScopeOf })`, its own dispatcher with `operationsPayloadValidators()` and the availability-projection consumer registered; the ghost consumer registers on the **commerce** dispatcher.

## 8. (folded into §7 — handlers)  ·  9. Availability Projection Strategy

Projection `operations_availability` v1, maintained by a dispatcher consumer (eventual, ms-lag, declared per ADR-003 §2) consuming: `tracking_enabled/disabled`, `adjusted`, `received`, `oversold_detected`. Handler recomputes the variant's row from `stock_items` (cheap aggregate query per event — correctness over cleverness; per-event delta math is an optimization deferred until measured). Rebuildable: registry `rebuild()` truncates the shadow, folds `stock_items` current state (not event replay — the ledger IS in the items; document this as **projection-from-state**, a legitimate registry mode since the source table is domain-owned), swaps with index normalization (M-2 discipline). `GetAvailability` p99 budget ≤ 15ms (single PK reads).

## 10. CSV Stock Import Design

Pure parser in `sourcing/application/csv-source.ts` (server-side twin of the Ignite client parser — shared dialect rules: delimiter sniff, quoted cells, header aliases `sku|SKU|variant sku`, `quantity|qty|count|stock`, optional `location`): rows → `{ sku, quantity }`. Orchestration (`importStock`): gate → hash content (sha256) → **idempotency**: unique (business_id, content_sha256) — a replayed file returns the original batch result as 201 (idempotent-replay semantics, matching the platform's Idempotency-Key philosophy; the endpoint ALSO honors Idempotency-Key headers) → resolve each SKU via `CatalogPort.findVariantBySku(businessId, sku)` (unknown → counted in `skipped_unknown_sku`, never guessed) → per variant: ensure ghost location, ensure StockItem (auto-enable `tracked` with opening 0 if untracked — an import IS the tracking decision, evented as `tracking_enabled`), then `mode=set` ⇒ movement reason `count` (delta = target − current; zero-delta rows are silent no-ops) or `mode=add` ⇒ reason `received`; all movements carry `cause: {source_batch, batch_id}` → write batch row + stats. Batch size cap 2,000 rows; one transaction per chunk of 200 items (bounded transactions; partial-failure resumes by re-running the same file — idempotent by content hash + set-mode semantics). **Batch undo is declared (compensating movements, `sub_reason: import_undo`) and deferred to the batch-3 stretch** — the schema (status `undone`, undone_at) ships now.

## 11. Security Gates & Permissions

Triple gate on every command (P/E per §6 · T: standing via the shared access resolution — suspended businesses blocked platform-wide already). `CloseLocation` requires step-up. Adjustment fraud posture: reason+sub_reason mandatory, actor audited (operations_audit_logs, `sensitivity: 'normal'`; adjustments with sub_reason `lost` flagged `sensitivity: 'sensitive'`), notes length-capped and log-redaction-safe (D-26 token list gains `note`? No — notes aren't secrets; costs are, and costs are out of OPS-001 scope). Import content is untrusted input: size cap, text-only, parser never throws on malformed rows (counts them), zod-validated envelope.

## 12. Concurrency Strategy

`SELECT … FOR UPDATE` on the `stock_items` row inside every stock command (the Product-slice row-lock pattern); StockItem sequence guard backs it; outbox partition_key = stock_item_id keeps per-item event order strict while distinct items stay parallel. Lazy StockItem creation races resolve on `uq_stock_variant_location` with translate-to-retry (fetch the winner's row and continue — the D-31 constraint-translation pattern, not an error). Ghost creation races resolve via the advisory lock. Import chunks lock items in a **stable sort order** (variant_id) to prevent deadlocks between concurrent imports.

## 13. Ledger-Balance Invariant Strategy (S2)

(1) **Structural:** the only write path to buckets is `StockRepository.applyMovements(tx, item, movements[])` — updates balances and inserts ledger rows in one statement pair, same tx; no other repo method touches bucket columns (review-enforced + a grep gate in `check:boundaries` extension: `on_hand_` column names may appear only in stock-repository/read-dao files). (2) **Verified:** integration test recomputes `SUM(delta) GROUP BY stock_item_id, bucket` vs `stock_items` after a randomized 500-op storm (§14). (3) **Operational:** a `check:ledger` SQL (documented in the migration header) for production spot-audits — the nightly job lands with observability work, not this sprint.

## 14. Test Plan

**Unit** (`tests/unit/operations/…`): Location invariants (L1 factory/ghost, L2 refusal copy educates, L4 popup window required) · StockItem behaviors (enable/disable modes incl. OB-2 no-op and mode errors; adjust math per bucket; threshold transition events fire exactly on crossings — the D-29 sweep-test pattern re-applied; count-clamp emits `oversold_detected` with shortfall; safety stock in ATP) · reason-code/VO guards · CSV parser dialects (comma/semicolon, quotes, aliases, junk rows) · event payload schemas vs emissions (registry-lock + mutation-emission sweep, mirroring `tests/unit/commerce/catalog/event-schemas.test.ts`).

**Integration** (embedded PG, `tests/integration/operations/…`): repository round-trips + rehydration guards · **Ghost**: first stock command creates exactly one default; 20-way concurrent ensure yields one row (advisory lock) · **L1**: second `is_default` insert dies on the partial unique index · **L2**: close-with-stock 409, close-after-zeroing succeeds · **ledger balance**: the 500-op randomized storm recompute · **concurrency**: parallel adjustments on one item sum exactly (no lost updates); parallel lazy-creation resolves via unique-translate · **negative prevention**: adjustment below zero 422 educates; count clamps + `oversold_detected` · tracking enable/disable round-trip with ledger continuity · **projection**: consumer-driven update after dispatch; full rebuild equals live table (shadow swap; index normalization) · low_stock/out_of_stock/restocked sequences (with safety stock in the math) · **CSV**: set/add modes, idempotent replay by content hash (same batch_id back, zero new movements), unknown-SKU stats, 200-row chunking crash-resume (kill mid-import in test, re-run, final state correct) · **gates**: cross-tenant masking (404 sweep over all endpoints), permission denials, `ops.locations` tier gating, step-up on close · **CatalogPort**: unknown variant 404-masks; digital-kind variant refuses `enableTracking` with the educating mode error.

**Contract**: OpenAPI `operations.v1.yaml` parse + path/operation counts join `tests/unit/openapi.test.ts`.

## 15. Implementation Batches

**Batch 1 — machinery + locations** (foundation, independently shippable): migration 0006 (quartet + `locations` only? **No — one migration** per sprint discipline; 0006 carries all nine tables, but batch 1 implements against locations + quartet) · manifest · shared-kernel ids/reasons · Location aggregate + repo + commands/queries · ghost policy (lazy + advisory lock; the commerce-dispatcher consumer) · location endpoints + contracts · unit/integration for L*-invariants + ghost. *Gate: full chain green.*

**Batch 2 — stock core**: StockItem + movements + repo (S2 law) · enable/disable/adjust commands · CatalogPort adapter · stock/movement/availability queries · availability projection + consumer + rebuild · threshold events · endpoints + OpenAPI · the concurrency/ledger/projection test block. *Gate: race + storm tests green.*

**Batch 3 — CSV source (+ stretch)**: parser · import command + batch repo + endpoint · idempotency/chunking tests · registry-lock completion · (stretch: batch undo). *Gate: import idempotency suite green; sprint report.*

---

## Final Output

**1. Recommended implementation batch 1:** as §15 Batch 1 — machinery + Locations + Ghost. It exercises every new seam (event quartet, dispatcher, audit partitioning, access gates, cross-domain consumer) against the *simplest* aggregate, so all plumbing risk is retired before the hot-path aggregate lands.

**2. Exact first migration:** `db/migrations/0006_operations_core.sql` — the operations quartet (copy 0004's shapes, renamed; audit month-partitioned) + `locations` + `stock_items` + `stock_movements` (partitioned, current+next month) + `availability_projection` + `inventory_source_batches`, with `db/grants/immutable-tables.sql` extended to cover `operations_audit_logs` and `stock_movements`, and `contracts/data/manifest.json` gaining nine entries in the same commit.

**3. Exact first files to create:** `domains/operations/shared-kernel/ids.ts` → `shared-kernel/reason-codes.ts` → `shared-kernel/ports.ts` → `locations/domain/value-objects.ts` → `locations/domain/events.ts` (with `operationsOrderingScopeOf`) → `locations/domain/location.ts` → `contracts/schemas/events/operations-payloads.ts` → migration 0006 + manifest → `locations/infrastructure/location-repository.ts` → `locations/application/{ports? no — access.ts, dto.ts, commands/…}` → container wiring → endpoints.

**4. Risks before implementation:** (a) `stock_movements` partitioning + the composite PK is the first partitioned *domain* table (audit logs are platform) — the repository's insert path and the keyset movement query must be partition-pruning-aware; test with two months of data. (b) The ghost consumer on the commerce dispatcher is the first cross-domain consumer in the codebase — the delivery-ledger semantics are proven but the *wiring* is new; the lazy-ensure belt makes it non-correctness-critical, which is exactly why it's safe to pioneer here. (c) Projection-from-state rebuild is a new registry mode (rebuilds so far replay events) — keep the handler trivially re-runnable and document the mode in the registry. (d) CatalogPort adds a Commerce read inside Operations transactions — keep it a read-only query on the same pool, fail-closed, and never inside the row-lock window (check before locking). (e) Import chunk-resume semantics depend on `set`-mode idempotency — `add`-mode replays are guarded only by the content hash; the test plan covers both.

**5. Recommendation: PROCEED.** Scope is honest Phase A, every pattern has a proven in-repo precedent (quartet 0004, row-lock races, D-31 constraint translation, projection registry, dossier-style batching), the two genuinely new mechanics (partitioned domain ledger, cross-domain consumer) are isolated in Batch 1–2 with explicit tests, and nothing in this sprint blocks on Orders. Freeze this blueprint and open OPS-001 Batch 1.
