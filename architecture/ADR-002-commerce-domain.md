# DOF Commerce Domain Architecture

**Document:** ADR-002 — Commerce Domain
**Status:** Proposed (v1.0)
**Date:** 2026-07-02
**Relationship to ADR-001:** Amends ADR-001 v1.1 §4. See §0.1 — this is a boundary *re-allocation*, recorded, not a silent contradiction.
**Scope:** The definitive architecture of the Commerce Domain: everything required to transform a Store into a business capable of selling. This document becomes part of the permanent DOF Operating System; every future commerce module conforms to it or amends it explicitly.

---

## 0. Challenges to the Brief (Read First)

### 0.1 This prompt redraws an ADR-001 boundary — the redraw is correct, and here is the honest reconciliation

ADR-001 placed Products, Variants, Listings, Collections, Offers, and declared Inventory in the **Merchant Domain's Catalog subdomain**, and defined "Commerce Domain" as the *transactional* domain (cart, checkout, orders, payments, payouts, escrow). PROMPT 006 allocates the catalog to Commerce and lists Orders, Payments, and Shipping as separate **future** domains.

I endorse the redraw, for a reason better than "the prompt says so": **ADR-001's "Commerce Domain" was too big to be one bounded context.** "Everything about selling" and "everything about transacting" have different consistency needs, different change velocities, different compliance surfaces (PCI/money-transmission lives entirely on the transactional side), and different scaling shapes (catalog is write-light/read-heavy; orders are write-heavy/append-mostly). The correct decomposition is:

- **Commerce Domain (this document):** the *selling side* — what is for sale, at what price, where, and whether it can be had. Catalog, pricing, listings, inventory availability, collections, offers.
- **Orders Domain (future):** the *transaction* — cart, checkout, order lifecycle, fulfillment workflow.
- **Payments Domain (future):** the *money* — charges, escrow, payouts (trust-gated per ADR-001 §0.2), refunds, compliance.
- **Shipping Domain (future):** rates, labels, tracking execution.

**Formal amendments to ADR-001 §4:** (1) the Catalog subdomain moves from Merchant to Commerce — Merchant retains Business, MerchantAccount, Store, Staff, Trust, BrandKit, Capability Registry, exactly as frozen in Module 1; (2) ADR-001's monolithic "Commerce Domain" is decomposed into Commerce / Orders / Payments / Shipping. Nothing in shipped Module 1 code changes: the kernel never implemented catalog (D-03 anticipated exactly this seam), and ADR-001's `merchant/catalog` was already extraction seam #1 — this ADR extracts it *before birth*, which is the cheapest possible time. **Roadmap impact:** Module 2 is built as `domains/commerce/`, a sibling bounded context to `domains/merchant/`, not a merchant subdomain (§17).

What Commerce must never do: reach into Merchant tables, decide trust/standing/capabilities (it *asks* via the gate and the published query API), or own the customer-facing money path. Merchant remains the kernel; Commerce is the first full domain built on top of it.

### 0.2 THE BIG QUESTION — Commerce owns Listings; Discovery owns *finding* them

The temptation to give Listings to Discovery comes from a UI intuition: listings are "what shoppers browse." But architecture follows *invariants*, not screens:

- A Listing is a **commercial commitment**: "this variant is offered for sale on this channel at this effective price, visible to whom, available in what quantity." Every one of those facts must be **transactionally consistent** with Product state, Offer state, and Inventory — all Commerce aggregates. Split the Listing into another domain and every price change becomes a distributed transaction; that way lies the bug class where the storefront sells at a price the merchant already changed.
- Discovery's job is **ranking, indexing, personalization, and feeds** — read-side concerns with different data shapes (denormalized, per-shopper, eventually consistent) and different SLAs. Discovery should be *brilliant* at finding things and own **zero** facts about sellability.
- The test: *who can make the statement false?* If a merchant edit, an offer expiry, or a stock-out can invalidate it, it is Commerce's fact. If a trend shift or a shopper preference can change it, it is Discovery's.

**Verdict:** Commerce owns the Listing as system of record and publishes `listing.published/updated/unpublished` (the M-6-validated envelope). Discovery consumes, builds its own read models, and never writes back. Same relationship Search already has with Merchant events — proven pattern, extended.

### 0.3 The prompt's product lifecycle conflates three different state machines — separating them is the superior design

`Idea → Draft → Ready → Published → Hidden → Archived → Deleted` mixes (a) merchant intent about the *product*, (b) computed *readiness*, and (c) per-channel *publication*. Module 1 already proved the value of separating intent from orthogonal concerns (store status ⊥ enforcement hold). Commerce applies the same discipline (§5, §6): **Product status** is small (`draft / active / archived / deleted`); **Ready** is a *specification* (computed, explainable — never a stored state that can drift); **Published/Hidden** are *Listing* states, per channel — hiding a product in one store while selling it in another must not require lying about the product itself; **Idea** is not a product state at all — it is an AI draft artifact (Ignite's `product_draft`, §14) that becomes a Product only at human approval. This yields the exact merchant experiences the brief asks for without a nine-state monster no one can reason about.

### 0.4 "Store" is today's channel, not the only channel — introduce Channel now, cheaply

The brief asks whether Listings can serve future marketplaces. Answer: yes, if and only if the Listing targets a **Channel** rather than a Store. Day one there is exactly one channel type (`store`) and the concepts are 1:1 — invisible to merchants, one column wide in cost. In 2028, `marketplace`, `social_shop`, and `pos` become channel types instead of rewrites. This is ADR-001's Listing seam (D5) taken to its conclusion.

---

## 1. Domain Mission

**The Commerce Domain exists to turn a Store into a selling machine: it is the system of record for what is for sale, at what price, where, and whether it can be had — and it makes managing all of that feel effortless.**

### Responsible for
- The Catalog: Products and Variants, business-level (ADR-001 D9), with attributes, media references, and category references.
- Pricing: the Money model, base and sale prices, scheduled pricing, price history, effective-price resolution.
- Listings: publication of variants to Channels, per-channel overrides, visibility, and the publication lifecycle.
- Inventory: declared stock, availability math, tracking modes (tracked / untracked / digital / service), reservation *ledger* (Orders will command reservations against it).
- Merchandising: Collections (manual and smart) and Offers (the substrate Deals and Coupons build on).
- The merchant-facing commerce workspace surfaces (Catalog, Offers areas of ADR-001 §11 IA).
- The published language of selling: every commerce event other domains consume.

### Explicitly NOT responsible for
- Merchants, stores, staff, trust, capabilities — **Merchant** (frozen kernel; Commerce is a consumer of its gate and events).
- Identity/auth — **Identity**. Orders/cart/checkout — **Orders (future)**. Money — **Payments (future)**. Fulfillment execution — **Shipping (future)**.
- Media bytes — **Media** (§10: MediaRef only, already law). Reviews, Sparks — **Community**. Ranking/feeds/search — **Discovery/Search** (§0.2). Message delivery — **Notification**. Cross-merchant analytics — **Analytics**. Enforcement decisions — **Administration** (Commerce *executes* holds it is commanded to apply, mirroring Module 1's enforcement-hold pattern at the listing level).

### Vision (10 years)
2026–27: a grandmother lists her first product from one photo and sells it the same week. 2028–30: multi-channel selling (marketplace, social shops) as channel plug-ins; offers become a merchandising intelligence layer (AI-suggested, human-approved). 2030–36: the catalog is a portable commercial asset — syndicated to external channels, wholesale-shared between businesses (ADR-001's business graph), with a decade of price/inventory history the merchant owns. Constraint unchanged: **nothing shipped in year one may require a rewrite to reach year ten.**

### Success metrics
Time to First Product (inside Ignite, target ~3 min) · products-per-active-store distribution (5+ is the retention cliff per ADR-001 §11) · Time to First Deal (< 14 days, Bible metric) · listing publish success rate (>99.9%, publish must never mysteriously fail) · AI draft acceptance rate for commerce fields (>70%) · effective-price correctness (**zero** tolerance: storefront price must equal charged price — the trust metric) · catalog operation p95 latency budgets. Guardrails: oversell rate per 10k orders, dead-lettered commerce events (≈0), price-history gaps (0).

---

## 2. Ubiquitous Language

| Term | Definition | Challenge notes |
|---|---|---|
| **Product** | A merchant-authored sellable concept owning its Variants. Business-level, not store-level. | |
| **Variant** | A concrete purchasable configuration of a Product (option values, SKU, price, physical facts). The *unit of sale*. Every Product has ≥1, even if implicit. | The thing Orders will actually reference. |
| **Option** | A configurable axis (Color, Size, Material) with declared values; Variants are points in the option space. | Modeled explicitly so option integrity is enforceable. |
| **SKU** | Merchant-facing stock identifier, unique per Business. Optional (Grandma has no SKUs; the system generates one silently). | |
| **Listing** | The publication of a Product to a **Channel**: per-channel overrides, visibility, publication status. One per (product, channel). | The commercial commitment (§0.2). |
| **Channel** | A place where listings are sold. Day one: exactly the Store (1:1, invisible). Future: marketplace, social shop, POS. | §0.4. |
| **Visibility** | Who can see a published listing: `public / unlisted / hidden`. Orthogonal to publication status. | "Hidden" is visibility, not a product state (§0.3). |
| **Availability** | Computed sellability of a variant on a channel: listing published ∧ visibility permits ∧ inventory permits ∧ no hold. Never stored, always derivable. | |
| **Inventory Record** | Stock facts for one (Variant, Location): on-hand, reserved, tracking mode, backorder policy. | Separate aggregate (§7). |
| **Location** | Where inventory lives. Day one: one implicit default location per business (ADR-001 §5.8-4). | |
| **Reservation** | A time-boxed claim on inventory, commanded by Orders, recorded in Commerce's ledger. | Commerce owns the ledger; Orders owns the intent. |
| **Money** | Amount in integer minor units + ISO-4217 currency. Already law (kernel `Price` VO, A3). Never floats — constitutional. | |
| **Price** | Money assigned to a Variant with a role: `base` or `sale`, optionally scheduled. | |
| **Effective Price** | The price a shopper pays *now* on a channel: resolution of base → active sale → applicable offers. Computed by one service, used by everyone (§8). | The zero-tolerance correctness surface. |
| **Collection** | A curated (manual) or rule-based (smart) grouping of listings within a channel. | |
| **Offer** | A price-affecting construct with targeting, value strategy, schedule, and limits. **Deal** (time-boxed, socially amplified — the namesake) and **Coupon** (code-gated) are offer types. | Substrate first, features second (Platform Over Features). |
| **Attribute** | Extensible key-value product metadata (platform-defined + custom). | |
| **Category Reference** | A node in the platform taxonomy (governance = ADR-001 O1, still open, owned with Search). Commerce stores the *reference* only. | |
| **Brand (product attribute)** | The manufacturer/maker label on a product. NOT the Bible's Brand persona, NOT BrandKit. A plain attribute, deliberately lower-case in importance. | Third "brand" meaning on the platform — contained as an attribute to prevent language corruption. |
| **Publication** | The act and record of making a listing live on a channel. | |
| **Fulfillment Kind** | `physical / digital / service` on the Product (kernel column since Module 1). Digital and service products are day-one *citizens*, with their capabilities arriving as modules. | |
| **Bundle / Subscription / Membership Pricing / Drop** | Future commerce objects, reserved now: Bundle = composite product (future Product kind); Subscription = recurring purchase agreement (owned jointly with Orders/Payments later); Membership pricing = offer strategy; Drop = scheduled hype release (offer type, ADR-001 §3). | Named so the language is ready before the features. |

---

## 3. Bounded Context Map

```
                       ┌───────────────┐   commands (gate) + query API
                       │   MERCHANT    │◄──────────────┐
                       │  (frozen M1)  │───events──────►│
                       └───────────────┘                │
                                                 ┌──────┴──────┐    events    ┌────────────┐
 Identity ──(via Merchant session/gate)─────────►│  COMMERCE   │─────────────►│ Discovery/ │
                                                 │ (this ADR)  │              │  Search    │
 Media ◄──MediaRef only──────────────────────────│             │─────────────►│ Community  │
                                                 └──────┬──────┘              │ Analytics  │
                                                        │ inventory commands  │ Notification│
                                                        ▼ + availability API  └────────────┘
                                                 Orders / Payments / Shipping (future)
```

- **Merchant → Commerce (Partnership, inbound):** Commerce commands pass the Merchant kernel's triple gate (RBAC → Entitlement → Trust/Standing) — the same `command-gate` from Module 1's shared kernel, consumed as a library plus the sync query API for business/store state. Commerce consumes `store.published/paused/closed`, `business.standing_changed` (StandingConsequencePolicy extends to freeze offers and unpublish-hold listings — ADR-001 §5.4, now with a commerce limb), `business.trust_level_raised`. Commerce **never** writes Merchant tables; the D-03 `ListingReadinessPort` is finally implemented here and handed to Merchant's PublishableStoreSpec.
- **Commerce → Discovery/Search/Community/Notification/Analytics (Published Language):** events only, payload-schema-validated per the M-6 pattern. `offer.activated` with `social_amplify` is Community's deal-moment hook; `listing.published` is Discovery's unit of indexing.
- **Commerce ↔ Orders (future, Partnership):** Orders reads availability + effective price via Commerce's sync API at cart/checkout time (the one place staleness is intolerable), commands `ReserveInventory / ReleaseReservation / CommitReservation`, and consumes price/listing events for cart revalidation. Contract designed now, implemented when Orders lands.
- **Commerce ↔ AI (Open Host Service):** Commerce defines commerce AI jobs (§14); the AI domain executes; drafts come back with `AIProvenance`.
- **Commerce ↔ Administration (Conformist, inbound):** listing-level enforcement holds (counterfeit/prohibited-item takedowns) are commanded by Administration and executed without negotiation — status ⊥ enforcement, third application of the Module 1 pattern.
- **Anti-corruption rule (unchanged law):** no cross-domain table access, no cross-domain imports except `shared/` and the merchant shared-kernel *contracts* (ids, Money, gate, actor). The boundary-check CI rule gains `commerce` as a top-level domain with the same seam enforcement.

---

## 4. Domain Model

Aggregate boundaries drawn by consistency + contention, not ER intuition.

### 4.1 Aggregates

**`Product`** (root) — *Catalog subdomain*
Identity: `product_id`, owned by `business_id`.
Holds: title, rich description, `FulfillmentKind`, `CategoryRef`, attributes (incl. product-brand), `MediaRef[]`, **Options** (VO list defining the variant space), **Variants** (entities, §6), status (`draft/active/archived` + `deleted_at` tombstone), `AIProvenance`.
Invariants: ≥1 variant; variant option-values must be points in the declared option space, no duplicates; SKU uniqueness per business (DB-backed like Module 1's owner index); archived products cannot gain variants.
Why: the unit a merchant *thinks* in; options+variants inside because option integrity is a single-transaction concern.

**`Listing`** (root) — *Publishing subdomain*
Identity: `listing_id`; unique per (product, channel).
Holds: `channel_id` (day one = store), publication status (`draft/published/unpublished`), `Visibility`, per-channel overrides (title/description/price-override as VO), per-channel SEO metadata, `enforcement_hold` (none/under_review/removed — Administration-writable only), position/featured flags.
Invariants: cannot publish when product is not `active`, when the channel's store is not publishable-compatible, or under enforcement hold (hold beats readiness, the Module 1 423-beats-409 rule, applied again).
Why a separate aggregate from Product: different owner-context (channel vs business), different write cadence, and the multi-channel future — exactly why ADR-001 D5 created it.

**`InventoryRecord`** (root) — *Inventory subdomain* — one per (variant, location). §7.

**`Collection`** (root) — *Merchandising* — manual member list or smart `ListingSpecification`; per channel; evaluated asynchronously (worker maintains membership; reads never evaluate rules). AI collections (§14) are drafts of either kind.

**`Offer`** (root) — *Merchandising* — strategy-typed (§12): targeting specification, value strategy VO, `Schedule`, usage limits, stacking policy, status machine (`draft/scheduled/active/expired/cancelled`), `social_amplify`. Coupon code uniqueness per business (DB constraint).

**`PriceSchedule`** (root) — *Pricing* — scheduled price changes (sale windows, future flash sales) per variant; a worker applies transitions and emits `variant.price_changed`. Separate from Product so scheduled repricing at scale never contends with merchants editing descriptions. §8.

### 4.2 Value objects
`Money` (kernel, reused — one Money on the platform, forever) · `PriceRole` (base/sale) · `Option` + `OptionValue` · `Visibility` · `Schedule` (kernel pattern, tz-aware) · `ChannelRef` (typed: store today) · `CategoryRef` · `MediaRef` (kernel) · `AIProvenance` (kernel) · `ListingOverrides` · `OfferValue` (percent | amount | buy-x-get-y strategy data) · `StackingPolicy` · `TrackingMode` (tracked/untracked/digital/service) · `BackorderPolicy`.

### 4.3 Domain services
**`EffectivePriceService`** — THE resolver: variant base → active sale/schedule → applicable offers → effective price, with explanation trace (merchant sees *why* a price is what it is; Orders re-verifies at checkout with the same service — one implementation, zero drift). · **`AvailabilityService`** — the availability conjunction (§2), used by storefront read models and Orders. · **`SmartCollectionEvaluator`** (kernel-named, lives here now) · **`OfferSchedulerService`** — activates/expires offers and price schedules (worker, emits events) · **`CatalogImportService`** (future extension point: CSV/migration imports as first-class, resumable jobs) · **`DuplicateDetectionService`** (AI-assisted, §14 — advisory only).

### 4.4 Repositories, factories, specifications, policies
One repository per root (kernel discipline). Factories: `ProductFactory.fromDraft` (AI/Ignite draft → Product, stamping provenance, generating silent SKUs); `ListingFactory.forChannel` (encodes the 1:1 store-channel default so multi-channel later is a factory change, not a caller change). Specifications: **`ProductReadinessSpec`** (the "Ready" of §0.3 — explainable missing-items list, same shape as Module 1's PublishableStoreSpec); `ListingSpecification` (the one rule language for smart collections + offer targeting, per ADR-001); `SellableSpec` (availability conjunction as a testable spec). Policies (event-reactive): `StandingConsequencePolicy` — commerce limb (suspend ⇒ freeze offers, hold listings); `OfferExpiryPolicy`; `LowStockPolicy` (threshold ⇒ event ⇒ Notification + Pulse opportunity); `ScheduledPricePolicy`.

### 4.5 Commands and queries
Commands (all through the Merchant kernel's triple gate, all audited, all idempotency-keyed — Module 1 machinery reused wholesale): `CreateProduct`, `UpdateProduct`, `AddVariant`, `ChangePrice`, `SchedulePrice`, `DeclareInventory`, `AdjustInventory`, `PublishListing`, `UnpublishListing`, `SetVisibility`, `CreateCollection`, `UpdateCollectionSpec`, `CreateOffer`, `ScheduleOffer`, `CancelOffer`, `ArchiveProduct`, `ReserveInventory` (Orders-only principal, future). Sensitive (step-up, kernel L-6 plumbing): bulk price changes beyond thresholds, bulk deletes — the anomaly signatures from ADR-001 §15.
Queries from read models: `CatalogGrid`, `ProductEditorView`, `ListingPreview`, `EffectivePriceQuote` (sync, for Orders), `AvailabilityQuote` (sync), `CollectionMembers`, `OfferPerformance` (Analytics-fed).

### 4.6 Lifecycle states — the three machines (§0.3)
**Product:** `draft → active ⇄ archived → (deleted tombstone, retention-gated)`. **Listing:** `draft → published ⇄ unpublished` ⊥ `visibility(public/unlisted/hidden)` ⊥ `enforcement_hold`. **Offer:** `draft → scheduled → active → expired | cancelled`. Readiness is computed, never stored.

### 4.7 Future extension points (named now)
Channel types beyond store (§0.4) · Bundle as composite Product kind · Subscription selling agreement (joint with Orders) · price sets for multi-currency (§8) · Locations beyond the default (§7) · wholesale catalog-sharing edges (ADR-001 business graph) · external-channel syndication adapters · offer strategies: bundles, loyalty, membership pricing, Drops.

---

## 5. Product Lifecycle (merchant experience of §4.6)

**Idea** → an AI draft artifact (Ignite step 3 or "add by photo"), not yet a Product — zero commitment, disposable. → **Draft**: real Product, invisible, safe to be wrong. → **Ready**: `ProductReadinessSpec` passes (title + ≥1 variant + price + media recommended) — shown as an explainable checklist, never a stored flag; the bar stays Ignite-low. → **Published**: a *Listing* on a channel goes live (product becomes `active` implicitly at first publish). → **Hidden**: listing visibility or unpublication — per channel, reversible, product untouched. → **Archived**: product-level retirement; listings auto-unpublish; data intact; reversible. → **Deleted**: tombstone after retention; events retained (audit/finance law from Module 1 applies).
Future workflows this supports without change: approval chains (Enterprise: a `draft → review → active` capability inserts a gate, not a new machine), scheduled publishing (a PriceSchedule-like publisher), channel-specific rollout (publish to store A this week, marketplace B next).

## 6. Variant Strategy

**Variants are entities inside the Product aggregate.** Not VOs: they have durable identity — SKUs, inventory records, listings, and (future) order lines all point at `variant_id`; two variants with identical attributes are still different things. Not aggregates: a variant is meaningless without its product, and the invariants that matter (option-space integrity, no duplicate option combinations, price presence) span the variant *set* — they need single-transaction enforcement at the Product root. The contention argument that would justify promotion (high-frequency variant writes) is defused by extracting the two hot fields *out*: stock lives in `InventoryRecord` (§7), scheduled price mutations in `PriceSchedule` (§8). What remains on the variant changes at human editing speed.
Option axes (Color/Size/Material/…) are declared `Option` VOs on the Product; a variant is a point in that space plus SKU, `Money` price, physical facts (weight/dimensions, for future Shipping), and per-kind data (digital: file MediaRef + delivery hints; service: duration/capacity hints — booking arrives as a future capability against the same variant). Configurable/made-to-order products (2030s) become a new Option kind (`custom` with constraints), not a new model.

## 7. Inventory

**A separate aggregate (`InventoryRecord`), one per (variant, location) — not a field on Product, Variant, or Listing.** Product/Variant is the wrong home for the hottest write in commerce: stock decrements at order velocity would contend with catalog editing and bloat the aggregate's transaction. Listing is the wrong home because stock is a *physical* fact, channel-independent — two listings of the same variant share one pool (overselling across channels is exactly the bug listing-level stock creates).
Holds: `on_hand`, `reserved`, `TrackingMode`, `BackorderPolicy`, low-stock threshold. `available = on_hand − reserved` (+ backorder allowance). Modes: **untracked** (unlimited — Grandma's default; tracking is opt-in per Progressive Complexity), **tracked**, **digital** (infinite by default; future licensing caps), **service** (availability = capacity/schedule — the future booking capability plugs in here). **Reservations:** Orders commands `Reserve/Release/Commit`; Commerce records them in an append-only reservation ledger against the InventoryRecord (time-boxed, auto-expiring) — Commerce owns the *math and the ledger*, Orders owns the *intent and lifecycle*. Future warehouses: `location_id` is real from day one with a single default location; multi-location = rows + a fulfillment-routing policy later, no model change. Every movement is an event (`inventory.adjusted`, with reason codes) — inventory history is free via the event log, and shrinkage auditing becomes a query.

## 8. Pricing

**Money** is the kernel VO: integer minor units + ISO-4217, one implementation platform-wide, floats constitutionally banned (A3). Each variant carries a **base price** (required) and optionally an active **sale price** with a validity window; **PriceSchedule** holds future transitions (sales, flash sales as high-frequency schedules + offer amplification). **Effective price** is resolved by `EffectivePriceService` — base → active sale → applicable offers → result *with explanation trace* — and this single implementation serves the storefront read model, the merchant preview ("customers currently pay X because Deal Y"), and Orders' checkout re-verification. **Price history** is the event log (`variant.price_changed` carries old/new/actor/reason — merchant-visible timeline, Analytics feed, and the ADR-001 fraud signal for bulk-price-to-zero anomalies). **Multi-currency (future):** day one every price is in the store's currency (from Merchant settings); the extension is **price sets** — per-currency explicit prices with an FX-suggested draft, never silent auto-conversion (price is a merchant decision; AI may *suggest*, per §14). **Taxes:** Commerce stores nothing but the merchant's kernel-owned tax *settings* reference; calculation is Payments/Orders territory, keeping Commerce out of tax compliance entirely.

## 9. Listings & Channels

One Product → **many Listings** (one per channel). A Listing belongs to exactly **one** channel — "listings in multiple stores" is modeled as multiple listings sharing a product, preserving per-channel state (price override, visibility, SEO, enforcement) without shared-mutable-state bugs. Day one: every business has stores as its only channels; Listing:Product is effectively 1:1 per store and the UI hides the concept entirely (a merchant "publishes a product"; the factory quietly manages the listing — invisible complexity). Marketplaces later: a marketplace is a channel with its own policy adapter (fees, category mapping, compliance) — listings syndicate by creating channel-specific Listing rows, and takedowns/enforcement are per-channel by construction. The kernel's D-03 debt closes here: Commerce implements `ListingReadinessPort` (real published-listing counts per store), activating the dormant clause in Merchant's PublishableStoreSpec with zero kernel changes — the port pays off exactly as designed.

## 10. Media

**Commerce never owns image bytes — `MediaRef` only** (kernel VO, already law). Commerce stores ordered galleries per product, per-variant image assignments, and (future) per-listing channel overrides. Media domain owns upload, storage, transforms, CDN. AI image enhancement (§14) is an AI-domain job producing a *new* media asset; Commerce swaps the reference on human approval, provenance-stamped. The one Commerce-owned media concern: *gallery composition* (order, roles like "hero", alt text as SEO/accessibility data) — arrangement is merchandising; bytes are not.

## 11. Collections

**Manual** — ordered member list, drag-and-drop merchandising. **Smart** — a stored `ListingSpecification` (the same rule language as offer targeting: one language, three uses — collections, offers, and future storefront sections); a worker maintains materialized membership on catalog events (reads never evaluate rules — Module 1's SmartCollectionEvaluator pattern, now in its true home). **AI Collections (future)** — AI proposes either a curated list ("Your autumn bestsellers") or a *spec* ("everything tagged wool under €50"), delivered as drafts through the standard approval flow; an accepted AI collection is just a collection with provenance. Collections are per-channel (they are merchandising, which is channel-specific), with a future business-level "collection template" if multi-store demands it.

## 12. Offers

One aggregate, **strategy-typed** — the substrate; Deals and Coupons are configurations of it, not siblings (Platform Over Features, and ADR-001 §5.1 upheld):
- **Value strategies:** `percentage`, `fixed_amount`, `buy_x_get_y` day one; `bundle_price`, `loyalty_reward`, `membership_price` as future strategies plugging into the same slot.
- **Targeting:** a `ListingSpecification` (everything / collection / explicit listings / attribute rules).
- **Gating:** none (Deal — plus `social_amplify`, the namesake flag Community feasts on) or code (Coupon, unique per business).
- **Schedule + limits + StackingPolicy:** stacking is a *policy object* decided at effective-price resolution, not ad-hoc booleans — the difference between a pricing system and a pile of if-statements.
Offer lifecycle transitions are worker-driven (`OfferSchedulerService`) and evented; `offer.activated` is one of the platform's highest-fan-out events (Discovery, Community, Notification, Analytics, Pulse).

## 13. Events (published language, M-6-validated payloads, kernel envelope)

| Event | Producer | Key consumers |
|---|---|---|
| `commerce.product.created / updated / archived / deleted` | Product commands | Discovery (index), Analytics, SmartCollectionEvaluator |
| `commerce.variant.added / updated` | Product commands | Discovery, Inventory (record provisioning) |
| `commerce.variant.price_changed` | ChangePrice / ScheduledPricePolicy | Orders (cart revalidation, future), Discovery, Analytics, price-history read model, fraud signals |
| `commerce.listing.published / updated / unpublished` | Listing commands | **Discovery (unit of indexing)**, Merchant CompletionScoring, Community, storefront projections |
| `commerce.listing.enforcement_hold_changed` | Administration command execution | Discovery (delist), Merchant workspace |
| `commerce.inventory.adjusted / low_stock / out_of_stock / restocked` | Inventory commands + policies | Pulse (opportunity: "restock your bestseller"), Notification, Orders (future), Analytics |
| `commerce.reservation.created / released / committed / expired` | Reservation ledger (Orders-commanded, future) | Orders, Analytics |
| `commerce.collection.created / updated / membership_changed` | Collection commands + evaluator | Discovery, storefront projections |
| `commerce.offer.scheduled / activated / expired / cancelled` | Offer commands + scheduler | **Community (deal Spark moment when social_amplify)**, Discovery, Notification, Analytics, Orders (future price enforcement) |
| `commerce.price_schedule.applied` | ScheduledPricePolicy | same as price_changed |

Rules inherited from Module 1: envelope with mandatory actor, per-aggregate `sequence`, transactional outbox with partition-serial claiming (D-15 — partition key remains `business_id`), payload schemas validated at the dispatcher, consumers idempotent via `event_deliveries`, unknown fields tolerated.

## 14. AI Strategy (commerce jobs)

Same constitutional frame as ADR-001 §13: AI is the kernel's `ai_assistant` staff member — **draft grants only for commerce permissions; publishing is structurally impossible** (the permission matrix has no AI full-grant on `catalog.*` publish paths or `offers` execution; this is already enforced and tested in Module 1's gate). Jobs Commerce defines: product drafting from photo/text (the Ignite step-3 engine) · title/description in store voice · category + attribute suggestion · SEO metadata · **pricing suggestion with reasoning and comparables — never an autonomous price change** (hard guardrail, ADR-001 §13.3) · image enhancement (new asset, human swap) · tag/attribute normalization · smart-collection spec proposals · duplicate detection (advisory: "these two products look identical — merge?") · offer suggestions ("weekend deal on your 3 bestsellers, projected +X visits"). Every output: `AIProvenance`-stamped, draft-first, expiring if unapproved, one-tap revert. AI never deletes, never merges, never publishes — at any autonomy setting.

## 15. Information Architecture (merchant workflows)

Extends ADR-001 §11's Workspace; Commerce owns the **Catalog** and **Offers** areas. Governing rule: *the merchant manages products; the system manages listings, channels, SKUs, and effective prices* — invisible complexity until Progressive Complexity reveals it (a second store materializes the per-channel view; enabling tracking materializes inventory).
- **Products:** grid (status, readiness checklist, price, stock-if-tracked) · **"Add product" is camera/photo-first** with AI draft → review → publish-in-one-tap (the Ignite pattern as the *everyday* pattern) · editor is one screen: essentials on top, options/variants appear when the merchant adds a second configuration, attributes/SEO collapsed below · publish button surfaces the readiness checklist inline, never a dead-end error.
- **Collections:** manual = drag-drop; smart = plain-language rule builder backed by `ListingSpecification` ("category is Apparel AND price is under €50"); AI suggestions appear as dismissible drafts.
- **Offers:** type-first ("Deal / Coupon / Promotion"), then targeting → value → schedule in one flow; live preview shows effective prices *with the explanation trace*; Pulse surfaces offer opportunities (empty-state teaching per ADR-001 §11).
- **Inventory:** invisible until tracking is enabled; then per-variant counts with adjust-with-reason; low-stock surfaces in Pulse, not in a buried report.
- **Bulk operations** (Growth tier): multi-select price/status/collection changes — step-up-gated beyond anomaly thresholds (§16).

## 16. Security

All Module 1 machinery reused without forks: commands pass the **triple gate** with the already-seeded capability keys (`catalog.products`, `catalog.collections`, `catalog.inventory`, `offers.deals`, `offers.coupons`, `offers.promotions` — the registry anticipated this domain; keys keep their names, ownership note updated) and the existing permission matrix (`catalog.product.write`, `offers.write`, AI draft-only). **Ownership:** every commerce aggregate carries `business_id`; cross-tenant probes answer 404 (masking rule); listings additionally validate channel-store ownership. **Audit:** every accepted command in-transaction, kernel pattern; price changes and inventory adjustments always carry reason codes into the audit digest. **Sensitive operations** (step-up + anomaly events to Administration): bulk price reduction beyond thresholds, mass deletion/archival, bulk unpublish — the ADR-001 §15 account-takeover signatures, now enforced where they actually happen. **Enforcement:** listing-level holds commanded by Administration (counterfeit/prohibited goods), orthogonal to merchant intent — pattern three of status ⊥ enforcement. **Future enterprise:** approval workflows enter as capabilities gating the `draft → active` transition (§5), not as new security machinery.

## 17. Scalability (100M products, billions of listings, no rewrites)

- **Partitioning:** every table keeps `business_id` as the leading key (the platform shard key, ADR-001 §14); `products`/`variants`/`listings` are hash-partition-ready from day one (kernel D-02 discipline). Listings at billions additionally index by `(channel_id, status)` for the storefront path — the only query family that doesn't lead with business_id, served by projections anyway.
- **Read/write separation:** the storefront never touches aggregates — `rm_store_public` (Module 1's planned projection) grows listing/collection/effective-price data, edge-cached, event-purged. Effective prices are **precomputed into projections on the events that change them** (price_changed, offer activated/expired) so browsing costs zero resolution; checkout re-verifies via the sync API (trust boundary where staleness is intolerable).
- **Hot paths isolated by design:** inventory decrements hit `InventoryRecord` rows only (§7); scheduled repricing hits `PriceSchedule` + a worker (§8); neither touches the Product aggregate. Offer activation fan-out is one event + projection updates, not N listing writes.
- **Workers:** smart-collection evaluation, offer/price scheduling, projection building — all consumers on the Module 1 outbox (partition-serial, idempotent, payload-validated). The broker relay (D12) becomes justified when commerce event volume demands it; contracts already survive the swap.
- **Future marketplaces:** channels multiply listings, not products — the catalog stays the size of reality; syndication adapters are workers, not model changes. **Global expansion:** price sets (§8) + per-region channel policies; no schema surgery.

## 18. Roadmap Impact & Decisions

**Roadmap change (recommended, consequence of §0.1):** Module 2 = **Commerce Kernel** built as `domains/commerce/` — a sibling bounded context, not `domains/merchant/catalog/`. Scope: Product+Variant, Listing (store channel), pricing base, untracked/tracked inventory, `ListingReadinessPort` fulfillment (closes D-03), events + projections. Module 2b: Collections + Offers (Deals/Coupons). Module 3 (Ignite) unchanged — it composes Merchant kernel + Commerce drafting. The boundary-check rule adds `commerce` with subdomain seams (`catalog`, `publishing`, `inventory`, `merchandising`, `pricing`) enforced from the first commit. ADR-001 §4 carries an amendment pointer to this document.

**Decisions:** D2-1 Commerce owns Listings; Discovery consumes (§0.2). D2-2 ADR-001's Commerce is decomposed: Commerce/Orders/Payments/Shipping (§0.1). D2-3 Three lifecycle machines; readiness is computed (§0.3). D2-4 Channel abstraction day one, store-only (§0.4). D2-5 Variants are entities in Product; hot fields extracted (§6). D2-6 Inventory is a separate aggregate per (variant, location); Commerce owns the reservation ledger, Orders the intent (§7). D2-7 One EffectivePriceService for storefront, preview, and checkout (§8). D2-8 Capability keys keep their `catalog.*`/`offers.*` names under Commerce ownership (§16). D2-9 Product-brand is a plain attribute — the platform's third "brand" is deliberately demoted (§2).

**Open questions → future ADRs:** O2-1 taxonomy governance (inherited from ADR-001 O1, now urgent — Commerce needs the taxonomy). O2-2 Reservation contract details (with Orders ADR). O2-3 Price-set/multi-currency design (with Payments ADR). O2-4 Marketplace channel policy framework. O2-5 Bundle composition model.

---

*ADR-002 of the DOF Operating System. Amendments require a superseding ADR naming the section modified. ADR-001 §4 is amended by §0.1 of this document.*
