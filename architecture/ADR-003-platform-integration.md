# DOF Platform Integration Architecture

**Document:** ADR-003 — Platform Integration Layer
**Status:** Proposed (v1.0)
**Date:** 2026-07-03
**Scope:** The constitutional communication rules for every bounded context in DOF — present (Merchant, Commerce) and future (Identity, Media, Discovery, Community, Orders, Payments, Shipping, Notifications, Search, AI, Administration, Analytics, Taxonomy). ADR-001 and ADR-002 are stable foundations and are not modified here; where this document generalizes something Module 1 already implemented, the implementation is cited as precedent, not changed.

**Design stance:** this ADR codifies the machinery Module 1 *proved in production code* — transactional outbox with partition-serial ordering (D-15), boundary payload validation (M-6), consumer idempotency ledger, the triple command gate, RFC 9457 errors, Idempotency-Key semantics — and promotes it from "Merchant kernel convention" to platform law. New domains inherit a working integration layer, not a specification to reimplement.

---

## 1. Communication Principles — the Five Sanctioned Patterns

Every cross-domain interaction uses exactly one of these. Anything else is a boundary violation.

| # | Pattern | What it is | When | Precedent |
|---|---|---|---|---|
| P1 | **Command API** | A write request to the *owning* domain, through its command gate; audited; idempotency-keyed | The only way to change another domain's state | Module 1 endpoints; Administration→Merchant standing commands |
| P2 | **Query API** (sync) | Narrow, versioned, read-only call to the owner | Only when the Staleness Test passes (§2) | D-03 `ListingReadinessPort`; future Orders→Commerce price/availability |
| P3 | **Domain Event** (async) | Immutable fact via transactional outbox, schema-validated envelope | The **default** integration — anything that can tolerate seconds of lag | Module 1 outbox + `StandingConsequencePolicy` |
| P4 | **Projection / Read Model** | Consumer-owned, disposable, event-built local copy | Whenever a consumer reads another domain's data repeatedly or at volume | `rm_store_public` (planned), Search index |
| P5 | **Workflow / Saga** | Multi-step process with per-step compensation, orchestrated by the *initiating* domain | Multi-aggregate or multi-domain processes; never distributed transactions | `BusinessProvisioningService` (Ignite saga) |

Background jobs are not a sixth pattern — they are *how* P3/P4/P5 execute (workers consuming the outbox or schedules). The "future event bus" is not a pattern either: it is a transport swap under P3 — the broker relay replaces in-process dispatch (D12) with zero contract change, which is precisely why P3's contract discipline exists.

**Choosing:** need to change someone else's state → P1. Need an answer *right now* where being wrong is unacceptable → P2 (justify against §2). Everything else → P3, and if you consume it more than occasionally → P4. Multi-step with failure modes → P5.

---

## 2. Synchronous vs Asynchronous — the Staleness Test

A domain may call another domain synchronously **only if all four hold**:

1. **Staleness is intolerable** — an answer seconds old produces a *wrong action*, not just a stale pixel (charging the wrong price; authorizing with a revoked membership).
2. **Low fan-out** — the call happens O(1) per user action, never per-item in a list, never inside an event consumer.
3. **Failure is designed** — the caller defines behavior when the callee is down: *fail closed* for security/money, *degrade* for UX.
4. **The callee published it** — only versioned Query APIs are callable; "it's in their schema" is not an API.

Applying it to the brief's pairs:

| Interaction | Verdict | Reasoning |
|---|---|---|
| Merchant → Commerce | **P2, one call** — `ListingReadinessPort` at store-publish | Publishing with zero listings is a wrong action; O(1); fails closed (can't publish). Everything else Merchant needs from Commerce → events. |
| Commerce → Identity | **Never direct** | Identity context arrives *with the request* (session resolved at the edge, passed via Merchant's gate context). Commerce trusts the gate, not a live Identity call. |
| Orders → Commerce | **P2** — `EffectivePriceQuote` + `AvailabilityQuote` at cart-add and checkout | The zero-tolerance surface (ADR-002 §1): charged price must equal quoted price. Fails closed (cannot checkout). Browse-time prices come from projections (P4), never this API. |
| Discovery → Commerce | **Never sync** — P3→P4 only | Ranking a million listings cannot call anyone. Discovery is constitutionally a projection builder. |
| Community → Commerce | **Never sync** — P3 | A launch Spark or deal moment is triggered *by* events; Community enriches from its own projections. |
| AI → Merchant / AI → Commerce | **P1 as staff** | AI is a `staff_membership` principal (ADR-001 §13); its writes are commands through the same gate as humans — draft-grade grants, no side door. AI *reads* via the job payload it is handed plus published read models. |
| Notifications → everything | **Never queries** — P3→P4 | Notification consumes events and maintains its own recipient/preference projections. A notifier that queries five domains per message is an outage amplifier. |
| Administration → everything | **P1 only** — each domain's admin command surface | Administration decides; owners execute (standing changes, enforcement holds — Module 1/ADR-002 pattern). Admin *reads* via its own projections and each domain's audit exports. Never tables. |
| Search → everything | **Never sync** — pure P3 consumer | Rebuild-from-events is a required capability (ADR-001 §14); a search indexer that queries owners cannot be rebuilt. |

**Corollary (hard rule):** event consumers never make synchronous cross-domain calls. A consumer's inputs are the event payload and its own domain's state/projections. This is what keeps the outbox drainable during a partial outage.

---

## 3. Domain Ownership Matrix — one writer per fact

| Concept | Owner | Notes |
|---|---|---|
| Business, MerchantAccount, Store, Staff Membership | **Merchant** | Frozen kernel |
| Trust levels, Standing, Verification cases (business/KYB) | **Merchant** (Trust subdomain) | Personal KYC *evidence* → Identity; Merchant references outcomes |
| Capabilities (registry), Entitlements, Permissions/RBAC | **Merchant** | The platform's authorization kernel |
| BrandKit, Storefront config, Handles | **Merchant** | |
| Sessions, Users, Credentials, MFA, personal KYC evidence | **Identity** | |
| Product, Variant, Option, SKU | **Commerce** | |
| Listing, Channel, Visibility, Publication | **Commerce** | ADR-002 D2-1 |
| Inventory, Reservation *ledger* | **Commerce** | Reservation *intent/lifecycle* → Orders |
| Price, Price schedule, Effective price resolution | **Commerce** | |
| Offer, **Deal**, **Coupon**, Collection | **Commerce** | Deals/Coupons are offer types, not separate concepts |
| Category / Taxonomy tree | **Taxonomy** | NEW supporting domain — resolves ADR-001 O1 / ADR-002 O2-1 (§11-W2) |
| Media assets (bytes, transforms, CDN) | **Media** | Everyone else holds `MediaRef` only |
| Review, Spark, Comment, Follower graph, Reputation | **Community** | Merchant/Commerce see count/summary projections |
| Order, Cart, Checkout, Fulfillment workflow, Reservation intent | **Orders** (future) | |
| Payment, Charge, Escrow, Payout, **Refund**, **Tax calculation** | **Payments** (future) | Tax *settings* remain Merchant's |
| Shipment, Label, Tracking, Carrier rates | **Shipping** (future) | Shipping *settings/policies* remain Merchant's |
| Notification templates, delivery, preferences | **Notification** | |
| Search index, query serving | **Search** | Disposable by law |
| Home feed, Trending, Recommendations, personalization | **Discovery** | |
| Enforcement decisions, moderation queues, admin tooling | **Administration** | Executes via owners' command APIs |
| Metrics, funnels, cohorts, warehouse | **Analytics** | Facts about facts; never a write source |
| AI jobs, draft artifacts, model/prompt ops | **AI** | Accepted drafts become the *target* domain's data, provenance-stamped |
| Audit log (per domain) | **Each domain writes its own**; Administration aggregates | One pattern (Module 1's), N instances — aggregation is a projection |

**No shared ownership anywhere.** Where two domains "share" a concept (reservations, tax, verification), the split is always *fact vs. intent* or *settings vs. execution*, stated in the table. A concept without an owner in this table cannot be implemented until an ADR assigns one.

---

## 4. Published Language — the Event Contract (v1, frozen by this ADR)

**Envelope** (Module 1's, extended — see §11-W1 for the two added fields):

```
event_id        uuidv7 — identity + idempotency key
event_type      "<domain>.<aggregate>.<past_tense_fact>"   e.g. commerce.listing.published
schema_version  int — payload schema version
occurred_at     timestamptz
partition_key   ordering scope (business_id for tenant-scoped events; owner-defined otherwise — §11-W3)
aggregate       { type, id, sequence }  — sequence = per-aggregate optimistic-concurrency counter
actor           { type: user|ai_agent|admin|system, id, membership_id? }  — mandatory, no anonymous facts
correlation_id  uuid — the request/workflow that started it all (NEW, §11-W1)
causation_id    uuid — the event/command directly causing this one (NEW, §11-W1)
payload         object — schema-validated at the dispatcher boundary (M-6 law)
```

**Rules:**
- **Naming:** past-tense facts only (`published`, not `publish`); domain prefix mandatory; one fact per event — semantically different outcomes are different types (the `store.published` vs `store.resumed` lesson from REVIEW-001 M-2 is now law).
- **Payloads:** snake_case; ids as UUID strings; money as `{amount, currency}` minor units; no floats anywhere; enough denormalized data that common consumers avoid P2 calls, but never full aggregates.
- **Versioning & evolution:** additive changes (new optional fields) do NOT bump `schema_version` — consumers tolerate unknown fields (passthrough validation, M-6). Breaking changes bump the version and require a **dual-publish window** (old + new emitted until consumers migrate, tracked in the schema registry). Fields are never renamed or removed within a version — deprecate, then remove in the next version. Semantic changes are new event *types*, not new versions.
- **Idempotency:** `event_id` + the consumer's `event_deliveries` ledger (insert-or-skip in the consumer's transaction) = at-least-once delivery, exactly-once effect. Proven in Module 1; mandatory for every consumer platform-wide.
- **Tracing:** `correlation_id` enters at the edge (request header or generated), flows command → events → consumer commands → their events via `causation_id` chaining. Audit rows already carry it (Module 1); the envelope catches up (§11-W1). One request is one traceable tree.
- **Schema registry:** every event type's payload schema lives in `contracts/schemas/events/` (the M-6 pattern), validated at the dispatcher; invalid payloads dead-letter immediately. The registry is the compatibility gate: CI fails a producer change that breaks a registered schema.

---

## 5. Query Rules

1. Sync queries go only to **published Query APIs** — versioned, latency-budgeted, with declared failure semantics. In the monolith these are in-process interfaces (ports); the contract is identical so extraction is a transport change.
2. **The Three Questions** (all must be yes, else build a projection): Is staleness intolerable for *correctness*? Is call volume O(1) per user action? Can you define failure behavior?
3. **Volume rule:** anything read at browse/feed/index volume is a projection. No exceptions — this is what makes 100M products and 50M users compatible with sanity.
4. **No query chains:** a Query API implementation may not itself call another domain's Query API. Depth 1, always. (Chains turn one outage into five.)
5. **No queries from consumers** (§2 corollary).
6. **Projections are consumer-owned and disposable:** built only from events, rebuildable via shadow-table + atomic-rename (Module 1's zero-downtime pattern), never written by anything but their builder, never a source of truth. If a projection disagrees with the owner, the projection is wrong, by definition.
7. **Query APIs never expose internals:** DTOs from `contracts/`, not aggregate shapes; existence masking (404) applies across domains exactly as within (Module 1 rule).

---

## 6. Anti-Corruption Layer — external systems

Every external system is wrapped by an ACL **inside the domain that owns the concern**. External models, statuses, and vocabularies stop at the adapter; domain code never sees a Stripe object or a carrier's XML.

| External system | Owning domain | ACL shape |
|---|---|---|
| Stripe / PSPs | Payments | `PaymentProviderPort`; provider webhooks → verified, translated into Payments *commands*; provider ids stored as opaque references; tokenization keeps PAN out of DOF entirely (PCI SAQ-A posture) |
| Shipping carriers | Shipping | `CarrierPort` per carrier; rate/label/tracking normalization |
| Email / SMS / Push | Notification | `ChannelProviderPort`; provider failover behind one interface |
| Google Shopping / Amazon / Meta / TikTok Shop | **Commerce** | External marketplaces are **Channels** (ADR-002 §0.4): a channel policy adapter per marketplace (category mapping, fee model, compliance, feed format); listings syndicate via Listing rows; takedowns arrive as channel events → enforcement holds |
| ERP / POS / Accounting | Platform Integration module (future) | Inbound via a public API + webhook surface (the versioned REST contracts); never direct DB; POS is also a Channel for inventory/sales ingest |
| KYC/KYB vendors | Identity (personal) / Merchant Trust (business) | `VerificationProviderPort` — already specified in ADR-001 §10 |
| AI model providers | AI | `ModelProviderPort`; prompt/model versioning lives in AI domain, never in callers |

**ACL laws:** adapters live in `infrastructure/` of the owning domain (boundary-lint enforced); every inbound webhook is authenticated, idempotency-checked, and translated to an internal command or event *before* touching domain logic; every outbound integration goes through the outbox (retries, ordering, dead-lettering for free); provider swap = new adapter, zero domain change; sandbox adapters exist for every port (test law).

---

## 7. Event Taxonomy (canonical, current + planned)

- **Merchant:** `merchant.onboarded` · `merchant.business.{created, standing_changed, trust_level_raised, ownership_transferred, closed}` · `merchant.store.{created, published, resumed, paused, archived, closed, handle_changed, brand_kit_updated, enforcement_hold_changed}` · `merchant.staff.{invited, joined, role_changed, revoked}` · `merchant.verification.{submitted, approved, rejected}` · `merchant.storefront.published`
- **Commerce:** `commerce.product.{created, updated, archived, deleted}` · `commerce.variant.{added, updated, price_changed}` · `commerce.listing.{published, updated, unpublished, enforcement_hold_changed}` · `commerce.inventory.{adjusted, low_stock, out_of_stock, restocked}` · `commerce.reservation.{created, released, committed, expired}` · `commerce.collection.{created, updated, membership_changed}` · `commerce.offer.{scheduled, activated, expired, cancelled}` · `commerce.price_schedule.applied`
- **Identity:** `identity.user.{registered, deactivated}` · `identity.session.{revoked_all}` · `identity.kyc.{approved, rejected}` (evidence never leaves)
- **Media:** `media.asset.{uploaded, processed, quarantined, deleted}`
- **Community:** `community.spark.{created, trending}` · `community.review.{submitted, published, responded}` · `community.follow.{started, ended}` · `community.reputation.changed`
- **Orders (future):** `orders.cart.{abandoned}` · `orders.order.{placed, confirmed, fulfilled, cancelled, returned}`
- **Payments (future):** `payments.charge.{succeeded, failed}` · `payments.escrow.{held, released}` · `payments.payout.{scheduled, completed, blocked}` · `payments.refund.{issued}`
- **Shipping (future):** `shipping.shipment.{created, label_purchased, in_transit, delivered, exception}`
- **Notification:** `notification.message.{queued, delivered, failed, opted_out}` (delivery facts — for Analytics, never for business logic)
- **Discovery:** `discovery.trend.{detected}` (facts Discovery *produces*, e.g. for Pulse opportunities)
- **Administration:** `admin.enforcement.{applied, lifted}` · `admin.case.{opened, resolved}` (admin *decisions*; execution facts are emitted by the owning domains)
- **Analytics:** consumes everything; emits `analytics.insight.{generated}` for Pulse/AI narration
- **Taxonomy:** `taxonomy.category.{added, renamed, deprecated, merged}` — consumed by Commerce (attribute migration) and Search

Producers are always the owning domain (§3). The highest-fan-out events — `commerce.offer.activated`, `merchant.store.published`, `orders.order.placed` — get load tests as a release gate once Orders exists.

---

## 8. Read Model Strategy

| Read model | Owner (builder) | Sources | Freshness | Notes |
|---|---|---|---|---|
| Merchant Workspace bootstrap | Merchant | own aggregates (D-13) → projection when Pulse lands | strong → seconds | |
| **Pulse** | Merchant | merchant + commerce + orders + analytics + discovery events | seconds–minutes | The cross-domain projection *par excellence*: opportunities, attention items — pure consumer of everyone's facts |
| Commerce Workspace (catalog grid, offer perf) | Commerce | own events (+ Analytics for performance) | seconds | |
| **Storefront / public product pages** | Commerce (`rm_store_public` + `rm_listing_public`) | merchant.store.*, commerce.* | seconds; edge-cached, event-purged | THE hot path (1000:1); precomputed effective prices (ADR-002 §17) |
| Search index | Search | all publishable facts | seconds | Rebuild drill = release requirement |
| Recommendations / Home feed / Trending | Discovery | commerce, community, orders events + behavioral signals | minutes | Fully decoupled; its own storage tech when justified |
| Analytics warehouse | Analytics | everything | minutes–hours | Append-only facts; never queried by OLTP paths |
| Notification recipient/preference views | Notification | identity, merchant, community events | seconds | What lets Notification never query anyone (§2) |
| Admin case/overview boards | Administration | audit exports + enforcement events | seconds | |

Laws: one builder per read model · built only from events · disposable + rebuildable (shadow/rename) · freshness is *declared* per model and surfaced to product decisions ("Pulse may lag a minute" is a product fact, not a bug) · read models never feed writes except as *hints* re-verified by the owner (e.g., cached price → checkout re-quote).

---

## 9. Future Microservice Boundaries

**Default: stay in the modular monolith.** Extraction is justified only by measured pressure, never by aesthetics. Because every module already communicates via P1–P5 with contracts in `contracts/` and its own tables (boundary-lint enforced), extraction is mechanical: move module + tables to a service, swap in-process dispatch for the broker (D12), keep every contract byte-identical.

**Extraction triggers** (any one suffices): sustained resource contention between modules · compliance isolation (PCI, KYC data residency) · organizational ownership (a dedicated team shipping on its own cadence) · divergent technology needs (Search/Discovery storage engines).

**Predicted order & rationale:** 1. **Search/Discovery** (different storage tech + read volume — likely first genuine pressure) · 2. **Payments** (compliance isolation; built from day one as the most contract-pure module so extraction is trivial; PSP tokenization keeps PCI scope minimal even in-monolith) · 3. **Media** (bandwidth/processing profile) · 4. **Commerce Catalog** (data size — ADR-001 seam #1) · 5. **Trust & Verification** (regional data residency) · 6. **Community** (social write volume) · Merchant Core last — it is the kernel, and the gate's in-process latency is a feature.

**Migration strategy:** strangler per module — (1) freeze contracts, (2) dual-run consumers against the broker, (3) move tables with CDC backfill, (4) cut over Query APIs via the port, (5) delete monolith module. Read models make this survivable: consumers never noticed where the events came from.

---

## 10. Engineering Rules (the Platform Ten — challenged and improved)

1. **A domain never reads another domain's tables.** Kept, and enforced by CI lint + separate schema privileges at extraction. *Improved:* it also never reads another domain's *read models* — it consumes events and builds its own (a shared read model is a shared table with better PR).
2. **A domain never modifies another domain's aggregates.** Kept. All writes are P1 commands through the owner's gate — including Administration and AI (no side doors; Module 1 precedent).
3. **All cross-domain writes occur through APIs or events.** *Sharpened:* writes through **command APIs**; events never *command* — they are facts consumers react to under their own policies. "Event-as-command" (emitting `please_do_x`) is a violation.
4. **Events are immutable.** Kept, plus: append-only storage, no compensating *edits* — corrections are new events (`…_corrected`), and the schema registry gate (§4) makes silent payload drift impossible.
5. **Read models are disposable.** *Improved:* disposable AND rebuildable **without downtime** (shadow + atomic rename), and the rebuild is drilled in CI for every registered projection — a read model you've never rebuilt is a read model you can't rebuild.
6. **Only one source of truth exists for each business fact.** *Sharpened to "one writer":* copies may exist everywhere as labeled projections; exactly one domain may *write* the fact (§3). Disagreement resolution is definitional: the owner is right.
7. **Every actor is identified.** No anonymous writes, events, or audit rows — human, AI agent, admin, or named subsystem (Module 1 law, now platform-wide).
8. **Consumers are idempotent and validated.** Every consumer: `event_deliveries` ledger + payload schema check before logic; poison payloads dead-letter immediately (M-6); a failing consumer holds only its partition (D-15).
9. **Failure behavior is part of every contract.** Query APIs declare fail-closed vs degrade; consumers declare retry/dead-letter; sagas declare compensation. "It won't fail" is not a design.
10. **Boundaries are enforced by machines, not memory.** The boundary lint, schema registry checks, and contract tests run in CI from each module's first commit. A rule that isn't executable will be violated politely and repeatedly.

---

## Final Deliverables

### 1. Optimal implementation order (remaining work)

1. **Module 2 — Commerce Kernel** (`domains/commerce/`): Product/Variant, Listing, base pricing, inventory (untracked/tracked), closes D-03. *Plus the two pre-freeze fixes from §11.*
2. **Module 2b — Merchandising:** Collections + Offers (Deals/Coupons) + storefront projections (`rm_store_public` becomes real; public product pages ship here).
3. **Taxonomy (minimal):** flat curated category tree + `taxonomy.category.*` events — small, but Commerce category UX and Search both starve without it.
4. **Media (minimal):** upload → MediaRef → transform pipeline. Blocks Ignite's photo-first flow; do not build Ignite before this.
5. **Module 3 — Ignite** + AI job interface v1 (drafting jobs): the payoff module; consumes Merchant + Commerce + Media + AI.
6. **Identity (real):** session adapter replaces the dev header (D-04 retires); required before anything public.
7. **Notification (minimal):** email adapter + preference basics — Ignite nudges, staff invites, and verification flows already want it.
8. **Community v1 (Sparks core + follows)** — makes `store.published` and `offer.activated` socially real; the Bible's soul.
9. **Search v1** (index + query on commerce/merchant events) → **Discovery v1** (home feed, trending) after it.
10. **Orders** → 11. **Payments** (escrow model realizes Progressive Trust §0.2) → 12. **Shipping.**
13. **Administration v1** (moderation + enforcement surfaces — *must land before public GA*, alongside 8–9).
14. **Analytics** (warehouse + Pulse feeds — starts as event archiving from Module 2 onward; surfaces later).

### 2. Dependency graph

```
                    ┌──────────── Merchant Kernel (M1, DONE) ────────────┐
                    ▼                    ▼                               ▼
              Commerce (M2) ──────► Merchandising (M2b)            Identity (6)
                    │  ▲                  │                              │
                    │  └── Taxonomy (3)   │                              │
                    ▼                     ▼                              ▼
               Media (4) ────────► Ignite + AI jobs (5) ◄────── Notification (7)
                    │                     │
                    ▼                     ▼
              Community (8) ◄──── Search (9a) ──► Discovery (9b)
                    │                     │
                    └────────► Orders (10) ──► Payments (11) ──► Shipping (12)
                                          │
                    Administration (13, parallel from 8) · Analytics (14, trailing from M2)
```

### 3. Next domain to implement

**Module 2 — Commerce Kernel.** Unchanged from ADR-002 §18, now with two small pre-freeze fixes (§11) applied first.

### 4. Interfaces to freeze before more code is written

F1 **Event envelope v1** — *after* adding `correlation_id`/`causation_id` and formalizing `partition_key` (§11-W1/W3); frozen thereafter. F2 **Triple command gate contract** (spec + context shapes) — already stable, now formally frozen. F3 **Merchant Query API v1** (business/store state, entitlement resolution, membership check — currently the in-process shared kernel; freezing the *contract* makes extraction safe). F4 **`ListingReadinessPort`** (D-03) — frozen as-is. F5 **Money / branded-ID / MediaRef / AIProvenance VO contracts.** F6 **Idempotency-Key semantics + RFC 9457 error catalog.** F7 **Capability key namespace** (`catalog.*`, `offers.*`, `store.*`, …). F8 **Payload schema registry layout** (`contracts/schemas/events/`) + dispatcher validation semantics. F9 **`EffectivePriceQuote`/`AvailabilityQuote` contract shape** (defined in Module 2, frozen before Orders starts). Frozen = changes require a superseding ADR.

### 5. Weaknesses discovered across ADR-001/ADR-002 — resolve before Module 2

- **W1 (fix now, cheap):** the shipped envelope has **no `correlation_id`/`causation_id`** — they exist only in audit context. Cross-domain tracing dies without them. Additive columns on `domain_events` + envelope fields, before Commerce becomes the second producer. One migration, small dispatcher change.
- **W2 (resolved by this ADR):** taxonomy had no owner (ADR-001 O1 → ADR-002 O2-1, twice deferred). Now owned by the **Taxonomy domain**; until step 3 ships, `CategoryRef` remains an opaque validated string — Commerce must not invent taxonomy semantics in the interim.
- **W3 (fix now, definitional):** `partition_key` is documented as `business_id` (ADR-001 §14), but Identity/Community/Media events aren't business-scoped. Redefine as **"ordering scope id, owner-chosen"** (Module 1's `business_id ?? aggregate_id` fallback already implements this) — codified in §4, no code change, prevents every future domain from inventing its own answer.
- **W4 (process gap):** ADR-001 mandates rebuild-from-events drills, but no projection registry or CI drill exists. Module 2 ships the first real projections — build the drill *with* them, not after.
- **W5 (spec gap):** the AI **job interface** is referenced by both ADRs but never specified (job envelope, budgets, draft artifact shape, provenance handoff). Needs a mini-ADR before Module 3 — flagged now so it doesn't ambush Ignite.
- **W6 (latent, monitor):** the platform-wide `staff_memberships.roles` CHECK (D-18) and permission matrix are Merchant-owned but referenced by every domain's gate usage; when custom roles arrive (Established tier), the matrix must become registry *data* without weakening the AI hard guardrails — note the tension now, design then.

---

*ADR-003 of the DOF Operating System — the constitutional guide for every future domain. Amendments require a superseding ADR naming the section modified. ADR-001 and ADR-002 are unmodified; W1–W3 are integration-layer refinements scheduled ahead of Module 2, not changes to those domains' architecture.*
