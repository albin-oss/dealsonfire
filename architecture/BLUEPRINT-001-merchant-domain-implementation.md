# DOF Merchant Domain — Implementation Blueprint

**Document:** BLUEPRINT-001 (companion to ADR-001 v1.1)
**Status:** Proposed (v1.0)
**Date:** 2026-07-02
**Source of truth:** [ADR-001 Merchant Domain Architecture](ADR-001-merchant-domain.md). This blueprint translates it into implementation plans for **Nuxt 3 + Vue 3 + TypeScript + PostgreSQL + Vercel + contract-first REST**. Where this document and ADR-001 disagree, ADR-001 wins and this document is defective.
**Preserved decisions (non-negotiable):** Merchant ≠ Business ≠ Store · Ignite = Five-Minute Store flow · Spark(s) reserved for Community · BrandKit = store visual identity VO · Progressive Trust (live ≠ payouts) · Capability Registry gates all features · Listing exists day one · AI = constrained staff · store status ⊥ enforcement hold · modular monolith with named extraction seams.

**Assumptions stated up front** (safest production defaults; flag if wrong):
- A1: Postgres is Vercel-compatible managed Postgres (Neon-class): `citext`, `pgcrypto`, logical partitioning available.
- A2: Identity Domain already issues a session (cookie-based, server-verifiable) exposing `user_id`. This blueprint consumes it, never implements it.
- A3: Money is stored as integer minor units (`bigint`) + ISO-4217 currency code. Never floats.
- A4: All IDs are UUID v7 (time-ordered — index-friendly at scale, no hotspot debate later).
- A5: DB enums are `text` + `CHECK` constraints, not native `ENUM` (backward-compatible migrations, per Engineering Standards).
- A6: Two tables not in the requested list are required by ADR-001 mechanics and are included, labeled: `ignite_drafts` (§8 draft persistence), `store_handles` (HandleService + HandleReleasePolicy), plus child table `collection_listings` (manual collection members).

---

## 1. Nuxt 3 Application Architecture

Domain-driven, not page-driven. Three concentric zones: **`domains/` is framework-free TypeScript** (the modular monolith's modules — the extraction seams), **`server/` is thin Nitro adapters**, **`app/` is presentation**. Nothing in `domains/` may import from Nuxt, Vue, Nitro, or `server/`. Dependency direction: `app/ → contracts/ ← server/ → domains/ → shared/`.

```
dof/
├── contracts/                        # CONTRACT-FIRST: the API is designed here before anything else
│   ├── openapi/merchant.v1.yaml      # canonical REST contract (source of truth for §4)
│   └── schemas/merchant/             # zod schemas — single definition, used by client AND server
│       ├── ignite.schema.ts
│       ├── business.schema.ts
│       ├── store.schema.ts
│       ├── catalog.schema.ts
│       ├── offer.schema.ts
│       └── staff.schema.ts
│
├── domains/                          # framework-free modular monolith (ADR-001 §4 subdomains)
│   └── merchant/
│       ├── core/                     # Merchant Core (extraction seam #4 — extracted last)
│       │   ├── domain/               #   entities, VOs, aggregates, events, specs, policies
│       │   ├── application/          #   command handlers, query handlers, domain services
│       │   └── infrastructure/       #   repository implementations, row↔aggregate mappers
│       ├── catalog/                  # Catalog (extraction seam #1 — extracted first)
│       │   ├── domain/ …
│       ├── storefront/               # Storefront (extraction seam #2)
│       │   ├── domain/ …
│       ├── trust/                    # Trust & Verification (extraction seam #3)
│       │   ├── domain/ …
│       └── shared-kernel/            # VOs shared across merchant subdomains ONLY
│           ├── ids.ts                # MerchantId, BusinessId, StoreId … (branded types)
│           ├── price.ts  handle.ts  media-ref.ts  ai-provenance.ts
│           └── command-gate.ts       # the triple gate (RBAC → Entitlement → Trust/Standing)
│
├── server/                           # Nitro — thin adapters only; no business logic
│   ├── api/v1/                       # one file per endpoint, mirrors §4 exactly
│   │   ├── ignite/sessions/…
│   │   ├── businesses/…  stores/…  products/…  staff-memberships/…
│   │   ├── workspace/…
│   │   └── storefronts/[handle].get.ts     # public read path (cached, §10)
│   ├── middleware/
│   │   ├── 01.session.ts             # resolve Identity session → event.context.auth
│   │   ├── 02.merchant-context.ts    # resolve active membership/business for /workspace + writes
│   │   └── 03.rate-limit.ts          # §9 rate limiting
│   ├── plugins/
│   │   ├── container.ts              # composition root: wires repos/services per subdomain
│   │   └── outbox-relay.ts           # registers scheduled outbox dispatch (Vercel cron target)
│   ├── tasks/                        # background jobs (queue/cron-triggered; §7, §14 of ADR)
│   │   ├── outbox-dispatch.ts  projection-rebuild.ts  ignite-nudge.ts  smart-collections.ts
│   └── utils/
│       ├── define-command-endpoint.ts   # wraps: validate → gate → handle → audit → problem+json
│       └── problem.ts                   # RFC 9457 problem-details error mapper
│
├── app/                              # Vue 3 presentation, organized by domain surface
│   ├── pages/
│   │   ├── ignite/                   # the Five-Minute Store flow
│   │   ├── workspace/                # Pulse, Catalog, Offers, Orders, People, Insights, Assistant, Settings (ADR §11 IA)
│   │   └── s/[handle]/               # public storefront (SSR/ISR)
│   ├── components/merchant/{ignite,workspace,storefront,catalog,offers}/
│   ├── composables/merchant/
│   │   ├── useIgnite.ts              # drives §8 state machine client-side
│   │   ├── useWorkspace.ts  usePulse.ts  useCatalog.ts  useOffers.ts
│   │   ├── useCapabilities.ts        # renders IA capability-gated (ADR §11)
│   │   └── usePermissions.ts         # client-side hint only — server gate is authoritative
│   ├── stores/                       # Pinia
│   │   ├── ignite.store.ts           # draft state, optimistic step transitions
│   │   ├── workspace.store.ts        # active business/store context, entitlements snapshot
│   │   └── catalog.store.ts
│   └── middleware/
│       ├── auth.ts                   # route guard → Identity
│       └── workspace-context.ts      # requires active membership
│
├── shared/                           # cross-cutting, dependency-free
│   ├── result.ts                     # Result<T, DomainError> — domain layer never throws for business rules
│   ├── errors.ts                     # DomainError hierarchy + stable error codes (§4)
│   └── types/                        # DTO types generated FROM contracts (never hand-drifted)
│
└── db/
    ├── migrations/                   # forward-only, numbered
    └── seeds/capability-registry.ts  # §5 seed — the registry is data
```

**Validation structure:** every request body has exactly one zod schema in `contracts/schemas/`; server endpoints parse with it (reject → `422` problem+json), client forms reuse it. DTOs are inferred from schemas — one source of truth, zero drift.

**Error handling structure:** domain returns `Result` with typed `DomainError` (code, message, details); `define-command-endpoint` maps codes → HTTP (table in §4); unexpected exceptions → `500` with correlation id, never leaked internals. All error responses are RFC 9457 `application/problem+json`.

**Pinia stores** hold UI state and context only (active store, entitlement snapshot, drafts) — never authorization decisions; `usePermissions/useCapabilities` are rendering hints, the server triple gate is the only enforcement.

---

## 2. PostgreSQL Implementation Plan

Global rules (apply to every table unless noted): PK `id uuid` (v7, app-generated) · `created_at/updated_at timestamptz not null default now()` · tenancy column `business_id` present on every business-scoped table and **leads every composite index** (ADR §14 shard key) · statuses are `text + CHECK` (A5) · soft delete only where ADR-001 defines reversibility, via `deleted_at timestamptz null`; append-only tables never update or delete · FKs `on delete restrict` (tombstoning is explicit, never cascade-magic) · no cross-business FK paths.

### 2.1 `merchant_accounts`
Purpose: the commercial actor (ADR `MerchantAccount`). Thin by design.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | merchant_id |
| user_id | uuid | Identity ref; **UNIQUE**; no FK (cross-domain boundary — referential integrity by contract, not constraint) |
| display_name | text | merchant persona |
| preferences | jsonb | UI prefs, notification prefs — schema-versioned blob |
| status | text CHECK (active, deactivated) | |
| deleted_at | timestamptz null | soft delete on account erasure request |

Indexes: `UNIQUE(user_id)`. Scale: tiny table (≤1 row/merchant), no concerns.

### 2.2 `businesses`
Purpose: the economic entity — verification, entitlement, standing (ADR `Business`).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | business_id — THE tenancy key |
| business_type | text CHECK (individual, registered) | |
| display_name | text | |
| profile | jsonb | BusinessProfile VO: story, links, public policies |
| trust_level | text CHECK (unverified, identity_verified, business_verified, banking_verified) | axis 1 |
| scale_tier | text CHECK (starter, growth, established, enterprise) | axis 2 |
| standing | text CHECK (good, flagged, restricted, suspended, banned) | axis 3; write path: Administration commands only |
| standing_context | jsonb | reason, actor, since — audit-visible |
| tax_settings | jsonb | merchant-declared settings (calculation is Commerce's) |
| closed_at / deleted_at | timestamptz null | closed = reversible 90d; deleted = tombstone, PII scrubbed |

Indexes: PK covers the hot path (all lookups by id). Partial index `(standing) WHERE standing <> 'good'` for enforcement tooling. Scale: 10M rows is small; this is the future shard key root.

### 2.3 `stores`
Purpose: the sales channel (ADR `Store`). Status ⊥ enforcement hold — **two columns, enforced separately**.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| business_id | uuid FK→businesses | |
| handle | citext | current handle; UNIQUE; full lifecycle in `store_handles` |
| name | text | |
| status | text CHECK (draft, live, paused, archived, closed, deleted) | merchant intent (ADR §7) |
| enforcement_hold | text CHECK (none, under_review, suspended) | platform enforcement (ADR §7.2) — only Administration commands write it |
| pause_context | jsonb null | reason, back_on date, notify flag |
| policies | jsonb | shipping/returns policy VOs with version history |
| completion_score | smallint | cached; recomputed by worker |
| completion_detail | jsonb | explainable missing-items list |
| settings | jsonb | |
| published_at / closed_at / deleted_at | timestamptz null | closed→deleted after 90d retention job |

Indexes: `UNIQUE(handle)`, `(business_id, status)`. Public read path never hits this table directly (read model, §10). Scale: millions of rows — trivial with these two indexes.

### 2.4 `brand_kits` *(BrandKit VO — table because ADR marks it "extractable to Business level")*

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| business_id | uuid FK | tenancy |
| owner_type / owner_id | text CHECK (store, business) / uuid | store-owned day one; business-level later without migration |
| name | text | store display name as branded |
| logo_media_id | uuid null | MediaRef — id only, never URL |
| palette / typography / voice | jsonb | colors, fonts, tone descriptors |
| ai_provenance | jsonb | which fields AI drafted, model, approved flag (ADR §13.3) |

Constraints: `UNIQUE(owner_type, owner_id)`. VO semantics preserved: updates replace the row wholesale (no partial mutation API).

### 2.5 `storefront_configs`
Purpose: themed presentation, draft/publish versioned (ADR `StorefrontConfig` — separate from Store on purpose).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; store_id uuid FK UNIQUE; business_id uuid FK | |
| theme_key | text | platform theme identifier |
| draft_config | jsonb | pages, navigation, sections — working copy |
| published_config | jsonb null | immutable last-published snapshot |
| published_version | int default 0 | monotonic; cache purge key (§10) |
| custom_domain | citext null UNIQUE | Established-tier capability |
| published_at | timestamptz null | |

Scale: JSONB configs stay <100KB (validated); public rendering reads the projection, not this table.

### 2.6 `staff_memberships`
Purpose: authority grants — humans AND AI (ADR `StaffMembership`, principal typing per ADR §5.8-6).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; business_id uuid FK | |
| principal_type | text CHECK (user, ai_agent) | org type reserved for future |
| principal_id | uuid | user_id or AI agent id |
| roles | text[] | role keys (§6) |
| store_scope | uuid[] null | null = business-wide |
| ai_policy | jsonb null | per-merchant AI autonomy config (ADR §13.1); only for ai_agent |
| status | text CHECK (invited, active, suspended, revoked) | |
| invited_by | uuid null | membership id of inviter |
| invited_at / accepted_at / revoked_at / expires_at | timestamptz null | expires_at powers time-boxed Support Agent grants |

Constraints: `UNIQUE(business_id, principal_type, principal_id)`. Partial unique index enforcing **exactly-one-Owner** invariant: `UNIQUE(business_id) WHERE 'owner' = ANY(roles) AND status = 'active'`. Indexes: `(principal_id, status)` (user's memberships lookup).

### 2.7 `capabilities` *(the Registry — platform-global data, seeded, versioned)*

| Column | Type | Notes |
|---|---|---|
| key | text PK | e.g. `offers.deals` (§5) |
| description | text | |
| required_trust_level / required_scale_tier | text | minimums (same CHECK domains as businesses) |
| required_permissions | text[] | RBAC permissions this capability's commands demand |
| dependencies | text[] | other capability keys |
| default_available | boolean | granted automatically at qualifying tier? |
| version | int | registry entries are versioned, never deleted |

No business_id — global. Cached in-process (changes rarely).

### 2.8 `business_entitlements`
Purpose: grant of a capability to a business (ADR `Entitlement`).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; business_id uuid FK; capability_key text FK→capabilities | |
| source | text CHECK (tier, subscription, grant, promotion) | |
| granted_by | jsonb | actor |
| granted_at; expires_at null; revoked_at null | timestamptz | |

Constraints: `UNIQUE(business_id, capability_key, source)`. Index: `(business_id) WHERE revoked_at IS NULL`. Effective capability = registry defaults for tier ∪ live entitlements − revocations, resolved by `EntitlementService`, cached (§10).

### 2.9 `products`
Purpose: sellable concept, business-level catalog (ADR §3 D9).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; business_id uuid FK | |
| title | text; description jsonb (rich) | |
| category_path | text | platform taxonomy node path (ADR O1) |
| fulfillment_kind | text CHECK (physical, digital, service) | day-one column per ADR §5.8-7 |
| attributes | jsonb | extensible attribute map |
| media | jsonb | ordered MediaRef[] |
| status | text CHECK (draft, active, archived) | archived = soft path; deleted_at = tombstone |
| ai_provenance | jsonb | per-field provenance (ADR §13.3) |
| deleted_at | timestamptz null | |

Indexes: `(business_id, status, updated_at desc)` (workspace grid), GIN on `attributes` **deferred until a query needs it** (ADR: complexity only when justified). Scale: the biggest table (100M+); partition-ready by hash(business_id) — no query lacks business_id, so partition pruning always applies.

### 2.10 `product_variants`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; product_id uuid FK; business_id uuid FK | business_id denormalized on purpose — shard key on every row |
| sku | text | |
| price_amount | bigint; price_currency char(3) | A3 |
| option_values | jsonb | {size:"M", color:"blue"} |
| declared_stock | int null | null = untracked; Commerce owns reservations |
| location_id | uuid null | reserved (ADR §5.8-4); single implicit location day one |
| position | smallint | |

Constraints: `UNIQUE(business_id, sku) WHERE sku IS NOT NULL`, ≥1 variant per product enforced in aggregate (not DDL). Index: `(product_id, position)`.

### 2.11 `listings`
Purpose: publication of Product → Store (ADR D5 — exists day one, invisible in UI).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; business_id; store_id uuid FK; product_id uuid FK | |
| overrides | jsonb | per-channel title/price/visibility deltas — empty day one |
| status | text CHECK (draft, published, unpublished) | |
| seo | jsonb | per-channel SEO metadata |
| published_at | timestamptz null | |

Constraints: `UNIQUE(store_id, product_id)`. Indexes: `(store_id, status, published_at desc)` (storefront queries), `(product_id)` (fan-out on product change). Scale: ~1× products day one, N× later — same partition strategy as products.

### 2.12 `collections` + `collection_listings` *(child table, required for manual members)*

`collections`: id PK · business_id · store_id FK · title · media jsonb · type CHECK (manual, smart) · spec jsonb null (Specification rule doc for smart) · sort_policy text · status CHECK (active, archived) · deleted_at.
`collection_listings`: collection_id FK + listing_id FK (composite PK) · position smallint · added_by jsonb (actor — human or smart-evaluator). Smart collections: worker evaluates `spec` against listings on catalog events and maintains rows in `collection_listings` — reads never evaluate rules (§7).

Indexes: `(store_id, status)`; child `(listing_id)` for reverse lookups.

### 2.13 `offers`
Purpose: one aggregate, strategy-typed (ADR: Deal/Coupon/Promotion + future Drop).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; business_id uuid FK | |
| offer_type | text CHECK (deal, coupon, promotion) | `drop` added by migration when shipped |
| name | text | |
| targeting | jsonb | ListingSpecification document (same rule language as smart collections) |
| value | jsonb | strategy doc: {kind: percent/amount/bogo, …} |
| schedule | jsonb | {starts_at, ends_at, tz} — Deals always have one |
| code | citext null | coupons; `UNIQUE(business_id, code)` partial |
| usage_limits | jsonb | total, per-customer |
| social_amplify | boolean | Deal flag (ADR §3) |
| status | text CHECK (draft, scheduled, active, expired, cancelled) | status transitions by worker on schedule boundaries |

Indexes: `(business_id, status)`, `(status, ((schedule->>'starts_at')::timestamptz))` for the activation sweep. Commerce reads offers via published events/read API — never this table.

### 2.14 `verification_cases`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; business_id uuid FK | |
| target_trust_level | text | same CHECK domain |
| status | text CHECK (draft, submitted, in_review, approved, rejected, expired) | |
| evidence | jsonb | MediaRef ids + provider check references — **never raw documents** |
| provider | text null; provider_ref text null | pluggable KYB adapter (ADR §10) |
| review_trail | jsonb | append-only array of {actor, action, note, at} |
| decided_by | jsonb null; decided_at timestamptz null; rejection_reason text null | human-readable reason mandatory on reject |

Indexes: `(business_id, created_at desc)`, `(status) WHERE status IN ('submitted','in_review')` (review queue for Administration). Rows are never deleted (compliance); retention on `evidence` media handled by Media domain policy.

### 2.15 `audit_logs` *(append-only — no UPDATE/DELETE grants)*

| Column | Type | Notes |
|---|---|---|
| id | uuid PK (v7 = time-ordered) | |
| business_id | uuid | nullable for platform-scope entries |
| actor | jsonb | {type: user/ai_agent/admin/system, id, membership_id?} |
| command | text | command name from §3 |
| sensitivity | text CHECK (normal, sensitive) | sensitive = §9 step-up ops |
| target | jsonb | aggregate type + id |
| before_digest / after_digest | jsonb | field-level diff summary, PII-minimized |
| context | jsonb | ip, device fingerprint, correlation_id, step_up_verified |
| created_at | timestamptz | no updated_at — immutable |

Indexes: `(business_id, created_at desc)`. Scale: **declarative range partitioning by month from day one** (cheap now, painful retrofit later); retention: partitions archived to cold storage per compliance schedule. Merchant-visible subset served via filtered query (ADR §15 "audit as a feature").

### 2.16 `domain_events` *(append-only event log — system of record for §7 projections)*

| Column | Type | Notes |
|---|---|---|
| id | uuid PK (v7) | event_id |
| business_id | uuid | partition key |
| aggregate_type / aggregate_id | text / uuid | |
| sequence | bigint | per-aggregate monotonic (optimistic concurrency check) |
| event_type | text; schema_version smallint | e.g. `merchant.store.published` v1 |
| payload | jsonb | §7 envelope payload |
| actor | jsonb | mandatory (ADR §5.5) |
| occurred_at | timestamptz | |

Constraints: `UNIQUE(aggregate_type, aggregate_id, sequence)`. Indexes: `(business_id, occurred_at)`, `(event_type, occurred_at)` (rebuild scans). Monthly range partitions. This is not full event-sourcing — aggregates persist state relationally; events are the authoritative *integration and rebuild* log (ADR: "rebuild-the-index-from-events is a required capability").

### 2.17 `outbox_events` *(transactional outbox — ADR §14)*

| Column | Type | Notes |
|---|---|---|
| id | uuid PK; domain_event_id uuid FK→domain_events | |
| partition_key | uuid | = business_id (ordering guarantee per ADR) |
| status | text CHECK (pending, dispatched, dead) | |
| attempts | smallint; next_attempt_at timestamptz | exponential backoff |
| dispatched_at | timestamptz null | |

Index: `(status, next_attempt_at) WHERE status = 'pending'` (the relay's only query). Written **in the same transaction** as the aggregate change + domain_events row. Dispatched rows purged after 7 days (job). Day one the "broker" is this table + worker fan-out to consumers; broker relay is the growth-stage swap (ADR D12).

### 2.18 Supporting tables (A6 — required by ADR mechanics, labeled additions)

**`ignite_drafts`** — §8 draft persistence: id PK · owner_token uuid (guest cookie) · user_id uuid null (bound at claim) · state text (§8 machine) · intent jsonb · identity_drafts jsonb · chosen_identity jsonb · product_draft jsonb · handle_reservation_id uuid null · last_step_at timestamptz · completed_at / abandoned_nudge_sent_at null. Index `(user_id)`, `(owner_token)`. Drafts persist indefinitely per ADR §9 ("draft persists forever"); PII-light by design.

**`store_handles`** — HandleService ledger: handle citext PK · store_id uuid null · status CHECK (reserved, active, redirect, quarantined) · redirect_to_handle citext null · reserved_until timestamptz null (30-min Ignite reservations) · quarantined_until (90-day HandleReleasePolicy). `stores.handle` is a denormalized copy of the current `active` row; every rename writes a `redirect` row.

**`event_deliveries`** — idempotency ledger (§7): consumer text + event_id uuid composite PK · processed_at. Insert-or-skip makes every consumer exactly-once-effective.

---

## 3. Domain Layer Design (ADR-001 → implementation map)

| ADR-001 concept | Kind | Module path (under `domains/merchant/`) | Persistence |
|---|---|---|---|
| MerchantAccount | Aggregate root | `core/domain/merchant-account.ts` | `merchant_accounts` |
| Business (+ BusinessProfile, TrustLevel, ScaleTier, Standing VOs) | Aggregate root | `core/domain/business.ts` | `businesses` |
| Store (+ StoreStatus machine, pause context) | Aggregate root | `core/domain/store.ts` | `stores` |
| BrandKit | Value object | `shared-kernel/brand-kit.ts` | `brand_kits` (VO semantics: whole-row replace) |
| StorefrontConfig | Aggregate root | `storefront/domain/storefront-config.ts` | `storefront_configs` |
| StaffMembership | Aggregate root | `core/domain/staff-membership.ts` | `staff_memberships` |
| Product + Variant | Aggregate root + entity | `catalog/domain/product.ts` | `products`, `product_variants` |
| Listing | Aggregate root | `catalog/domain/listing.ts` | `listings` |
| Collection | Aggregate root | `catalog/domain/collection.ts` | `collections`, `collection_listings` |
| Offer (Deal/Coupon/Promotion strategies) | Aggregate root | `catalog/domain/offer.ts` + `offer-strategies/` | `offers` |
| VerificationCase | Aggregate root | `trust/domain/verification-case.ts` | `verification_cases` |
| Handle, Price, SKU, MediaRef, Schedule, AIProvenance, CompletionScore, PolicyText, CategoryPath | Value objects | `shared-kernel/*.ts` | embedded columns/jsonb |
| BusinessProvisioningService | Domain service (saga) | `core/application/business-provisioning.service.ts` | orchestrates §8 sequence |
| HandleService | Domain service | `core/application/handle.service.ts` | `store_handles` |
| EntitlementService | Domain service | `core/application/entitlement.service.ts` | `capabilities` + `business_entitlements`, cached |
| TrustPolicyService | Domain service | `trust/application/trust-policy.service.ts` | reads `businesses` axes |
| SmartCollectionEvaluator | Domain service (worker) | `catalog/application/smart-collection-evaluator.ts` | event-triggered |
| CompletionScoringService | Domain service (worker) | `core/application/completion-scoring.service.ts` | writes `stores.completion_*` |
| OwnershipTransferService | Domain service | `core/application/ownership-transfer.service.ts` | §9 protocol |
| Repositories (one per root) | Interface in `*/domain/`, impl in `*/infrastructure/` | e.g. `catalog/domain/product.repository.ts` | SQL via a thin query builder; no ORM lazy-loading across aggregates |
| BusinessFactory, StoreFactory.fromIgnite | Factories | `core/domain/factories/` | |
| ListingSpecification, PublishableStoreSpec, MerchantEligibilitySpec | Specifications | `catalog/domain/specifications/`, `core/domain/specifications/` | `ListingSpecification` = the jsonb rule language shared by smart collections + offer targeting |
| StandingConsequencePolicy, TierLimitPolicy, VerificationNudgePolicy, HandleReleasePolicy | Policies (event-reactive) | `*/application/policies/` — registered as event consumers (§7) | |
| Commands/Queries + triple gate | Application layer | `*/application/commands|queries/`; gate in `shared-kernel/command-gate.ts` | every command: RBAC → Entitlement → Trust/Standing (ADR §5.6) |
| Domain events | Typed constants + payload schemas | `*/domain/events.ts` + `contracts/schemas/events/` | `domain_events` + `outbox_events` |

Aggregate persistence rule: repositories load/save whole aggregates in one transaction; optimistic concurrency via `domain_events.sequence`; a repository never returns another aggregate's rows.

---

## 4. API Contract Plan (REST v1, contract-first)

Conventions: base `/api/v1` · auth = Identity session cookie (A2) · errors = RFC 9457 problem+json with stable `code` · every command endpoint passes the triple gate — listed as **P** (permission), **E** (entitlement/capability), **T** (trust/standing) · validation = named zod schema in `contracts/schemas/` · standard errors on all authed routes: `401 AUTH_REQUIRED`, `403 PERMISSION_DENIED | CAPABILITY_MISSING | STANDING_BLOCKED | TRUST_LEVEL_REQUIRED`, `404 NOT_FOUND` (also used to mask cross-tenant probes), `409 CONFLICT`, `422 VALIDATION_FAILED`, `429 RATE_LIMITED`. Only endpoint-specific extras are listed below. Mutating POSTs accept an `Idempotency-Key` header (stored 24h, replayed response on retry).

### Ignite

**POST `/ignite/sessions`** — start Ignite. Auth: none (guest ok; sets `owner_token` cookie). Body: `{ intent_text?: string }`. Resp `201`: `{ session_id, state, next_step }`. Validation: `ignite.start`. Extra errors: `429` (per-IP). Gates: none (E: `ignite.flow` is default-available; T: none — ADR §0.2). Rate limit: 5/hr/IP.

**PATCH `/ignite/sessions/:id`** — save draft / advance step. Auth: none (owner_token or session must match draft owner). Body: `{ step, data }` (discriminated union per step: intent | identity_choice | product_draft | price_ack). Resp `200`: `{ state, ai_jobs?: [{job_id, status}], next_step }`. Extra errors: `409 IGNITE_INVALID_TRANSITION`, `410 IGNITE_COMPLETED`.

**POST `/ignite/sessions/:id/complete`** — the claim + launch (§8 provisioning saga). Auth: **required** (registration happened in Step 4). Body: `{ publish: boolean }`. Resp `201`: `{ business_id, store_id, store_url, launch_card_media_id }`. Extra errors: `409 HANDLE_TAKEN` (reservation expired + collision), `409 IGNITE_INCOMPLETE`, `502 PROVISIONING_FAILED` (saga compensated; retryable). Gates: E `ignite.flow`; T: none to publish (Progressive Trust).

### Business & Store

**POST `/businesses`** — create business (non-Ignite path). Auth: required. Body: `{ display_name, business_type }`. Resp `201`: business summary. Gates: P none (self-service) · E `store.core` default · T: MerchantEligibilitySpec (not banned platform-wide).

**POST `/businesses/:businessId/stores`** — create store. Body: `{ name, handle? }`. Resp `201`: store (status `draft`). Extra: `409 HANDLE_TAKEN`, `403 CAPABILITY_MISSING` (2nd store needs `stores.multiple`). Gates: P `store.create` · E `store.core` (+`stores.multiple` if >1) · T standing ≠ suspended/banned.

**POST `/stores/:storeId/publish`** — publish (Draft/Paused → Live). Body: `{}`. Resp `200`: `{ status: "live", published_at }`. Extra: `409 STORE_NOT_PUBLISHABLE` (PublishableStoreSpec details array), `423 ENFORCEMENT_HOLD` (hold ⊥ status — merchant cannot publish through a hold). Gates: P `store.publish` · E `store.core` · T standing good/flagged.

**PUT `/stores/:storeId/brand-kit`** — replace BrandKit (VO = whole-document PUT, never PATCH). Body: `brandkit.update` schema. Resp `200`: brand kit. Gates: P `storefront.brand.write` · E `store.core` · T any.

### Catalog

**POST `/businesses/:businessId/products`** — create product (+ inline variants allowed; auto-creates default variant if none — ADR "≥1 Variant, even implicit"). Body: `catalog.product.create` `{ title, description?, media?, category_path?, fulfillment_kind, variants?: […], ai_draft_id? }`. Resp `201`: product with variants. Extra: `409 SKU_TAKEN`, `403 TIER_LIMIT_REACHED` (TierLimitPolicy). Gates: P `catalog.product.write` · E `catalog.products` · T standing permits writes.

**POST `/products/:productId/variants`** — add variant. Body: `{ sku?, price: {amount, currency}, option_values, declared_stock? }`. Resp `201`. Extra: `409 SKU_TAKEN`, `409 OPTIONS_INCONSISTENT`. Gates: same as product create.

**POST `/stores/:storeId/listings`** — publish product to store. Body: `{ product_id, overrides?, publish?: boolean }`. Resp `201`: listing. Extra: `409 ALREADY_LISTED`, `404` product not in this business. Gates: P `catalog.listing.write` · E `catalog.products` · T standing.

**POST `/stores/:storeId/collections`** — create collection. Body: `{ title, type, spec? (required iff smart), listing_ids? (manual) }`. Resp `201`. Extra: `422 SPEC_INVALID` (rule language validation). Gates: P `catalog.collection.write` · E `catalog.collections` · T standing.

**POST `/businesses/:businessId/offers`** — create offer. Body: `offer.create` `{ offer_type, name, targeting, value, schedule, code?, usage_limits?, social_amplify? }`. Resp `201`: offer (status draft/scheduled). Extra: `409 CODE_TAKEN`, `422 SCHEDULE_INVALID`, `403 CAPABILITY_MISSING` per type (deals/coupons: starter; promotions: growth). Gates: P `offers.write` · E `offers.<type>` · T standing good.

### Staffing & Trust

**POST `/businesses/:businessId/staff`** — invite staff. Body: `{ email, roles, store_scope? }`. Resp `201`: membership (status invited). Extra: `409 ALREADY_MEMBER`, `403 TIER_LIMIT_REACHED`. Gates: P `staff.invite` · E `staff.manage` · T standing good + **step-up auth** (§9).

**PATCH `/staff-memberships/:id`** — change roles / revoke. Body: `{ roles? , status? ("revoked") , store_scope? }`. Resp `200`. Extra: `409 LAST_OWNER` (cannot demote sole owner — invariant), `403 SELF_ELEVATION`. Gates: P `staff.manage_roles` · E `staff.manage` · T standing + step-up.

**POST `/businesses/:businessId/verification-cases`** — submit verification. Body: `{ target_trust_level, evidence: [{kind, media_id | provider_ref}] }`. Resp `201`: case (submitted). Extra: `409 CASE_ALREADY_OPEN`, `422 EVIDENCE_INCOMPLETE`. Gates: P `business.verification.submit` (Owner/Manager) · E default · T any standing except banned.

### Reads (query side — served from read models, §10)

**GET `/workspace`** — merchant bootstrap: memberships, businesses, stores, effective capabilities, active context. Auth: required. Resp `200`: `workspace.overview` DTO. Gates: membership existence only.

**GET `/workspace/stores/:storeId/pulse`** — Pulse feed: `{ attention: [...], opportunities: [...], performance: {...}, completion: {score, missing[]} }`. Gates: P `store.view`.

**GET `/storefronts/:handle`** — public store view (SSR/ISR path). Auth: none. Resp `200`: `rm_store_public` projection (store, brand kit, published listings page 1, collections, active deals) — `404` if not live, `410` if closed with farewell page flag. Never leaks: enforcement hold reason, internal ids beyond public ones. Cache: edge, purged on projection update (§10).

---

## 5. Capability Registry Blueprint (initial seed — `db/seeds/capability-registry.ts`)

| Key | Description | Trust ≥ | Tier ≥ | Required permission | Depends on | Default |
|---|---|---|---|---|---|---|
| `ignite.flow` | Run Ignite onboarding | — | — (guests) | — | — | ✅ |
| `store.core` | Create/manage/publish one store | unverified | starter | `store.*` | — | ✅ |
| `catalog.products` | Products & variants | unverified | starter | `catalog.product.write` | `store.core` | ✅ |
| `catalog.collections` | Manual + smart collections | unverified | starter | `catalog.collection.write` | `catalog.products` | ✅ |
| `catalog.inventory` | Declared stock tracking | unverified | starter | `catalog.inventory.write` | `catalog.products` | ✅ |
| `storefront.customize` | Theme + storefront editing | unverified | starter | `storefront.write` | `store.core` | ✅ |
| `offers.deals` | Deals (flagship) | unverified | starter | `offers.write` | `catalog.products` | ✅ |
| `offers.coupons` | Coupon codes | unverified | starter | `offers.write` | `catalog.products` | ✅ |
| `selling.orders_view` | Orders read model surface | unverified | starter | `orders.view` | `store.core` | ✅ |
| `selling.payouts` | Receive payouts (Commerce enforces via trust axis) | **identity_verified** | starter | `finance.payouts.view` | `selling.orders_view` | ✅ at trust |
| `ai.assistant` | AI staff member, draft-only default | unverified | starter | `ai.configure` (to change autonomy) | `store.core` | ✅ |
| `offers.promotions` | Store-wide promotions + scheduling | unverified | growth | `offers.write` | `offers.deals` | ✅ at tier |
| `analytics.advanced` | Insights surface | unverified | growth | `analytics.view` | `store.core` | ✅ at tier |
| `seo.tools` | SEO metadata tooling | unverified | growth | `storefront.write` | `storefront.customize` | ✅ at tier |
| `staff.manage` | Invite/manage staff | identity_verified | growth | `staff.invite` | `store.core` | ✅ at tier+trust |
| `stores.multiple` | >1 store per business | business_verified | established | `store.create` | `store.core` | ✅ at tier+trust |
| `catalog.shared` | Business-level catalog across stores | business_verified | established | `catalog.product.write` | `stores.multiple` | ✅ at tier+trust |
| `storefront.custom_domain` | Custom domain binding | business_verified | established | `storefront.domain.write` | `storefront.customize` | ✅ at tier+trust |
| `api.access` | REST API keys + webhooks | business_verified | established | `developer.manage` | — | opt-in |
| `org.enterprise` | Org structures, custom roles, SLAs | banking_verified | enterprise | contract | — | manual grant |

Resolution rule (EntitlementService): capability available ⇔ (default at business's tier+trust ∨ explicit live entitlement) ∧ dependencies satisfied ∧ standing permits. Result cached per business, invalidated on `TrustLevelRaised | ScaleTierChanged | StandingChanged | EntitlementGranted/Revoked`.

## 6. Permission Matrix

Atomic permissions grouped; ✅ full, 📝 draft-only (cannot publish/execute), 👁 read-only, ⏱ time-boxed + fully audited, — none. **Moderator/Administrator are NOT merchant roles** (ADR §12.2): they act through the Administration domain's command API (standing changes, enforcement holds) — shown here only to make that boundary explicit.

| Permission group | Owner | Manager | Staff | Support Agent | AI Assistant | Moderator | Administrator |
|---|---|---|---|---|---|---|---|
| `store.view` (workspace read) | ✅ | ✅ | ✅ | ⏱👁 | 👁 | via admin API | via admin API |
| `store.create` / `store.publish` | ✅ | ✅ / ✅ | — | — | — | — | — |
| `store.pause_resume` | ✅ | ✅ | — | — | — | — | — |
| `storefront.write` / `storefront.brand.write` | ✅ | ✅ | — | ⏱📝 | 📝 | — | — |
| `catalog.product.write` | ✅ | ✅ | ✅ | ⏱📝 | 📝→✅* | — | — |
| `catalog.listing.write` / `collection.write` | ✅ | ✅ | ✅ | ⏱📝 | 📝 | — | — |
| `offers.write` | ✅ | ✅ | — | — | 📝 (never prices, ADR §13.3) | — | — |
| `orders.view` / fulfillment actions | ✅ | ✅ | ✅ | ⏱👁 | 👁 | — | — |
| `finance.payouts.view` | ✅ | 👁 | — | — | — | — | — |
| `finance.payout_config` | ✅ | — | — | — | — (hard guardrail) | — | — |
| `staff.invite` / `staff.manage_roles` | ✅ | — | — | — | — (hard guardrail) | — | — |
| `business.profile.write` | ✅ | ✅ | — | — | 📝 | — | — |
| `business.verification.submit` | ✅ | ✅ | — | — | — | — | — |
| `business.transfer` / `business.close` | ✅ (step-up) | — | — | — | — (hard guardrail) | — | — |
| `ai.configure` (autonomy policy) | ✅ | ✅ | — | — | — | — | — |
| `audit.view` (merchant-visible log) | ✅ | ✅ | — | — | — | — | — |
| Standing / enforcement hold | — | — | — | — | — | ✅ via admin API | ✅ via admin API |

\* AI `📝→✅`: publishable-without-approval only for fields the merchant's `ai_policy` allows (e.g. descriptions), never prices, never deletes — enforced in the gate, not the UI.

---

## 7. Event Architecture

**Envelope** (every event): `{ event_id (uuidv7), event_type ("merchant.store.published"), schema_version, occurred_at, business_id, aggregate: {type, id, sequence}, actor: {type: user|ai_agent|admin|system, id, membership_id?}, payload }`. Consumers must tolerate unknown payload fields (ADR §5.5).

**Catalog of events → key payload fields** (full list = ADR §5.5; payload schemas live in `contracts/schemas/events/`):

| Event | Payload highlights | Primary consumers |
|---|---|---|
| `merchant.onboarded` | merchant_id, user_id, source (ignite/direct) | Analytics, Notification |
| `business.created` / `business.closed` | business_id, type, tier, trust | Analytics, Commerce |
| `business.trust_level_raised` | from, to, case_id | **Commerce (payout unlock)**, Notification, EntitlementService cache |
| `business.standing_changed` | from, to, reason_code, actor | StandingConsequencePolicy, Commerce (payout hold), Search (delist check) |
| `store.published` | store_id, handle, name, brand_kit summary | **Community (launch Spark seed)**, Search, Notification, projections |
| `store.paused/resumed/archived/closed` | store_id, pause_context? | Search, Community, projections |
| `product.published` / `listing.published` | ids, title, category, price range, media refs | Search, projections, SmartCollectionEvaluator |
| `variant.price_changed` | variant_id, old/new price | Search, projections, Commerce cache |
| `offer.activated` / `offer.expired` | offer_id, type, targeting summary, schedule, social_amplify | **Community (deal moment)**, Search, Notification, Commerce (enforcement data) |
| `staff.invited/joined/role_changed/revoked` | membership_id, roles | Notification, Identity (session invalidation on revoke) |
| `verification.submitted/approved/rejected` | case_id, target_level, reason? | Administration (queue), Notification, trust policy |

**Outbox pattern (exact mechanics):** (1) command handler mutates aggregate rows + inserts `domain_events` + `outbox_events` in **one transaction**; (2) `server/tasks/outbox-dispatch.ts` (Vercel cron, every minute, plus opportunistic trigger after each request via `waitUntil`) claims pending rows `FOR UPDATE SKIP LOCKED` ordered by `partition_key, id` — per-business ordering preserved; (3) delivers to each registered consumer; (4) marks dispatched or backs off (attempts++, exponential `next_attempt_at`, `dead` after 10 → alert). Day-one consumers are in-process task handlers; the broker relay replaces step 3 at scale with zero producer change (ADR D12).

**Consumers (registered in `container.ts`):** internal — projection builders, StandingConsequencePolicy, TierLimitPolicy watcher, VerificationNudgePolicy, SmartCollectionEvaluator, CompletionScoringService, HandleReleasePolicy (on store deletion); external (cross-domain, via their published endpoints/queues) — Search indexer, Community, Notification, Analytics, Commerce.

**Projection strategy:** read models are plain tables prefixed `rm_` (`rm_store_public` keyed by handle; `rm_workspace_overview` keyed by user_id; `rm_pulse_items` keyed by store_id), built only from `domain_events`, rebuildable by replay (`projection-rebuild.ts`; rebuild drill is a release requirement per ADR §14). Projections are eventually consistent; workspace writes read their own aggregates, never projections.

**Idempotency:** every consumer wraps work in `event_deliveries` insert-or-skip (composite PK consumer+event_id) inside its own transaction — at-least-once delivery, exactly-once effect. Command-side idempotency via `Idempotency-Key` (§4).

---

## 8. Ignite Implementation Blueprint

**State machine** (persisted in `ignite_drafts.state`; transitions validated server-side, `409 IGNITE_INVALID_TRANSITION` otherwise):

```
STARTED ──intent──► INTENT_CAPTURED ──ai──► IDENTITY_DRAFTED ──choice──► IDENTITY_CHOSEN
   │                     │ (ai timeout)                                        │
   │                     └────► TEMPLATE_FALLBACK ─────────────────────────────┤
   │                                                                     product photo/text
   ▼                                                                           ▼
ABANDONED (soft — any state, by inactivity; resumable forever)         PRODUCT_DRAFTED
                                                                                │ approve/price-ack
                                                                                ▼
                        PUBLISHED ◄──saga ok── PROVISIONING ◄──auth ok── CLAIMED (registration)
                                                    │ saga fail (compensated)
                                                    └────► PROVISION_FAILED (retryable)
```

- **Draft persistence:** `ignite_drafts` row created at STARTED; guest identified by `owner_token` cookie (uuid, httpOnly, 1-year); every PATCH updates step data + `last_step_at`. At CLAIMED, `user_id` is bound and the cookie token retired. Drafts persist indefinitely (ADR §9); re-entry endpoint returns draft + current state so the client lands exactly where the founder left.
- **AI extension points** (each an AI Job via the Open Host interface, ADR §13.2; async with p95 budget on a priority queue): `ignite.identity_draft` (intent → 3 names+handles+BrandKit drafts+one-liner; budget 6s), `ignite.product_draft` (photo/text → title, description, category, price range + reasoning; budget 8s), `ignite.launch_card` (post-publish, non-blocking). Client polls job status via the PATCH response's `ai_jobs`. **Timeout/failure → TEMPLATE_FALLBACK**: 3 curated template identities + manual product form (ADR §9 failure paths) — Ignite never dead-ends on AI.
- **Handle reservation:** at IDENTITY_CHOSEN, `HandleService.reserve()` inserts `store_handles` row (`reserved`, `reserved_until = now()+30min`, tied to draft id). Expired reservations swept by job. At completion, reservation promoted to `active` atomically; if lost (expired + taken), complete returns `409 HANDLE_TAKEN` with fresh suggestions — the only step-back in the flow.
- **Store creation sequence** (`BusinessProvisioningService`, the saga behind POST `/complete`): 1 create Business (individual, unverified, starter, good) → 2 create Store (draft) + promote handle → 3 persist BrandKit → 4 create StorefrontConfig (default theme, AI palette) → 5 create Product + default Variant (from approved draft, `ai_provenance` stamped) → 6 create Listing (published) → 7 create Owner StaffMembership + AI Assistant membership (draft-only `ai_policy`) → 8 resolve default Entitlements → 9 emit `merchant.onboarded`, `business.created`, `store.created`, `product.published`, `listing.published`. Steps 1–9 are sequential with per-step compensation (delete created rows in reverse) — on any failure: compensate, state → PROVISION_FAILED, return `502 PROVISIONING_FAILED`; retry is safe (idempotent by session id).
- **Publishing sequence** (if `publish: true`, the default): PublishableStoreSpec (name + ≥1 published listing + default policies present — deliberately low bar) → check `enforcement_hold = none` → status → `live`, `published_at` set → emit `store.published` → outbox fans out to Community (launch Spark seed), Search, Notification, projections → response includes `store_url` + launch card job id. Celebration screen renders immediately; launch card arrives via polling (non-blocking).
- **Abandoned draft recovery:** daily job selects drafts `last_step_at < now()-24h` and `abandoned_nudge_sent_at is null` with a bound user or reachable channel → emits `ignite.draft_abandoned` → Notification sends the founder their own storefront preview as the hook (ADR §9); mark nudged (once, not a drip — respect beats retargeting).

---

## 9. Security Blueprint

- **RBAC enforcement:** every command endpoint declares `{ permission, capability, sensitivity }` in `define-command-endpoint`. Gate order (fail-fast, cheapest first): session → membership resolution (business/store scope) → **P** role→permission check → **E** EntitlementService → **T** TrustPolicyService (standing + trust minimum). Deny = generic `403` codes from §4; cross-tenant ids answer `404` (existence masking). The gate lives in `shared-kernel/command-gate.ts` — one implementation, zero per-endpoint bespoke checks.
- **Capability enforcement:** capability keys checked server-side only; `useCapabilities` merely hides UI. Registry changes are migrations to seed data — reviewed like code.
- **Trust-level enforcement:** TrustPolicyService is the single choke point; Commerce independently re-checks trust on payout operations via the sync query API (defense in depth — two domains must agree before money moves).
- **Audit logging:** middleware inside `define-command-endpoint` writes `audit_logs` for **every accepted command** (and every denied *sensitive* command) with actor, diff digests, correlation id. AI actions carry `actor.type = ai_agent` + membership id. Merchant-visible audit endpoint filters to their business, redacts platform-internal context.
- **Ownership transfer protection** (`OwnershipTransferService`): initiate (Owner, step-up) → new owner accepts (step-up) → 72h cooling-off with cancel link to ALL admins + Notification blast → execute (owner-uniqueness invariant swaps atomically) → `business.ownership_transferred` audited with full before/after. Any party can abort during cooling-off.
- **Store publishing safeguards:** PublishableStoreSpec + `enforcement_hold` check (`423`) + standing check + rate limit on publish/unpublish cycling (anti-abuse); handle changes on live stores require step-up and emit redirect rows (no 404s, no hijack window).
- **Rate limiting** (`03.rate-limit.ts`, sliding window, keyed by user else IP): Ignite start 5/hr/IP · handle availability checks 30/min · AI draft jobs 20/hr/business · staff invites 10/day/business · verification submissions 3/open-case · global authed default 300/min. `429` + `Retry-After`.
- **Step-up authentication:** commands with `sensitivity: sensitive` (transfer, close, payout config, staff role changes, handle change, custom domain) require an Identity-issued step-up assertion (fresh MFA ≤5 min); enforced in the gate, recorded in audit `context.step_up_verified`. Anomaly signals (mass deletes, bulk price→~0, aged-store handle change) emit `security.anomaly_flagged` to Administration (ADR §15).

---

## 10. Scalability Blueprint

Targets: 10M merchants, millions of stores, 100M+ products — no rewrites (ADR §14).

- **Indexing strategy:** every query path shown in §2 has a named index; **every business-scoped index leads with `business_id`**; no unindexed foreign key on a write path; append-only tables (audit, events) range-partitioned by month from day one; `products`/`listings`/`product_variants` are hash-partition-ready on `business_id` (enable at ~10⁸ rows — pure DDL change, queries already prune).
- **Read/write separation:** the storefront read path (`GET /storefronts/:handle`) is the ~1000:1 hot path and never touches aggregate tables — it reads `rm_store_public` only. Growth path: same projection served from replicas → dedicated read store — projection builders are the only writers, so the swap is invisible.
- **Caching strategy (layered, event-purged — never TTL-hoping):** L1 edge/ISR: storefront pages cached at Vercel edge, purged (revalidated) on `rm_store_public` update via `storefront_configs.published_version` as cache key. L2 data cache (Vercel KV/Redis-class behind a `CachePort` interface): entitlement resolutions (invalidated on the 4 events in §5), handle lookups, capability registry (in-process, version-stamped). L3: none until measured need (ADR: justified complexity only).
- **Event projections & read models:** all `rm_*` tables rebuildable from `domain_events` replay; rebuild runs as background task writing to a shadow table, then atomic rename — zero-downtime reprojection is the escape hatch for every future read-model mistake.
- **Queues/background jobs:** day one Vercel cron + `waitUntil` opportunistic dispatch + Postgres-backed queue (§2.17); Ignite AI jobs get the priority lane (p95 budgets §8). Growth: move dispatch to a broker + dedicated workers — contracts unchanged (ADR D12).
- **Future service extraction seams** (ADR §14 order): 1 **Catalog** (hottest data; its module already owns its tables exclusively — extraction = move module + tables + subscribe to core events over the wire), 2 **Storefront rendering** (stateless consumer of projections — trivially extractable), 3 **Trust & Verification** (compliance isolation, regional deployment), 4 **Merchant Core** last (the kernel). The rule that makes this real: **no cross-subdomain table joins, no cross-subdomain imports except `shared-kernel`** — enforced by lint rule in CI from the first commit.

---

## Final Recommendations

### 1. Recommended Module 1 to code

**The Merchant Kernel** — `domains/merchant/core` + shared-kernel + the platform spine (triple gate, outbox, audit, registry). Scope: merchant account, business, store (full status machine + enforcement hold), BrandKit, staff membership (Owner + invariant), capability registry + entitlement resolution, handle service, domain events + outbox + audit, and the workspace bootstrap read. **Not** Ignite first: Ignite is a consumer of the kernel (BusinessProvisioningService orchestrates kernel operations) — building it first would force mocking the entire kernel. Module 2 = Catalog, Module 3 = Ignite (the payoff), Module 4 = Trust & Verification.

### 2. Exact tables to create first (migration 0001, in dependency order)

`merchant_accounts` → `businesses` → `store_handles` → `stores` → `brand_kits` → `storefront_configs` → `staff_memberships` → `capabilities` (+ seed) → `business_entitlements` → `domain_events` → `outbox_events` → `event_deliveries` → `audit_logs`.
(Catalog tables land in migration 0002 with Module 2; `ignite_drafts`, `verification_cases` with Modules 3–4.)

### 3. Exact APIs to create first

1. `GET /api/v1/workspace` — bootstrap (proves session→membership→entitlement resolution end to end)
2. `POST /api/v1/businesses` — create business
3. `POST /api/v1/businesses/:businessId/stores` — create store (proves handle reservation)
4. `PUT /api/v1/stores/:storeId/brand-kit` — BrandKit replace
5. `POST /api/v1/stores/:storeId/publish` — publish (proves PublishableStoreSpec, enforcement-hold gate, outbox, `store.published` event, audit)

These five exercise every kernel mechanism: triple gate, VO validation, state machine, events, audit. Everything after is repetition of proven patterns.

### 4. Exact Fable prompt to generate the first production code module

```
# DOF PLATFORM — PROMPT 003: Generate Module 1 (Merchant Kernel)

You are implementing Module 1 of DOF per two binding documents in this repo:
- architecture/ADR-001-merchant-domain.md (v1.1) — the architecture; never contradict it
- architecture/BLUEPRINT-001-merchant-domain-implementation.md — the implementation plan; follow it exactly

Generate production-ready code (Nuxt 3 + Vue 3 + TypeScript + PostgreSQL + Vercel) for the Merchant Kernel:

1. Repo scaffold per BLUEPRINT-001 §1 (contracts/, domains/, server/, app/, shared/, db/) including the CI lint rule forbidding cross-subdomain imports.
2. Migration 0001 with exactly the tables in BLUEPRINT-001 "Final Recommendations §2", matching §2 column-for-column, plus the capability registry seed from §5.
3. domains/merchant/shared-kernel: branded ids, Price, Handle, MediaRef, BrandKit, AIProvenance, Result/DomainError, and the triple command gate (RBAC → Entitlement → Trust/Standing) per §9.
4. domains/merchant/core: MerchantAccount, Business (3 axes), Store (status machine ⊥ enforcement_hold), StaffMembership (exactly-one-Owner invariant), repositories (interface + Postgres impl), HandleService, EntitlementService, TrustPolicyService, BusinessFactory, StoreFactory, PublishableStoreSpec, domain events per §7 envelope.
5. Outbox: transactional write, cron dispatch task with SKIP LOCKED claiming, event_deliveries idempotency, audit_logs middleware — per §7 and §9.
6. The five endpoints in "Final Recommendations §3", contract-first: zod schemas in contracts/schemas/, RFC 9457 problem+json errors with the exact codes from §4, Idempotency-Key support.
7. Tests: unit tests for every aggregate invariant and the gate; integration tests for the five endpoints covering happy path + each gate rejection (403 permission / 403 capability / 403 standing / 423 enforcement hold / 409 handle taken / 409 store not publishable).

Rules: no placeholder implementations (Engineering Constitution anti-hallucination rules); every architectural deviation must be stated and justified; if a blueprint detail is ambiguous, choose the safest production default and record it in a DECISIONS.md; Identity domain is stubbed behind an interface (session → user_id) clearly marked as the integration point.

Definition of done: migrations apply cleanly; all tests pass; `GET /workspace` → create business → create store → set brand kit → publish store works end to end, emits store.published through the outbox, and writes audit rows for every command.
```
