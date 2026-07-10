# DOF Commerce Kernel — Implementation Blueprint

**Document:** BLUEPRINT-002 (companion to ADR-002 v1.0)
**Status:** Proposed (v1.0)
**Date:** 2026-07-03
**Sources of truth:** ADR-002 (domain), ADR-003 (integration), ADR-004 (data constitution), Merchant Kernel (production), DECISIONS.md D-01…D-21. Where this blueprint and an ADR disagree, the ADR wins and this document is defective.
**Scale contract:** 10M+ merchants, 100M+ products, billions of listings — every table below is designed against that number, not today's.

## 0. Conflicts Discovered & Smallest Required Changes

Honest reconciliation before anything else — three conflicts between the frozen documents and the shipped kernel, each with the smallest change that resolves it:

- **K1 — Event/outbox/audit machinery is merchant-hard-coded; the constitution requires per-domain instances.** ADR-003 §3 ("each domain writes its own audit") and ADR-004 rule 15 ("domain_events per module") require Commerce to have its own event, outbox, delivery, and audit tables — but `PgEventStore`, `OutboxDispatcher`, `PgAuditLog`, `PgUnitOfWork` live inside `domains/merchant/core/infrastructure/` with table names baked in. **Smallest change:** extract them (plus `db.ts`) into a new top-level **`platform/`** library (framework-free, domain-agnostic, table-names parameterized). Merchant's tables, contracts, and behavior are byte-identical — this is a mechanical move + constructor parameter, zero migrations, covered by the existing 124 tests. Boundary rules gain: `domains/* may import platform/ and shared/`; `platform/` may import neither `domains/` nor `server/`. This is Batch 1 and a prerequisite for every future domain — better to pay it at the second domain than the fifth.
- **K2 — `request_idempotency_keys` is manifested as merchant-owned but is platform plumbing.** Commerce endpoints need idempotency; per-domain idempotency tables would be pointless multiplication (the key is `(key, endpoint, actor)` — no domain data). **Smallest change:** re-own the table to `platform` in the manifest (one JSON edit, no schema change).
- **K3 — Taxonomy is not yet built (ADR-003 step 3).** Commerce stores `CategoryRef` as an **opaque validated string** (`category_path text`, format-checked, semantics-free) per ADR-003 W2. No category browsing/validation UX in this module; the Taxonomy domain later validates and migrates refs via `taxonomy.category.*` events. Restated so nobody "helpfully" invents a tree in Commerce.

Deferred-by-design (named so they are decisions, not omissions): **channels table** (listings carry `channel_type text CHECK ('store') + channel_id`; a channel registry table arrives with the first non-store channel — ADR-002 §0.4 is satisfied by the columns, not the table) · **inventory_reservations** (designed in §2.9 but its migration ships with the Orders module — Commerce owns the ledger, Orders commands it; creating it years early is speculative) · **subscription/bundle** structures (future strategies per ADR-002 §4.7).

---

## 1. Commerce Module Structure

```
domains/commerce/                     # sibling bounded context to merchant (ADR-002 §0.1)
├── catalog/                          # SUBDOMAIN: products, variants, media composition
│   ├── domain/                       #   aggregates, VOs, events, specs — framework-free
│   ├── application/                  #   commands, queries, services (ProductReadinessSpec use)
│   └── infrastructure/               #   Pg repositories, row↔aggregate mappers
├── publishing/                       # SUBDOMAIN: listings, visibility, channels, publication
│   ├── domain/ application/ infrastructure/
├── inventory/                        # SUBDOMAIN: records, adjustments, (future) reservations
│   ├── domain/ application/ infrastructure/
├── pricing/                          # SUBDOMAIN: price schedules, EffectivePriceService
│   ├── domain/ application/ infrastructure/
├── merchandising/                    # SUBDOMAIN: collections, offers, evaluators, schedulers
│   ├── domain/ application/ infrastructure/
└── shared-kernel/                    # commerce-internal shared VOs ONLY
    ├── channel-ref.ts  visibility.ts  option.ts  listing-specification.ts
    └── deps.ts                       # CommerceDeps bundle (composition-root injected)

platform/                             # K1: domain-agnostic machinery (extracted from Module 1)
├── event-store.ts  outbox-dispatcher.ts  audit-log.ts  idempotency-store.ts
├── db.ts (pool, PgUnitOfWork)  projection-registry.ts (NEW — ADR-004 C5)
└── (instantiated per domain by the composition root with that domain's table names)

contracts/
├── schemas/commerce/                 # zod: product, variant, listing, collection, offer, inventory
├── schemas/events/commerce-payloads.ts  # M-6 pattern, per event type
├── data/manifest.json                # gains every §2 table BEFORE columns are coded (ADR-004 C6)
└── openapi/commerce.v1.yaml

server/api/v1/…                       # thin adapters per §4 (same defineCommandEndpoint wrapper)
server/tasks/                         # commerce workers: offer-scheduler, smart-collections,
                                      # price-scheduler, projection builders (outbox consumers)
```

**Why these folders:** the five subdomains are ADR-002 §18's named extraction seams — the boundary lint enforces no cross-subdomain imports (except `commerce/shared-kernel`) from the first commit, exactly as Module 1 did for merchant. Commerce may import `domains/merchant/shared-kernel` **contracts only** (ids, Money, gate, actor, trust — they are the platform's authorization language per ADR-003 F2/F5) and `platform/`; importing `merchant/core|trust|storefront` is a violation. The Merchant gate is consumed as a library in-monolith with the contract frozen (F2/F3) so extraction later is a transport swap.

---

## 2. PostgreSQL Design (manifest-first, ADR-004 C6)

Global (inherited law): uuid v7 PKs · `business_id` leads every composite index (tenancy, rule 7) · text+CHECK statuses (rule 11) · timestamptz + `set_updated_at` on mutable tables (rule 3) · in-domain FKs `ON DELETE RESTRICT` only (rule 12) · **no cross-domain FKs** — `store_id`, `media_id` are contract references with declared reconciliation (rule 24) · all tables owner `commerce` unless noted · PII tier **P0** throughout the catalog (product data is business content; the manifest carries a standing note that any personal data entering product content is a policy violation handled by moderation, not schema).

### 2.1 `products` — aggregate · permanent · tombstone · P0
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| business_id | uuid | tenant key; **no FK** (Merchant owns businesses; reconciliation: react to `merchant.business.closed`) |
| title | text NOT NULL | |
| description | jsonb | rich doc, versioned shape (rule 10) |
| fulfillment_kind | text CHECK (physical, digital, service) | day-one column (ADR-002 §6) |
| category_path | text | **opaque** CategoryRef (K3); format-validated only |
| attributes | jsonb | extensible map incl. product-brand (ADR-002 D2-9) |
| options | jsonb | Option VO list `[{name, values[]}]` — VO document, changes only with variant edits (same transaction, same aggregate: correct home) |
| status | text CHECK (draft, active, archived) | machine 1 of 3 (ADR-002 §0.3) |
| ai_provenance | jsonb | kernel VO |
| created/updated_at, deleted_at | timestamptz | tombstone per rule 4 |

Indexes: `(business_id, status, updated_at desc)` (workspace grid), `uq_products_sku` lives on variants. Partitioning: **hash-ready on business_id** (rule 14) — enable at ~10⁸ rows, pure DDL. Justification: options as jsonb (not a table) because option integrity is enforced inside the aggregate transaction and options are never queried relationally; variants are rows because *everything* references them.

### 2.2 `product_variants` — aggregate-child rows · permanent · tombstone-with-parent · P0
id PK · product_id FK→products RESTRICT · business_id (denormalized shard key, kernel precedent) · sku text (silent-generated when absent — Grandma has no SKUs) · option_values jsonb (point in option space) · price_amount bigint + price_currency char(3) (rule 8) · sale_amount bigint null + sale_starts_at/sale_ends_at timestamptz null (active sale window; scheduled transitions live in 2.8) · weight_grams int null + dimensions jsonb null (future Shipping) · digital jsonb null (file MediaRef + delivery hints) · service jsonb null (duration/capacity hints) · position smallint · created/updated/deleted_at.
Constraints: `uq_variants_business_sku UNIQUE (business_id, sku)` (DB-backed, kernel precedent) · duplicate option-combination uniqueness enforced in-aggregate + `uq_variants_product_options UNIQUE (product_id, option_values)` as the survive-bugs line (rule 23). Indexes: `(product_id, position)`, `(business_id)`. Justification: price ON the variant (base+sale) because effective-price resolution reads it on every quote — a separate prices table would be a join tax on the hottest read; *history* comes from events (2.13), *future changes* from 2.8.

### 2.3 `product_media` — aggregate-child rows · permanent · hard-delete-with-parent-edit · P0
id PK · product_id FK RESTRICT · business_id · media_id uuid (**cross-domain ref → media.asset**; manifest declares cleanup on `media.asset.deleted` + dangling-ref reconciler) · variant_id uuid null FK→product_variants · role text CHECK (gallery, hero, swatch) · alt_text text (SEO/a11y — merchandising data, ours) · position smallint.
Unique `(product_id, media_id, coalesce(variant_id))` via expression index. Justification: a table (not jsonb) because per-variant assignment + reordering are row operations and Module 3's AI image swaps target individual rows. Rows are replaced freely with parent edits — composition is not history (events carry history).

### 2.4 `listings` — aggregate · permanent · tombstone · P0
id PK · business_id · product_id FK RESTRICT · channel_type text CHECK ('store') · channel_id uuid (= store_id; **cross-domain ref → merchant.store**; reconciliation: react to `merchant.store.closed`, weekly orphan reconciler per ADR-002 §3) · status text CHECK (draft, published, unpublished) · visibility text CHECK (public, unlisted, hidden) · enforcement_hold text CHECK (none, under_review, removed) — Administration-written only, machine ⊥ machine (ADR-002 §0.3) · overrides jsonb (ListingOverrides VO) · seo jsonb · featured bool · position smallint · published_at, first_published_at timestamptz null · created/updated/deleted_at.
Constraints: `uq_listings_product_channel UNIQUE (product_id, channel_type, channel_id)` (one listing per product per channel — ADR-002 §9). Indexes: `(business_id, status)`, `(channel_id, status, visibility) WHERE status='published'` — **the one index family not led by business_id**, justified: it exists solely to build storefront projections; public reads never touch this table (§6). Partitioning: hash-ready on business_id; at billions of rows this is the first table to actually partition.

### 2.5 `collections` — aggregate · permanent · tombstone · P0
id PK · business_id · channel_type/channel_id (per-channel merchandising, ADR-002 §11) · title text · media_id uuid null (cross-domain ref) · type text CHECK (manual, smart) · spec jsonb null (ListingSpecification v1 — required iff smart) · sort_policy text · status CHECK (active, archived) · ai_provenance jsonb · timestamps.
Index `(business_id, status)`, `(channel_id, status)`.

### 2.6 `collection_listings` — aggregate-child (manual) / worker-maintained (smart) · permanent · hard-delete rows · P0
collection_id FK + listing_id FK composite PK · position smallint · added_by jsonb (actor: human, ai draft-accepted, or `smart-collection-evaluator`). Index `(listing_id)` (reverse: "which collections show this listing" — spec re-evaluation fan-in).

### 2.7 `inventory_records` — aggregate · permanent · transition · P0 — **one per (variant, location)**
id PK · business_id · variant_id FK RESTRICT · location_id uuid NOT NULL (single default location per business day one — real column, ADR-002 §7) · tracking_mode text CHECK (untracked, tracked, digital, service) · on_hand int NOT NULL DEFAULT 0 · reserved int NOT NULL DEFAULT 0 · backorder_policy text CHECK (deny, allow) · low_stock_threshold int null · timestamps.
Constraints: `uq_inventory_variant_location UNIQUE (variant_id, location_id)` · `chk_inventory_nonnegative CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand + CASE WHEN backorder_policy='allow' THEN 2147483647 ELSE 0 END)` — simplified to `CHECK (on_hand >= 0 AND reserved >= 0)` with the oversell guard in the atomic UPDATE (§3 concurrency), because the backorder arithmetic belongs in one place, not two dialects. Index `(business_id)`, partial `(business_id) WHERE tracking_mode='tracked' AND low_stock_threshold IS NOT NULL` (LowStockPolicy scan).
Justification: separate aggregate per ADR-002 D2-6 — the hottest write in commerce must not contend with catalog editing.

### 2.8 `price_schedules` — aggregate · permanent · transition · P0
id PK · business_id · variant_id FK RESTRICT · kind text CHECK (sale_start, sale_end, base_change) · new_amount bigint null · currency char(3) · effective_at timestamptz · status text CHECK (pending, applied, cancelled) · created_by jsonb (actor) · applied_at null · timestamps.
Partial index `(status, effective_at) WHERE status='pending'` (the scheduler's only query — outbox-pending pattern). Justification: ADR-002 §4.1 — scheduled repricing at scale must not touch the Product aggregate; a worker applies transitions and emits `commerce.variant.price_changed`.

### 2.9 `inventory_adjustments` — ledger · **month-partitioned from day one** · never-delete · P0
id uuid + created_at (composite PK — partition key in PK, rule 14) · business_id · inventory_record_id · delta int · on_hand_after int · reason text CHECK (received, recount, damage, loss, manual, order_commit, order_release) · actor jsonb · note text · correlation_id uuid.
Index `(business_id, created_at desc)`, `(inventory_record_id, created_at desc)`. Justification: the movement ledger IS the shrinkage audit (ADR-002 §7); append-only + partitioned per audit_logs precedent; `on_hand_after` makes each row self-verifying (chain-checkable in reconciliation).
*(Designed, deferred to Orders module:* `inventory_reservations` — id, record_id, order_ref uuid, qty, status CHECK (held, committed, released, expired), expires_at; same ledger discipline.)*

### 2.10 `offers` — aggregate · permanent · transition (cancelled/expired retained) · P0
id PK · business_id · offer_type text CHECK (deal, coupon, promotion) · name text · targeting jsonb (**ListingSpecification** — same rule language as smart collections; a separate offer_rules/offer_targets relational pair is REJECTED: two dialects of targeting would drift, and resolved targets are a projection concern, §6) · value jsonb (strategy VO: percentage | fixed_amount | buy_x_get_y) · stacking_policy jsonb · schedule jsonb (Schedule VO, tz-aware, rule 9) · code citext null + `uq_offers_business_code UNIQUE (business_id, code) WHERE code IS NOT NULL` · usage_limits jsonb · social_amplify bool · status text CHECK (draft, scheduled, active, expired, cancelled) · ai_provenance · timestamps.
Partial index `(status, ((schedule->>'starts_at'))) WHERE status='scheduled'` + `(status, ((schedule->>'ends_at'))) WHERE status='active'` (scheduler sweeps).

### 2.11 `product_drafts` — operational · windowed(30d unapproved) · windowed-delete · P0
id PK · business_id · source text CHECK (photo, text, import, ignite) · draft jsonb (AI ProductDraft artifact + provenance) · status CHECK (pending, accepted, discarded, expired) · created_by jsonb · expires_at · timestamps. Index `(business_id, status)`.
Justification: ADR-001 §13.3 — AI drafts expire if unapproved; "Idea" is an artifact, not a product state (ADR-002 §0.3). Accepted drafts become Products via `ProductFactory.fromDraft`; the draft row is retained until window end for undo/analytics, then purged (operational exhaust, rule 4).

### 2.12 Platform-machinery instances (K1) — same shapes as Module 1's, commerce-owned
`commerce_domain_events` (event · permanent · never · P1-actors — **unpartitioned, D-02 exception restated**: the per-aggregate sequence unique guard) · `commerce_outbox_events` (operational · windowed(7d) · + `seq` identity, D-15) · `commerce_event_deliveries` (operational ledger) · `commerce_audit_logs` (ledger · month-partitioned · regulatory retention · P2 context.ip). All four: manifest entries mirror their merchant twins; grants script extended (rule 6/15: app role INSERT+SELECT only on events + audit).

### 2.13 Read models (§6; registered per ADR-004 C5, disposable, rebuild-drilled)
`rm_public_listings` · `rm_store_public` (grows from BLUEPRINT-001's plan; Commerce-owned since ADR-002) · `rm_price_history` · `rm_offer_listings`. Manifest class `read_model`, retention `rebuildable`, delete class `disposable`.

**Manifest:** every table above lands in `contracts/data/manifest.json` (owner `commerce`) in the same PR as its migration — CI's manifest gate enforces it. Cross-domain refs declared: products/listings/collections→merchant (business, store), product_media/collections→media (asset), with cleanup events + named reconcilers (rule 24).

---

## 3. Aggregate Mapping (ADR-002 §4 → implementation)

| ADR-002 object | Implementation | Persistence |
|---|---|---|
| **Product** (root) + Variant entities + Option/MediaComposition VOs | `catalog/domain/product.ts` — variants + media rows loaded/saved with the root, one transaction | products, product_variants, product_media |
| **Listing** (root) + Visibility/Overrides VOs + hold | `publishing/domain/listing.ts` — status ⊥ visibility ⊥ enforcement_hold (three orthogonal fields, kernel pattern) | listings |
| **InventoryRecord** (root) | `inventory/domain/inventory-record.ts` | inventory_records (+ adjustments ledger) |
| **Collection** (root) | `merchandising/domain/collection.ts` | collections, collection_listings |
| **Offer** (root, strategy-typed) | `merchandising/domain/offer.ts` + `offer-strategies/` | offers |
| **PriceSchedule** (root) | `pricing/domain/price-schedule.ts` | price_schedules |
| ListingSpecification (rule language v1) | `commerce/shared-kernel/listing-specification.ts` — jsonb doc: `{version:1, match: all|any, conditions:[{field: category|attribute|price|product_id|collection, op, value}]}`; one evaluator, three consumers (smart collections, offer targeting, future sections) | jsonb in collections.spec / offers.targeting |
| ProductReadinessSpec / SellableSpec | `catalog|publishing/domain/specifications/` — explainable missing-lists, kernel shape | computed, never stored |
| EffectivePriceService | `pricing/application/` — base → active sale → applicable offers → `{amount, currency, trace[]}`; THE resolver (ADR-002 D2-7); consumed by projections, previews, and the frozen F9 quote API | |
| AvailabilityService | `inventory/application/` — the availability conjunction | |
| SmartCollectionEvaluator / OfferSchedulerService / ScheduledPricePolicy / LowStockPolicy / OfferExpiryPolicy | `merchandising|pricing|inventory/application/` — outbox consumers + scheduled sweeps (cron route pattern) | |
| StandingConsequencePolicy (commerce limb) | consumer of `merchant.business.standing_changed`: suspend ⇒ freeze offers (active→cancelled? NO — *pause* via enforcement) + hold listings; lift on remediation, only its own holds (kernel policy pattern, reason-code scoped) | |
| Factories | `ProductFactory.fromDraft` (draft → Product, provenance-stamped, silent SKUs) · `ListingFactory.forChannel` (encodes store-channel 1:1) | |
| Repositories | one per root, interface in domain, Pg impl in infrastructure; whole-aggregate load/save | |

**Commands** (all: Merchant triple gate → handler → events + audit in one tx → problem+json; idempotency-keyed): CreateProduct, UpdateProduct, ArchiveProduct, AddVariant, UpdateVariant (incl. price change), SetInventoryTracking, AdjustInventory, CreateListing, PublishListing, UnpublishListing, SetListingVisibility, CreateCollection, UpdateCollection, CreateOffer, ScheduleOffer, ActivateOffer, CancelOffer, AcceptProductDraft.
**Queries:** CommerceWorkspaceOverview, CatalogGrid (direct tenant-scoped query day one, D-13 reasoning — projection when analytics enrich it), ProductEditorView, EffectivePriceQuote (F9, sync), AvailabilityQuote (F9), PublicListingView (rm-served).

**Lifecycles:** exactly ADR-002 §4.6 — three machines, readiness computed.

**Concurrency strategy:** default = kernel pattern (row lock FOR UPDATE + per-aggregate sequence guard in commerce_domain_events). **Two deliberate exceptions:** (1) `InventoryRecord.adjust` uses single-statement atomic arithmetic — `UPDATE … SET on_hand = on_hand + $delta WHERE id = $1 AND on_hand + $delta >= reserved_guard RETURNING on_hand` + ledger insert + event, no aggregate load: the hot path must not serialize behind catalog edits, and the WHERE clause is the oversell guard (INSUFFICIENT_STOCK on zero rows); (2) `collection_listings` maintenance by the evaluator is bulk upsert/delete diffing, not aggregate-mediated (worker-owned rows, `added_by` marks provenance).

---

## 4. API Contract Plan (v1; kernel wrapper conventions inherited: RFC 9457, Idempotency-Key, 404-masking, global 300/min)

Legend: **P**=permission, **E**=capability, **T**=trust/standing gate, **A**=audit sensitivity, **RL**=rate limit/user, **Ev**=events emitted. Standing default = write-blocking; publish/offer ops = growth-blocking (GROWTH_BLOCKING_STANDINGS, kernel).

| Endpoint | Contract |
|---|---|
| **POST `/businesses/:businessId/products`** | Create product (inline variants + media refs; auto default variant). P `catalog.product.write` · E `catalog.products` · T write · A normal · RL 60/h · Ev `product.created` (+`variant.added`…) · 409 SKU_TAKEN, 403 TIER_LIMIT_REACHED |
| **PATCH `/products/:productId`** | Update (title/description/attributes/options/media composition). Same gates · Ev `product.updated` · 409 OPTIONS_INCONSISTENT |
| **POST `/products/:productId/archive`** | Archive (auto-unpublishes listings). P `catalog.product.write` · A normal (bulk archive endpoint later = **sensitive**) · Ev `product.archived` + `listing.unpublished`× |
| **POST `/products/:productId/variants`** | Add variant. Gates as create · Ev `variant.added` · 409 SKU_TAKEN / OPTIONS_INCONSISTENT |
| **PATCH `/variants/:variantId`** | Update variant; price change emits `variant.price_changed` (old/new/actor/reason) · **bulk price drops beyond threshold → step-up + `security.anomaly_flagged`** (ADR-002 §16) · RL 120/h |
| **PUT `/variants/:variantId/inventory`** | Set tracking mode / thresholds / backorder policy. E `catalog.inventory` · Ev `inventory.adjusted` (mode changes evented) |
| **POST `/variants/:variantId/inventory/adjustments`** | Adjust stock `{delta, reason, note?}` — reason mandatory (ledger law). Ev `inventory.adjusted` (+ `low_stock`/`out_of_stock`/`restocked` via policy) · 409 INSUFFICIENT_STOCK · RL 300/h (receiving is bursty) |
| **POST `/stores/:storeId/listings`** | Create listing `{product_id, overrides?}`. P `catalog.listing.write` · E `catalog.products` · validates channel-store ownership · 409 ALREADY_LISTED |
| **POST `/listings/:listingId/publish`** | Publish. P `catalog.listing.write` · T **growth** · order: 423 ENFORCEMENT_HOLD → 409 LISTING_NOT_PUBLISHABLE (readiness list) → checks product active + store live-compatible (Merchant query API F3) · Ev `listing.published` · idempotent no-op if published |
| **POST `/listings/:listingId/unpublish`** / **PUT `/listings/:listingId/visibility`** | Merchant intent ops; hold untouchable by merchants. Ev `listing.unpublished` / `listing.updated` |
| **POST `/stores/:storeId/collections`** / **PATCH `/collections/:collectionId`** | Manual: `{listing_ids[]}`; smart: `{spec}` (422 SPEC_INVALID against rule-language schema). E `catalog.collections` · Ev `collection.created/updated` |
| **POST `/businesses/:businessId/offers`** | Create offer (type-strategy body, 422 SCHEDULE_INVALID, 409 CODE_TAKEN). E `offers.<type>` · T growth · Ev `offer.scheduled` |
| **POST `/offers/:offerId/activate`** | Manual activation (scheduler is the usual path). T growth · Ev `offer.activated` · RL 30/h (anti-flap) |
| **POST `/offers/:offerId/cancel`** | Ev `offer.cancelled` |
| **GET `/workspace/commerce?business_id=`** | Commerce workspace overview (counts, attention items, draft queue). P `store.view` |
| **GET `/businesses/:businessId/catalog`** | Merchant catalog grid (paginated, filtered; direct tenant query). P `store.view` |
| **GET `/storefronts/:handle/listings/:listingId`** | **Public listing view** — no auth · serves `rm_public_listings` (never aggregates) · effective price precomputed · 404 unless published+public+store-live · edge-cached, event-purged |

All mutating endpoints: Idempotency-Key honored (platform store, K2); correlation enters via validated `x-request-id` (kernel); every accepted command audited in-tx to `commerce_audit_logs`.

---

## 5. Event Architecture

Envelope: platform standard (ADR-003 §4) — schema_version 1, actor mandatory, correlation from request / chained by consumers (D-20), **ordering scope = `business_id`** for every commerce event (all commerce facts are business-scoped; D-19 note recorded in the commerce event-store instantiation). Payloads: schemas in `contracts/schemas/events/commerce-payloads.ts`, validated at dispatch (M-6), registered in `registry.lock.json`. All consumers idempotent via `commerce_event_deliveries`; replay-safe by construction (projection builders upsert; policies re-check state before acting — kernel StandingConsequencePolicy pattern).

| Event (commerce.*) | Payload core | Consumers |
|---|---|---|
| `product.created/updated/archived/deleted` | product_id, business_id, title, category_path, fulfillment_kind, status | Search, SmartCollectionEvaluator, projections, Analytics |
| `variant.added/updated` | variant_id, product_id, sku?, option_values | Search, projections, inventory provisioning |
| `variant.price_changed` | variant_id, old/new {amount,currency}, reason, source (manual\|schedule) | rm_price_history, rm_public_listings, Search, Analytics, fraud signals, (future) Orders cart revalidation |
| `listing.published/updated/unpublished` | listing_id, product_id, channel{type,id}, visibility | **Discovery/Search (unit of indexing)**, rm_public_listings, rm_store_public, Merchant CompletionScoring, Community |
| `listing.enforcement_hold_changed` | listing_id, from, to, reason_code | Search delist, merchant workspace, Administration |
| `inventory.adjusted` | record_id, variant_id, delta, on_hand_after, reason | projections (availability), Analytics; `low_stock/out_of_stock/restocked` → Pulse + Notification |
| `collection.created/updated/membership_changed` | collection_id, channel, member deltas | rm_store_public, Search |
| `offer.scheduled/activated/expired/cancelled` | offer_id, type, targeting summary, value, schedule, social_amplify | **Community (deal Spark when social_amplify)**, rm_offer_listings → rm_public_listings (effective-price refresh), Notification, Analytics, Search |
| `price_schedule.applied` | schedule_id, variant_id → then emits variant.price_changed(source=schedule) | (internal chain; causation links them) |
| `product_draft.created/accepted/expired` | draft_id, source | Analytics (AI acceptance-rate metric, ADR-002 §1) |

Versioning: additive-only within v1; semantic changes = new types (kernel law). Cross-domain consumption of merchant events by Commerce (`business.standing_changed`, `store.closed/paused`): via the merchant dispatcher's consumer registry — consumer names namespaced `commerce.*`, deliveries in **merchant's** ledger (the consuming side's ledger follows the *producing* outbox; documented in platform lib).

---

## 6. Projection Strategy (all registered in the projection registry — ADR-004 C5 ships HERE)

| Read model | Owner | Sources | Latency | Storage / rebuild |
|---|---|---|---|---|
| `rm_public_listings` | commerce | listing.*, variant.price_changed, offer.activated/expired, inventory.out_of_stock/restocked, merchant.store.published/paused/closed | seconds; **edge-purged on update** | One row per published listing: denormalized product+variant+media refs+**precomputed effective price**+availability flag. THE hot path (1000:1). Rebuild: shadow+rename drill in CI |
| `rm_store_public` | commerce | merchant.store.*, brand_kit_updated, storefront.published, listing.*, collection.* | seconds | Storefront head: store, brand kit summary, nav, collection summaries, page-1 listings. Same drill |
| `rm_offer_listings` | commerce | offer.scheduled/activated/expired/cancelled, listing.published/unpublished, product/variant updates | seconds | Materialized offer→listing resolution (targeting spec evaluated by worker ONCE per change, not per read) — feeds effective-price recompute batches |
| `rm_price_history` | commerce | variant.price_changed | minutes | Merchant-facing timeline + Analytics feed; append-only rows |
| Commerce dashboard/workspace | commerce | direct tenant queries day one (D-13 reasoning) + Analytics summaries later | strong | Projection deferred until Pulse integration — declared, not drifted |
| Inventory overview | commerce | direct query on inventory_records (tenant-scoped, indexed) | strong | Ledger is queryable history; no projection needed yet |
| Product search projection | **Search domain** | all commerce.* publishable facts | seconds | Commerce guarantees event completeness + rebuild-from-events; Search owns the index (ADR-002 §0.2) |

Registry mechanics (platform/projection-registry.ts): each entry = name, source event types, builder, rebuild procedure; CI drill: seed events → build → snapshot → truncate → rebuild via shadow+rename → diff = ∅.

---

## 7. Security

**Ownership & isolation:** every aggregate carries business_id; repositories filter by it; cross-tenant probes 404-masked (kernel law); listing operations additionally verify channel-store→business ownership via the Merchant query API (F3). **Permissions/capabilities:** existing matrix + registry keys (`catalog.*`, `offers.*` — ADR-002 D2-8); AI remains draft-only structurally (no full grants on publish/execute paths — untouched matrix). **Audit:** every accepted command in-tx to commerce_audit_logs; price and inventory commands always carry reason codes into digests. **Sensitive ops (step-up, kernel L-6 plumbing):** bulk price reductions beyond thresholds, bulk archive/delete, bulk unpublish — plus `security.anomaly_flagged` events to Administration (the ADR-001 §15 takeover signatures at their actual location). **Anti-tampering:** events+audit immutable at grant level (grants script extended to commerce tables); inventory ledger self-verifying via on_hand_after chain; reconciliation jobs (rule 24) detect cross-domain drift and alert, never auto-repair. **Price integrity:** ONE EffectivePriceService; projections carry the resolution trace; F9 checkout re-quote is the trust boundary (storefront price == charged price is a zero-tolerance metric with an alert, not a hope). **Inventory integrity:** atomic-arithmetic adjustments with mandatory reasons; oversell guard in the UPDATE predicate; INSUFFICIENT_STOCK is a domain answer, not a constraint violation surprise. **Publication integrity:** hold ⊥ status ⊥ visibility; 423-beats-409 ordering; product must be active and store compatible at publish; Administration holds only via its command surface.

---

## 8. Testing Blueprint (production-ready = ALL of this exists and passes)

- **Unit / aggregate:** every invariant per aggregate (option-space integrity, duplicate variants, listing state machines incl. hold-beats-readiness, offer schedule/stacking validation, spec language evaluator table-driven suite, EffectivePriceService resolution matrix incl. stacking + trace correctness, readiness specs' missing-lists).
- **Repository/integration (real PG, kernel harness):** whole-aggregate round-trips; SKU + option-combination uniqueness at the DB; tenancy masking; manifest↔information_schema parity (extended kernel test).
- **API:** happy path + EVERY gate rejection per endpoint (the kernel endpoints.test pattern): 401/403 P/E/T variants, 404 masking, 409s (SKU, ALREADY_LISTED, CODE_TAKEN, INSUFFICIENT_STOCK, NOT_PUBLISHABLE), 423 hold, 422s, idempotency replay/conflict/release.
- **Concurrency (required, not optional):** parallel inventory adjustments (N workers × M deltas → exact final on_hand + N×M ledger rows); adjustment racing a reservation guard; parallel publish (idempotent, single event); offer activate/cancel race; parallel variant creation SKU race (one 409, no 500); price schedule applying while merchant edits price (sequence guard surfaces conflict).
- **Event/projection:** payload schemas validate all fixtures; trace chains through commerce consumers (kernel D-20 test pattern); **rebuild drill per registered rm_** (CI); replay-safety: double-dispatch every event type → zero duplicate effects; poison payload → immediate dead-letter.
- **Migration:** 0004+ apply cleanly; checksum tamper refusal (inherited); manifest gate passes; partitioned inventory_adjustments PK/partition checks.
- **Load (pre-GA gate, scripted now):** rm_public_listings read p95 ≤ 50ms at 10⁶ rows; effective-price recompute batch for an offer targeting 10⁴ listings ≤ 60s; catalog grid p95 ≤ 200ms at 10⁵ products/tenant; outbox throughput with commerce volume (dispatch keeps lag < 5s at 100 events/s sustained).
- **Chaos:** kill dispatcher mid-batch (partition-serial ordering holds, no loss); DB failover during publish (idempotent retry clean); worker crash mid smart-collection diff (idempotent resume); event-consumer exception storm (backoff + partition isolation verified — kernel D-15 test extended to commerce volume).

---

## 9. Implementation Order (each batch compiles, tests green, independently reviewable)

| Batch | Scope | Definition of done |
|---|---|---|
| **1 — Platform lib (K1/K2)** | Extract event-store/outbox/audit/idempotency/db/projection-registry to `platform/`, parameterized; merchant re-wired; boundary rules updated; manifest K2 edit | All 124 existing tests pass unchanged; zero merchant migrations |
| **2 — Commerce scaffold + Products** | `domains/commerce/` skeleton + commerce machinery tables (migration 0004: 2.12 set) + products/product_variants/product_media (migration 0005) + Product aggregate + create/update/archive commands + events + manifest rows | Product CRUD end-to-end with events, audit, traces |
| **3 — Variants & Pricing base** | Variant commands, price change events, price_schedules + scheduler worker, EffectivePriceService (base+sale, offers stubbed to empty set — noted) | Price change → event → rm_price_history-ready stream |
| **4 — Inventory** | inventory_records + adjustments (migration 0006, partitioned) + atomic adjust + policies (low stock) + concurrency tests | Parallel-adjustment test green |
| **5 — Listings & Publishing** | listings (0007), Listing aggregate, publish/unpublish/visibility, **ListingReadinessPort real adapter → closes D-03**, merchant store-state checks, enforcement-hold surface | Merchant PublishableStoreSpec listing clause ACTIVATES; kernel test updated |
| **6 — Collections** | collections + collection_listings (0008), spec language v1 + evaluator worker, manual ops | Smart collection maintains membership on catalog events |
| **7 — Offers** | offers (0009), strategies, scheduler, EffectivePriceService completed (offer resolution + stacking + trace), StandingConsequencePolicy commerce limb | Offer lifecycle + effective-price matrix green |
| **8 — Projections** | projection registry + rm_public_listings + rm_store_public + rm_offer_listings + rm_price_history + rebuild drills in CI (ADR-004 C5 lands) | Drill green per rm_; edge-purge hooks emitted |
| **9 — API completion** | Remaining endpoints (§4), public listing view served from rm_, OpenAPI commerce.v1.yaml, workspace/catalog queries | Full endpoint test matrix green |
| **10 — Hardening** | Concurrency+chaos suites, load scripts + budgets recorded, reconciliation jobs (listing↔store, media refs), anomaly signals, grants extension, REVIEW-002 readiness | Principal-review checklist clean |

---

## 10. Final Readiness Review (CTO pass over this blueprint)

- **Resolved here:** K1/K2/K3 (§0) — K1 is the only structural change and it is mechanical. Effective-price staleness between offer activation and projection refresh is **declared behavior** (seconds-level; checkout re-quote is the guarantee — ADR-003 F9), not a bug to discover later.
- **Weakest abstraction (watch):** ListingSpecification v1 — one rule language serving collections + offers is right (ADR-002), but its evaluator's fan-in (any catalog change may touch many specs) is the likeliest performance hotspot; the worker batches by event and the load test in §8 exists specifically to catch it before merchants do. If it buckles, the fix is an inverted index over spec conditions — an implementation change behind a stable interface.
- **Deliberate debt (inventoried):** channels table deferred until a second channel type · inventory_reservations deferred to Orders · workspace/dashboard projections deferred (D-13 reasoning) · publication history read model deferred (events are queryable; build when the UI needs it) · multi-currency price sets deferred to the Payments ADR (O2-3) · CategoryRef opaque until Taxonomy (K3).
- **Security posture:** no new mechanisms invented — every control is a kernel pattern applied to commerce surfaces; the two genuinely new integrity concerns (price, inventory) each have a single-owner service/ledger with tests named in §8.
- **Consistency check against ADR-001…004:** boundary direction clean (commerce → merchant shared-kernel contracts + platform only) · manifest-first honored (§2 includes manifest fields per table) · event law honored (envelope, ordering scope, M-6, D-15, D-20) · data constitution honored (rules cited inline per table) · **no contradictions found beyond K1/K2, which are implementation-vs-constitution gaps in Module 1, not ADR conflicts.**
- **Recommendation:** approve; begin Batch 1. The blueprint is complete enough to implement without inventing architecture mid-code; anything not specified here (exact zod shapes, index names) follows kernel conventions mechanically.

---

*BLUEPRINT-002 v1.0 — the implementation contract for the Commerce Kernel. Deviations during implementation require a DECISIONS.md entry naming the section deviated from.*
