# DOF Merchant Domain Architecture

**Document:** ADR-001 — Merchant Domain
**Status:** Proposed (v1.1)
**Date:** 2026-07-02
**Scope:** The definitive architecture of the Merchant Domain for the DOF Social Commerce Operating System. Every future merchant-facing module must conform to this document or amend it explicitly.
**v1.1 amendment:** Aligned with the *DOF Platform Bible Volume I v1.0* and *DOF Engineering Constitution Volume 1 v1.0*. Changes: onboarding flow renamed **Spark → Ignite** ("Spark(s)" is reserved brand language for the Community conversation domain); visual-identity value object renamed **Brand → BrandKit** ("Brand" is an official persona in the Platform Bible); principle citations corrected to the constitutional name **Five-Minute Store Principle**; §0.1 reconciled with the constitutional principle *Community Before Commerce*; §14 aligned with the Technology Constitution (Nuxt 3, PostgreSQL, Vercel, contract-first REST); *Time to First Deal* added to §16 per the Bible's success metrics.

---

## 0. Challenges to the Platform Vision (Read First)

Before architecting, I am obligated to challenge the assumptions in the brief. Five corrections materially improve the platform; the rest of this document assumes they are accepted.

### 0.1 The four pillars are *integrated*, not *equal* — and the Constitution already says so

The brief describes "four equally important pillars." The Platform Bible more precisely calls them four **integrated** pillars, and the Engineering Constitution adds the ordering principle the brief omitted: **Community Before Commerce** — commerce should strengthen community engagement. This document conforms to that: the strategic sequencing question is already answered at the constitutional level.

What remains an *architectural* obligation for this domain:

> **The Merchant Domain must be complete and trustworthy on its own** (a merchant who ignores every social feature must still run a real business), **while exposing community, content, and AI extension points at every seam** so the other pillars attach without rewrites — and so that commerce events (store launches, deals, drops) are born as community moments, not retrofitted into them.

Integration is achieved in the architecture's extension points; Community Before Commerce is honored by making every significant merchant event a first-class input to the Sparks conversation domain (§5.5, §9 Step 5).

### 0.2 The Five-Minute Store Principle collides with Trust Before Growth — resolve it with Progressive Trust, not a compromise

A business that goes live in five minutes with zero verification is a fraud machine. A business that requires KYC before going live takes days, not minutes. Most platforms pick one and lose. DOF should pick **both**, by decoupling two things that other platforms conflate:

- **Going live** (publishing a store, taking orders, building a following) — instant, five minutes, no verification.
- **Extracting money** (payouts, high volume, ads) — gated behind progressive verification tiers.

Money can flow *in* immediately (held in escrow by the Commerce domain); money flows *out* only as trust is established. This makes the five-minute promise honest and the fraud surface small. The entire verification architecture (§10) is built on this resolution.

### 0.3 The linear merchant ladder is wrong — merchants live on three orthogonal axes

The brief proposes a single ladder (Merchant → Verified → Growing → Established → Enterprise). This conflates three independent dimensions and will corrupt the domain model. A merchant can be enormous and unverified (fraud), tiny and fully verified (a careful hobbyist), or established and suspended (a policy violator). The Merchant Domain models three orthogonal axes:

1. **Trust Level** — what the platform has verified (identity, business, banking).
2. **Scale Tier** — how big the operation is (drives features, limits, pricing).
3. **Standing** — the merchant's current relationship with platform policy.

The "lifecycle" the brief asks for is the *typical path* through this 3-axis space, and is designed as such in §7.

### 0.4 "Operating System" is the right metaphor — take it literally

If DOF is an OS, then the Merchant Domain is not a feature set; it is the **process model**: it defines what a "running business" *is*, its lifecycle, its permissions, and its resource limits. Everything else — deals, coupons, live shopping, marketplaces, whatever exists in 2036 — is an **application** installed into a merchant's business. This yields the single most important structural decision in this document: the Merchant Domain owns a **Capability Registry** (§8) through which all current and future merchant features are provisioned, entitled, and permission-checked. Features never hard-code themselves into the merchant model; they register capabilities. This is how DOF adds a decade of features without rewriting the core.

### 0.5 "Merchant," "Business," and "Store" must be three different things from day one

Most platforms fuse these and pay for it forever (Shopify's account/store split, Etsy's shop/person confusion). DOF separates them at the root of the model:

- A **Merchant** is *a person acting commercially* (an actor, bound to an Identity-domain user).
- A **Business** is *an economic entity* (the thing that gets verified, taxed, and paid).
- A **Store** is *a sales channel* (the thing customers see and follow).

One merchant can eventually run multiple businesses; one business can run multiple stores; one store is owned by exactly one business. On day one every merchant will have exactly one of each — but the model must never assume it, or multi-store, agencies, and enterprise are rewrites instead of features.

---

## 1. Domain Mission

**The Merchant Domain exists to turn intent into a functioning business, and to be the system of record for what a business *is* on DOF.**

### Responsible for

- The existence, identity, and lifecycle of Merchants, Businesses, and Stores.
- The **Five-Minute Store** experience ("Ignite", §9) end to end — the constitutional Five-Minute Store Principle made real.
- Business verification and progressive trust (in cooperation with Identity and Administration).
- The merchant-authored catalog: Products, Variants, Collections, and Listings as *content the merchant creates and owns*.
- Storefront composition: branding, themes, navigation, custom domains.
- Staffing: who may act on behalf of a business, with what permissions (RBAC).
- The Capability Registry: which features each business is entitled to and has enabled.
- Merchant-facing workspace: dashboard, settings, information architecture.
- Merchant-scoped policy enforcement (limits, quotas, standing).

### Explicitly NOT responsible for

- **Money movement** — carts, checkout, orders-as-transactions, payments, payouts, refunds, escrow: Commerce Domain. (The Merchant Domain *views* orders; it never owns them.)
- **Human identity** — authentication, user accounts, sessions, personal KYC evidence: Identity Domain.
- **Social graph** — followers, feeds, comments, shares: Community Domain. (Merchant Domain holds only a follower *count projection* and emits followable entities.)
- **Media bytes** — upload, storage, transformation, CDN: Media Domain. (Merchant Domain holds media *references*.)
- **AI models** — inference, prompting, model ops: AI Domain. (Merchant Domain defines the *jobs* AI performs for merchants and the guardrails; AI Domain executes them.)
- **Search infrastructure** — indexing and query serving: Search Domain (consumes Merchant Domain events).
- **Platform enforcement decisions** — moderation queues, admin tooling, ban adjudication: Administration Domain (which then *commands* the Merchant Domain to change standing).
- **Cross-merchant analytics** — Analytics Domain (Merchant Domain consumes its read models to power merchant dashboards).
- **Message delivery** — Notification Domain.

### Why it exists

Because "who is allowed to sell, what they sell, and how they present it" is the load-bearing wall of a social commerce platform. If this domain is muddled, every other domain inherits the muddle: Commerce doesn't know whom to pay, Community doesn't know whom you follow, Administration doesn't know whom to suspend. It is carved out as one domain because these concepts change together, are consistency-coupled (a store cannot be published by a business that doesn't exist), and share one mission: the Five-Minute Store Principle.

---

## 2. Domain Vision (10 Years)

**2026–2027 — The five-minute store.** Anyone can go from idea to live store in under five minutes. The domain proves that speed and trust can coexist via progressive verification.

**2027–2029 — The business that runs itself a little.** AI staff members (§13) handle descriptions, SEO, pricing suggestions, and customer FAQ drafts. Merchants approve; AI executes. The dashboard becomes opportunity-first: it tells merchants what to do next, not just what happened.

**2029–2032 — The business graph.** Businesses interconnect: wholesale relationships, affiliate/creator partnerships, multi-store franchises, shared catalogs. The Merchant Domain becomes the registry of a *commerce graph*, not a list of isolated shops. Staff marketplaces emerge (hire a verified store manager inside DOF).

**2032–2036 — The economic operating system.** A DOF Business is a portable economic identity: its verification, reputation, sales history, and catalog are assets the merchant owns and can carry across channels (social networks, physical retail, other marketplaces via APIs). Enterprise organizations run hundreds of stores on the same primitives a grandmother used to sell jam — because the primitives were designed for both from day one.

The vision constraint on every design decision below: **nothing we ship in year one may require a rewrite to reach year ten.** Extension points are named explicitly in §6.9.

---

## 3. Ubiquitous Language

This vocabulary is official. Code, documents, UI copy (where user-facing), and conversations use these terms with exactly these meanings. Where the brief's generic term was weak, a better term is mandated and the rejection is explained.

### Core actors and entities

| Term | Definition | Notes / rejected alternatives |
|---|---|---|
| **Merchant** | A user acting in a commercial capacity on DOF. A role-bearing actor, not a separate login. | Never "seller" (transactional, cold) or "vendor" (implies marketplace subordination). |
| **Business** | The economic entity that owns stores, gets verified, and receives payouts. May be an individual (sole proprietor) or an organization. | The Platform Bible's **Brand** persona (an established brand building customer relationships) maps to a Business at Established/Enterprise tier. Visual identity is the **BrandKit** (see below). |
| **Store** | A customer-facing sales channel owned by exactly one Business. What customers browse, follow, and buy from. | Never "shop" — anywhere. The Platform Bible's brand language mandates Store over "Online Shop" in code *and* UI copy. |
| **Storefront** | The rendered, themed, public face of a Store — its pages, navigation, and layout. | Store = the channel entity; Storefront = its presentation. |
| **BrandKit** | The visual and voice identity of a Store: name, logo, palette, typography, tone. A value object of Store, extractable to Business level for multi-store brands later. | Renamed from "Brand" in v1.1: the Platform Bible defines **Brand** as a persona (an established business building customer relationships). In this domain, the Brand persona maps to a `Business` at Established/Enterprise tier; the visual identity object is the BrandKit. |
| **Business Profile** | The public, trust-oriented page of a Business: verification badges, story, policies, all stores. | Distinct from Storefront: profile answers "can I trust them?", storefront answers "what do they sell?" |
| **Staff Member** | A user granted scoped permissions to act on behalf of a Business. | Never "employee" (legal implications) or "collaborator" (vague). |
| **Customer** | A user in the buying role *relative to a specific business*. Owned as a relationship projection, not an entity — the person is Identity's, the transactions are Commerce's, the *relationship* is Merchant's. | |
| **Follower** | A user subscribed to a Store's updates. The graph edge lives in Community; the Merchant Domain sees counts and audiences. | |

### Catalog

| Term | Definition | Notes |
|---|---|---|
| **Product** | A merchant-authored sellable concept ("Handmade lavender soap"). | |
| **Variant** | A concrete purchasable configuration of a Product (size/color/etc.) with its own SKU, price, and stock. Every Product has ≥1 Variant, even if implicit. | Prevents the classic "we added sizes and rewrote the catalog" disaster. |
| **Listing** | The publication of a Product to a specific Store (title/price/visibility overrides per channel). Day one, Product:Listing is 1:1 and invisible to merchants; the seam exists for multi-store and future marketplace syndication. | The single most important future-proofing concept in the catalog. |
| **Collection** | A curated or rule-based grouping of Listings within a Store. | Rule-based ("Smart") collections are a first-class variant, not a bolt-on. |
| **Catalog** | The complete set of Products/Variants owned by a Business. | Business-level, not store-level — enables multi-store without duplication. |
| **Inventory** | Stock quantities per Variant per (future) Location. Merchant Domain owns *declared* stock; Commerce owns *reservations* during checkout. | |
| **Offer** | A price-affecting construct attached to Listings: deal, coupon, promotion. The Merchant Domain defines them; Commerce enforces them at checkout. | "Deal" is a *kind* of Offer (time-boxed, socially amplified). Since deals are DOF's namesake, **Deal** is the flagship Offer type. |
| **Drop** | A scheduled, hype-oriented release of a Product or Deal (creator-economy pattern). Future Offer type; named now so the language is ready. | |

### Trust and lifecycle

| Term | Definition |
|---|---|
| **Trust Level** | What has been verified: `Unverified → Identity-Verified → Business-Verified → Banking-Verified`. |
| **Scale Tier** | Operation size classification: `Starter → Growth → Established → Enterprise`. Drives limits, features, pricing. |
| **Standing** | Policy relationship: `Good → Flagged → Restricted → Suspended → Banned`. Only the Administration Domain may worsen it. |
| **Verification Case** | The workflow instance of a verification attempt: evidence, review, outcome. |
| **Capability** | A named feature a Business is entitled to (`catalog.products`, `offers.deals`, `staff.invite`, …). The unit of the Capability Registry. |
| **Entitlement** | The grant of a Capability to a Business (source: tier, subscription, promotion, or manual). |

### Experience

| Term | Definition |
|---|---|
| **Ignite** | The onboarding conversation that turns intent into a live business (the Five-Minute Store flow). Named because it deserves a name — "onboarding wizard" is beneath the ambition — and *Ignite* fits the Deals On Fire identity. (v1.0 called this "Spark"; renamed because **Spark/Sparks** is reserved brand language for the Community conversation domain.) |
| **Workspace** | The merchant's entire back-office (the brief's "dashboard" area). |
| **Pulse** | The workspace home screen: opportunity-first feed of what matters now. Not "dashboard" — dashboards report the past; Pulse directs the future. |
| **Completion Score** | A store's readiness/quality measure (0–100), used to drive progressive setup after launch. |

### Adopted platform brand language (owned by other domains, used here correctly)

Per the Platform Bible: **Spark(s)** — the community discussion/conversation domain (never used for anything else); **Flick** — short-form video content (Media/Content); **Contributor** — a community member; **Save** — never "bookmark". Merchant Domain documents and UI copy must use these terms with these meanings.

---

## 4. Bounded Context Map

> **Amended by ADR-002 §0.1 (2026-07-02):** the **Catalog subdomain** (Products, Variants, Listings, Collections, Offers, declared Inventory) is re-allocated to the **Commerce Domain** as a sibling bounded context, and this document's monolithic "Commerce Domain" is decomposed into **Commerce** (selling side), **Orders**, **Payments**, and **Shipping** (transaction side, future). Merchant retains Business, MerchantAccount, Store, Staff, Trust & Verification, BrandKit, Storefront, and the Capability Registry. Read the allocations below through that amendment.

The Merchant Domain is one bounded context at the strategic level, internally organized into four subdomains (which are the future service-extraction seams — §11.7):

```
MERCHANT DOMAIN
├── Merchant Core        (merchants, businesses, stores, lifecycle, staffing, capabilities)
├── Catalog              (products, variants, listings, collections, declared inventory)
├── Storefront           (themes, branding, pages, navigation, domains, SEO metadata)
└── Trust & Verification (verification cases, trust levels, standing execution)
```

### Ownership allocation (disputed items decided)

| Concern | Owner | Merchant Domain's relationship |
|---|---|---|
| User accounts, auth, sessions, MFA | **Identity** | Merchant binds to `user_id`; never stores credentials. |
| Personal KYC evidence (ID documents) | **Identity** | Merchant's Verification Case *references* Identity's KYC result; documents never enter this domain. |
| Business KYB evidence | **Merchant (Trust & Verification)** | Business documents are about the Business, not the person. |
| Cart, checkout, order transactions, payments, payouts, escrow, refunds, taxes-at-transaction | **Commerce** | Merchant Domain publishes catalog/offer data Commerce sells against; consumes order events for dashboards; owns tax *settings*, Commerce owns tax *calculation*. |
| Order fulfillment status as merchant workflow (pick/pack/ship UI) | **Commerce** (data) + **Merchant** (workspace surface) | The order list in the Workspace is a Commerce read model rendered in Merchant IA. |
| Shipping *settings* (zones, rates, policies) | **Merchant** | Shipping *execution* (labels, tracking) → Commerce/logistics. |
| Followers, feeds, comments, reviews, DMs | **Community** | Merchant emits `StorePublished` etc. as followable entities; consumes follower-count and review-summary projections. Review *content* is Community's (it's user-generated content requiring moderation); review *response by merchant* is a Community action performed from the Merchant Workspace. |
| Media storage/CDN/transforms | **Media** | Merchant stores `MediaRef` value objects only. |
| AI inference, models, prompt infra | **AI** | Merchant defines AI *jobs* + guardrails (§13); AI Domain executes. |
| Search indexing/serving | **Search** | Pure consumer of Merchant events. Merchant owns *SEO metadata authoring*; Search owns discovery. |
| Merchant analytics dashboards | **Analytics** (computation) + **Merchant** (surface) | Analytics computes; Merchant Workspace displays; Merchant Domain defines which metrics matter (§14). |
| Moderation, admin consoles, enforcement decisions | **Administration** | Administration *commands* standing changes; Merchant Domain executes them and enforces consequences. Merchant never decides its own punishments. |
| Notifications | **Notification** | Merchant emits domain events; Notification decides channel/timing. |
| Subscriptions/billing for platform fees | **Platform Services (Billing)** | Billing grants Entitlements into the Capability Registry; Merchant consumes them. |

### Context relationships (DDD patterns)

- Merchant ↔ Identity: **Customer/Supplier** (Identity supplies; Merchant conforms to Identity's user contract).
- Merchant ↔ Commerce: **Partnership** — the tightest coupling on the platform; governed by a published event contract, versioned jointly.
- Merchant ↔ Community / Search / Analytics / Notification: **Published Language** — Merchant publishes versioned domain events; consumers build their own models. No synchronous calls from these domains into Merchant.
- Merchant ↔ Administration: **Conformist (inbound commands)** — Administration issues standing commands; Merchant executes without negotiation.
- Merchant ↔ AI: **Open Host Service** — Merchant exposes an AI Job interface (§13.2); AI Domain is one implementation.

**Anti-corruption rule:** no domain reaches into Merchant tables or internal models. All integration is events out, commands in, and a small versioned query API for the few synchronous needs (e.g., Commerce validating "is this store live and this business in good standing?" at checkout).

---

## 5. Domain Model

### 5.1 Aggregates and roots

Aggregate boundaries are drawn by *consistency requirements*, not by ER-diagram intuition. Each aggregate is a transactional consistency boundary; cross-aggregate consistency is eventual, via domain events.

**`MerchantAccount`** (root) — *Merchant Core*
The commercial actor. Binds a `user_id` (Identity) to merchant-hood.
- Identity: `merchant_id`
- Holds: display persona, preferences, the list of `BusinessMembership` references (not the memberships themselves).
- Why it exists: without it, "merchant" is just a flag on User, and merchant-specific state (preferences, cross-business view, merchant-level reputation) has no home. It is deliberately thin — a person, even a merchant, is mostly Identity's concern.

**`Business`** (root) — *Merchant Core*
The economic entity. The unit of verification, entitlement, payout binding, and legal reality.
- Identity: `business_id`
- Holds: `BusinessProfile` (VO), `TrustLevel` (VO), `ScaleTier` (VO), `Standing` (VO), `BusinessType` (individual | registered), tax settings (VO), entitlement set, references to owned `store_id`s.
- Invariants: exactly one Owner at all times; Standing transitions only via Administration commands or automated policy with audit; a Business below `Identity-Verified` cannot receive payouts (enforced by Commerce reading Trust Level, but *declared* here).
- Why it exists: §0.5. It is the answer to "whom do we pay, tax, verify, and hold accountable?"

**`Store`** (root) — *Merchant Core + Storefront*
The sales channel.
- Identity: `store_id`, plus a unique `handle` (VO) for URLs and social identity.
- Holds: `BrandKit` (VO), `StoreStatus` (state machine, §7.2), `StorefrontConfig` reference, policies (shipping/returns as VOs), completion score, settings.
- Invariants: belongs to exactly one Business; cannot be `Live` unless Business Standing permits; handle unique platform-wide.
- Why it exists: it is the followable, browsable, social object. Stores are to DOF what channels are to YouTube.

**`StaffMembership`** (root) — *Merchant Core*
A grant of authority: (user, business) → roles + scope.
- Identity: `membership_id`
- Holds: role assignments, optional store-level scoping, status (invited/active/suspended/revoked), invitation metadata.
- Why a separate aggregate (not inside Business): staffing changes are frequent, concurrent, and must not contend with Business's transactional boundary; and a membership has its own lifecycle (invitation → acceptance → revocation) worth modeling.

**`Product`** (root) — *Catalog*
The sellable concept plus its Variants.
- Identity: `product_id`, owned by a Business (business-level catalog, §3).
- Holds: title, description (rich), `MediaRef[]`, category (VO, platform taxonomy), attributes (extensible VO map), `Variant[]` entities (each with SKU VO, `Price` VO, declared stock, option values), `ProductStatus` (draft/active/archived), AI provenance metadata (§13.4).
- Invariants: ≥1 Variant; SKUs unique within Business; price ≥ 0 in a supported currency.
- Why Variants live inside Product: they are meaningless alone and must change consistently with their parent (options integrity). Why Listings do NOT live inside: listings change per-channel at high frequency and belong to a Store context.

**`Listing`** (root) — *Catalog*
Publication of a Product to a Store. Day one it is auto-managed 1:1 with Product and invisible in the UI; the aggregate exists from day one.
- Holds: store_id, product_id, per-channel overrides (title/price/visibility), publication status, SEO metadata for this channel.
- Why: §3 — this seam is what makes multi-store, marketplace syndication, and external channels (2030s) features instead of rewrites.

**`Collection`** (root) — *Catalog*
- Holds: title, `MediaRef`, type (manual | smart), manual member list or `Specification` (rule), sort policy.
- Why smart collections are rules, not queries in code: rules are merchant-authored data, evaluated by a domain service — merchants automate merchandising without engineering.

**`Offer`** (root) — *Catalog*
Price-affecting constructs: Deal, Coupon, Promotion (subtypes by strategy, one aggregate).
- Holds: offer type, targeting specification (which listings), value (percent/amount/BOGO strategy VO), schedule (VO), usage limits, status.
- Invariants: schedule validity; stacking rules per policy; a Deal (DOF's flagship) always has a schedule and a social-amplification flag.
- Why one aggregate with strategies, not three: coupons/deals/promotions share 80% of structure (targeting, value, schedule, limits) and future offer types (Drops, member pricing, bundles) plug in as strategies.

**`VerificationCase`** (root) — *Trust & Verification*
- Holds: business_id, target trust level, evidence references (documents via Media, checks via providers), review trail, outcome.
- Why: verification is a *process* with its own lifecycle, retries, and audit needs; embedding it in Business would bloat the root and lose the history.

**`StorefrontConfig`** (root) — *Storefront*
- Holds: theme reference + customizations, page structure, navigation menus, custom domain binding, published vs. draft versions.
- Why separate from Store: storefront edits are high-frequency and draft/publish-versioned; Store's operational state must not contend with a merchant fiddling with fonts. This split also gives free "preview before publish."

### 5.2 Key value objects

`Handle` (validated, reserved-word-checked, immutable-with-redirect-on-change) · `BrandKit` (name, logo MediaRef, palette, typography, voice) · `Price` (amount + currency, never a float) · `SKU` · `TrustLevel` · `ScaleTier` · `Standing` (state + reason + actor) · `Schedule` (tz-aware window) · `MediaRef` (media_id + variant hints, never a URL) · `CategoryPath` (platform taxonomy node) · `CompletionScore` (computed, cached, explainable — carries its missing-items list) · `AIProvenance` (which fields were AI-generated, model, prompt version, human-approved flag) · `PolicyText` (returns/shipping policy with version history).

Why VOs matter here: `Price` prevents a decade of float bugs; `MediaRef` prevents URL-coupling to Media internals; `AIProvenance` makes §13's guardrails auditable; `Handle` as a VO centralizes the naming rules the Five-Minute flow depends on.

### 5.3 Domain services

- **`BusinessProvisioningService`** — orchestrates Ignite's final act: creates Business + Store + StorefrontConfig + initial Entitlements atomically-enough (saga). Exists because this spans four aggregates and must be one conceptual operation.
- **`HandleService`** — availability, reservation, suggestion (AI-assisted), redirect management on rename.
- **`EntitlementService`** — resolves a Business's effective capabilities from tier + subscription + grants. The runtime face of the Capability Registry.
- **`TrustPolicyService`** — answers "may this business do X at its current trust level/standing?" Single choke point for §0.2's progressive-trust rules.
- **`SmartCollectionEvaluator`** — evaluates collection Specifications against the catalog (async, on catalog events).
- **`CompletionScoringService`** — computes Completion Score with explanations; feeds Pulse's guidance.
- **`OwnershipTransferService`** — the multi-step, dual-confirmation, cooling-off protocol for transferring a Business (§12.3).

### 5.4 Repositories, factories, specifications, policies

- **Repositories**: one per aggregate root, interface in domain, implementation in infrastructure. No repository ever exposes another aggregate's internals.
- **Factories**: `BusinessFactory` (encodes what a valid newborn business is per type), `StoreFactory.fromIgnite(intent)` — builds a complete draft store from an Ignite intent + AI drafts; this factory *is* the five-minute promise in code form.
- **Specifications**: `ListingSpecification` (powers smart collections and offer targeting — one rule language, two uses), `MerchantEligibilitySpec` (can this user become a merchant?), `PublishableStoreSpec` (minimum bar for going Live — deliberately low: name + one listing + policy defaults).
- **Policies** (domain policies, event-reactive): `StandingConsequencePolicy` (Suspended business ⇒ pause all stores, freeze offers), `TierLimitPolicy` (Starter: N products, M stores — limits are configuration, not code), `VerificationNudgePolicy` (approaching payout threshold ⇒ prompt verification *before* it blocks money), `HandleReleasePolicy` (deleted store's handle quarantined 90 days).

### 5.5 Domain events (published language, versioned)

Merchant lifecycle: `MerchantOnboarded`, `MerchantDeactivated`.
Business: `BusinessCreated`, `BusinessProfileUpdated`, `TrustLevelRaised`, `StandingChanged`, `ScaleTierChanged`, `BusinessOwnershipTransferred`, `BusinessClosed`.
Store: `StoreCreated`, `StorePublished` (the celebratory one — the Community domain can seed a launch **Spark** from it, per Community Before Commerce), `StorePaused`, `StoreResumed`, `StoreArchived`, `StoreClosed`, `StoreHandleChanged`, `StorefrontPublished`.
Catalog: `ProductCreated`, `ProductPublished`, `ProductArchived`, `VariantPriceChanged`, `InventoryDeclared`, `ListingPublished`, `ListingUnpublished`, `CollectionCreated`, `OfferScheduled`, `OfferActivated` (Search + Community + Notification all feast on this one), `OfferExpired`.
Staffing: `StaffInvited`, `StaffJoined`, `StaffRoleChanged`, `StaffRevoked`.
Verification: `VerificationSubmitted`, `VerificationApproved`, `VerificationRejected`.

Design rules: events are facts, past-tense, carry ids + minimal denormalized payload + schema version; consumers must tolerate unknown fields; every event carries `actor` (user, staff member, AI job, or admin) for audit.

### 5.6 Commands and queries (CQRS-lite)

Commands mirror the capability map (§8): `CreateStore`, `PublishStore`, `CreateProductFromMedia` (the AI-first path), `ScheduleDeal`, `InviteStaff`, `SubmitVerification`, `TransferOwnership`, `PauseStore`, …
Every command passes three gates in order: **RBAC** (may this actor?) → **Entitlement** (may this business?) → **Trust/Standing** (may they *now*?). This triple gate is the domain's security spine.

Queries are served from read models, never from aggregates: `WorkspaceOverview` (Pulse), `CatalogGrid`, `StorePublicView` (the high-traffic one, aggressively cached, §11.3), `StaffList`, `VerificationStatus`. Read models are projections built from domain events — the same mechanism external domains use, applied internally. CQRS here is a *pattern* (separate models), not separate databases on day one (§11).

### 5.7 Relationships (canonical shape)

```
User (Identity) 1──0..1 MerchantAccount
MerchantAccount 1──*  StaffMembership *──1 Business        (owner is a membership with Owner role)
Business        1──*  Store
Business        1──*  Product 1──1..* Variant
Store           1──*  Listing *──1 Product
Store           1──*  Collection ─(members/spec)→ Listing
Business        1──*  Offer ─(targeting spec)→ Listing
Business        1──*  VerificationCase
Store           1──1  StorefrontConfig
```

### 5.8 Future extension points (named now, built later)

1. **Listing** → multi-store, marketplace syndication, external channels.
2. **Capability Registry** → every future feature installs here (apps platform, 2030s).
3. **Offer strategies** → Drops, bundles, member pricing, live-shopping offers.
4. **Location** (inventory) → multi-warehouse, local pickup, physical retail. Day one there is exactly one implicit Location per business; the field exists.
5. **Business-to-Business edges** → wholesale, franchises, shared catalogs (§2's business graph). No day-one schema; the Business aggregate's identity design (globally unique, transferable, verifiable) makes edges attachable.
6. **StaffMembership.principal** typed as `user | ai_agent | (future) organization` → AI staff (§13) and agency access without model change.
7. **Service businesses**: `Product.fulfillmentKind ∈ {physical, digital, service}` from day one — schema-cheap now, rewrite-expensive later. Bookings/appointments become a future Capability that attaches to `service` products.

---

## 6. Merchant Lifecycle

Per §0.3, the lifecycle is a typical path across three orthogonal axes, not a single ladder.

### The axes

**Trust Level** (raised by Verification Cases, never skipped, never auto-lowered without audit):
`Unverified → Identity-Verified → Business-Verified → Banking-Verified`

**Scale Tier** (raised by usage/subscription; drives limits and features):
`Starter → Growth → Established → Enterprise`

**Standing** (worsened only by Administration or audited automated policy; improved by remediation):
`Good → Flagged → Restricted → Suspended → Banned`

### The typical journey and every transition

**Guest → Registered User** *(Identity Domain)*
Merchant Domain's only involvement: the platform surfaces "start selling" opportunities to guests (Opportunity First). A guest can *begin* Ignite before registering — registration is injected mid-flow at the last responsible moment (§9), because asking for an account before showing value kills conversion.

**Registered User → Merchant** *(trigger: completes Ignite, or explicit "become a merchant")*
Creates `MerchantAccount` + first `Business` (type: individual, Trust: Unverified, Tier: Starter, Standing: Good) + first `Store` (Draft). No separate account, ever — the Constitution's **One Identity** principle: a single identity evolves naturally into merchant-hood. Deliberately requires nothing but intent — no forms, no documents, no payment method. Psychology: the moment someone is *called* a merchant, they start behaving like one (identity-based motivation). Emits `MerchantOnboarded`.

**Merchant → Verified Merchant** *(trigger: `VerificationApproved` for Identity-Verified or above)*
Not required to go live. Required to receive payouts (§0.2). The `VerificationNudgePolicy` invites verification at the moment of maximum motivation: first sale pending payout — "€23.50 is waiting for you; verify to receive it." Verification framed as *unlocking money*, never as bureaucracy. Public effect: verification badge on Business Profile → conversion lift → the badge sells verification for us.

**Verified → Growing** *(trigger: automated tier evaluation — sales velocity, catalog size, followers)*
`ScaleTier: Starter → Growth`. Effects: raised limits, unlocked capabilities (staff invitations, advanced analytics, more offer types). Transition is celebrated (Notification + Community moment), because tier promotion is a retention event: it tells the merchant DOF notices their success.

**Growing → Established Business** *(trigger: sustained volume + Business-Verified trust + subscription where applicable)*
Effects: multi-store capability, full staffing/RBAC, API access, priority support. Note the axes interlock here: Established *requires* Business-Verified — scale without trust is precisely the fraud pattern §0.3 exists to catch.

**Established → Enterprise** *(trigger: sales-assisted, contractual)*
Effects: organization-level constructs (many businesses under one umbrella via future B2B edges), SLAs, dedicated infrastructure quotas, custom capabilities via the Registry. Enterprise is *configuration and contract*, not a fork of the codebase — that is the payoff of the Capability Registry.

**Downward and sideways transitions** (the brief omitted these; real lifecycles are not monotonic):
- Any state + policy violation → Standing worsens (Administration command). Consequences cascade via `StandingConsequencePolicy` (stores paused, offers frozen, payouts held — the latter executed by Commerce on our event).
- Remediation → Standing restored, with history retained forever in audit.
- Dormancy: no activity for N months → automated `Paused` nudge flow, never silent deletion.
- Voluntary exit: `BusinessClosed` — a *deliberate, respectful* offboarding: data export offered, storefront replaced with a farewell page option, handle quarantined, reactivation window (§7.2). Merchants who leave well come back, and they tell others.

---

## 7. Store Lifecycle

### 7.1 States

```
            ┌────────┐
            │ DRAFT  │  (default at creation; visible only to staff)
            └───┬────┘
                │ publish (PublishableStoreSpec passes)
            ┌───▼────┐   pause (merchant intent)      ┌────────┐
            │  LIVE  │◄──────────────────────────────►│ PAUSED │
            └───┬────┘   resume                        └───┬────┘
                │                                          │
                │ archive (merchant)                       │ archive
            ┌───▼──────────────────────────────────────────▼───┐
            │ ARCHIVED  (off-platform, data intact, reversible) │
            └───┬──────────────────────────────────────────────┘
                │ close (deliberate, confirmed)
            ┌───▼────┐   90-day retention   ┌─────────┐
            │ CLOSED │─────────────────────►│ DELETED │ (tombstone; handle quarantined)
            └────────┘   (reopen possible)  └─────────┘
```

### 7.2 Design decisions

- **Merchant intent and platform enforcement are orthogonal flags, not shared states.** A Store has `status` (above) *and* an independent `enforcement_hold` (none | under_review | suspended) set only via Administration. A merchant returning from vacation must not "resume" out of a compliance hold; a compliance hold being lifted must not un-pause a merchant's chosen vacation. Collapsing these into one state machine is a classic modeling bug — rejected explicitly.
- **Paused carries a reason** (`vacation | restocking | personal | other`) and supports a public "back on <date>" note plus a "notify me" hook for Community. A paused store keeps its followers warm; it is a feature, not a limbo.
- **Closed ≠ Deleted.** Closed is reversible for 90 days (grief-proofing: businesses close in emotional moments). Deleted is a tombstone: PII scrubbed per compliance, `store_id` never reused, handle quarantined per `HandleReleasePolicy`, aggregate events retained for audit/finance obligations.
- **Future states reserved:** `Migrating` (ownership/platform transfers), `Seasonal` (auto-scheduled pause/resume windows), `Showcase` (browsable, not transacting — for creators building audience pre-launch; likely the first one we ship).

---

## 8. Merchant Capabilities — the Capability Registry

Every merchant-facing feature, current and future, is a **Capability**: a named, versioned entry in the registry with (a) required trust level, (b) minimum tier, (c) RBAC permission set, (d) optional dependency on other capabilities. Features check entitlement at the command gate (§5.6); they never check tier or trust directly. **This indirection is the "Platform Over Features" principle made executable** — and how DOF ships a decade of features without touching the core.

### Capability map (initial registry; grows forever, never breaks)

**Foundation** (Starter, Unverified): create/manage store · products & variants · collections · media · basic branding & theme · policies · Ignite & AI drafting · basic Pulse.
**Selling** (Starter, Unverified to sell; Identity-Verified to be paid): orders view (Commerce read model) · shipping settings · customer relationships · reviews response · basic Deals & coupons.
**Growing** (Growth tier): full Offer suite & scheduling · advanced analytics surface · SEO tools · followers/audience tools · store AI assistant · abandoned-intent recovery hooks (with Community/Notification).
**Operating** (Growth+, Business-Verified for some): staff invitations & RBAC · invoices & reports · tax settings · inventory across (future) locations · subscriptions to platform plans.
**Scaling** (Established/Enterprise): multiple stores · shared business catalog · API access & webhooks · custom domain(s) at business level · organization structures · marketplace syndication (future) · wholesale/B2B edges (future) · bookings for service products (future).

Deliberately unlimited: the brief said "do not limit yourself" — the honest architectural answer is that the *registry* is the unlimited part. Any capability imaginable (live shopping, print-on-demand, dropship networks, POS hardware) is an entry with gates, not a redesign.

---

## 9. The Five-Minute Store Experience ("Ignite")

The most important section — the constitutional Five-Minute Store Principle, designed. The governing idea: **five minutes is not a speed target; it is a decision budget.** A first-time founder has roughly 7±2 decisions of willpower before anxiety wins. Ignite spends them ruthlessly: every screen either extracts irreplaceable human input or is deleted. Everything else is AI-drafted, defaulted, or deferred.

### What is *irreplaceably human* (the only questions we may ask)

1. What do you want to sell? 2. What should it be called (approve/edit a suggestion)? 3. One photo or description of one thing you'd sell. That's it. Everything else — category, branding, theme, copy, policies, SEO, pricing suggestion — is derivable, draftable, or deferrable.

### The flow (target: ~3½ minutes median, 5 minutes p75)

**Step 0 — The invitation (0:00).** Entry points everywhere Opportunity First suggests them (a user whose deal posts get traction sees "You have an audience — open a store?"). CTA copy is outcome-language: **"Turn this into a business"** — never "Create seller account." *Psychology: people don't want a store; they want to be the kind of person who has one. Sell the identity.*

**Step 1 — The conversation (0:00–0:45).** One question, conversational UI, big type: **"What do you want to sell?"** Free text or voice; chips for the hesitant ("things I make", "things I find", "my services", "digital stuff"). Grandma types "my knitted baby blankets." *Psychology: open with the one question the founder is guaranteed to be able to answer and excited to answer. Competence-first onboarding builds momentum; form-first onboarding builds dread. This also captures the highest-value AI context of the whole flow in the founder's own words.*

**Step 2 — The mirror (0:45–1:30).** AI returns, in seconds, a *draft identity*: three name options (handle availability pre-checked via `HandleService`), a logo mark, palette, and one-line store description — presented as a live storefront preview, not a form. Founder taps one, or edits the name inline. *Psychology: this is the magic moment — the founder sees their idea reflected back as a real thing that already exists. The mirror converts "I'm filling in a form" into "I'm choosing between versions of my business." Choice-of-three beats blank-field (no blank-page paralysis) and beats single-suggestion (preserves agency — AI-First, Human-Controlled).*

**Step 3 — The first thing (1:30–3:00).** "Show me one thing you'd sell." Photo upload (camera-first on mobile) *or* a sentence. AI drafts the complete first product: cleaned-up image (Media domain), title, description in the store's voice, category, and a **suggested price with reasoning** ("similar handmade blankets sell for €25–40 — start at €32?"). Founder approves or nudges the price. *Psychology: one real product transforms the store from concept to fact. Price is the scariest decision for first-timers — anchoring with a reasoned range converts paralysis into a nudge. We ask for ONE product, not "add your products": completing a list of one is guaranteed; open-ended lists are where onboarding goes to die.*

**Step 4 — The claim (3:00–3:45).** *Now* registration, if the founder is a guest — at the moment of maximum sunk value: "Your store is ready. Claim it." One-tap social/passkey signup (Identity). *Psychology: last responsible moment. Before this point registration is a toll; after Step 3 it is protection of something they already own. Loss aversion works for us.*

**Step 5 — Launch (3:45–4:30).** One screen: the finished storefront, one button: **"Open my store."** Tap → `StorePublished` → full-screen celebration → **shareable launch card** (branded image + link) with one-tap share. *Psychology: the launch must feel like an event, not a save action — it is the story the founder tells that night ("I started a business today"). The launch card converts the founder's proudest moment into DOF's acquisition channel. The Community domain turns `StorePublished` into a feed moment and can seed a launch **Spark** — a conversation thread where the community welcomes the new store (Community Before Commerce, executed); the first followers and first congratulations arrive within minutes; the founder is hooked before the dopamine fades.*

**What we deliberately did NOT ask** (each deferred to its moment of natural motivation, orchestrated post-launch by Pulse + Completion Score):
payments/payout details (asked at first sale — §6), shipping details (asked at first physical order; defaults: sensible flat rate by region), taxes (defaults + asked at verification), return policy (beautiful default provided), business type/legal (asked at verification), theme customization (a default that's genuinely beautiful — Beautiful by Default means the default is not a placeholder, it's a designer-grade theme AI-tuned to their palette), more products (Pulse: "stores with 5+ products get 4× more visits — add another?").

**The contract behind the curtain:** every AI draft is marked with `AIProvenance`, every default is surfaced later for review, and nothing irreversible happened — the founder can rename, re-brand, or unpublish everything. Five minutes of speed, zero minutes of lock-in.

**Failure paths designed, not ignored:** AI can't parse the idea → graceful fallback to 3 template questions. Handle collisions → suggestions, never errors. Founder abandons at step 3 → draft persists forever; re-entry lands exactly where they left; a gentle nudge (Notification) after 24h with their own storefront preview as the hook.

---

## 10. Trust & Verification Architecture

**Trust ladder** (each level = a VerificationCase type):

| Level | Evidence | Unlocks |
|---|---|---|
| Unverified | none | sell (funds escrowed by Commerce), build audience, full store features |
| Identity-Verified | personal KYC (executed by Identity domain; result referenced) | payouts up to tier limits, verification badge |
| Business-Verified | KYB: registration docs, tax ID (owned here) | higher limits, "Business" badge, staff at scale, Established tier eligibility |
| Banking-Verified | bank account ownership (Commerce/payments provider; result referenced) | full payout rails, instant-payout eligibility |

Design rules: verification is **asynchronous and never blocks selling** (§0.2); cases are re-triable with human-readable rejection reasons; providers are pluggable adapters (KYC/KYB vendors will change over a decade); evidence documents live in Media with encryption + retention policy; every case decision (human or automated) is audited with actor and rationale. Administration owns the review tooling; this domain owns the state.

---

## 11. Information Architecture (Merchant Workspace)

Governing principle: **Progressive Complexity as adaptive IA.** The workspace renders only entitled capabilities (registry-driven), so Grandma's workspace has five calm items and an Enterprise operator's has twenty — same codebase, same IA skeleton, no "modes."

```
WORKSPACE (per active Store; store-switcher appears only when >1 exists)
│
├── ⚡ Pulse                 # home: opportunity feed, not a metrics dump
│     "3 people favorited your blanket — run a weekend deal?"
│     [Attention needed] → [Opportunities] → [How you're doing]  (in that order)
│
├── 📦 Catalog
│     Products (grid, inline edit, AI-draft-from-photo as primary "add" path)
│     Collections · Inventory (appears when >10 products) · Media library
│
├── 🔥 Offers                # DOF's namesake gets top-level placement
│     Deals · Coupons · Promotions · (future: Drops)
│
├── 🛒 Orders                # Commerce read model in Merchant IA
│     Open → needs action first · Fulfillment · Returns
│
├── 👥 People
│     Customers (relationships) · Followers/Audience · Reviews & responses · Messages (Community surface)
│
├── 📊 Insights              # Analytics domain surface; appears meaningfully after first sales
│
├── 🤖 Assistant             # the AI staff member: chat + task drafts awaiting approval (§13)
│
└── ⚙️ Settings   ── split by mental model, the industry-standard confusion we will not repeat:
      Store settings      (this channel: branding, storefront/theme, domains, SEO, policies, handle)
      Business settings   (the entity: profile, verification, tax, payout status→Commerce, plan & billing, staff & permissions)
      My account          (the person: profile, notifications, security → Identity surfaces)
```

Rules: navigation is capability-gated, order is fixed (spatial memory beats contextual reshuffling), every list ships with beautiful empty states that *teach the opportunity* ("No deals yet — stores running deals get 3× the visits. Start one in 30 seconds."), and nothing in Settings is ever required to start selling (Ignite guaranteed that).

---

## 12. Permissions (RBAC)

### 12.1 Model

Three layers, evaluated at the command gate (§5.6):

1. **Permissions** — atomic, namespaced strings owned by capabilities: `catalog.product.write`, `offers.deal.schedule`, `staff.invite`, `business.transfer`, `finance.payouts.view` …
2. **Roles** — named permission bundles, scoped to Business or to specific Stores. Platform-defined roles ship first; custom roles are an Established-tier capability (the model supports them day one; the UI arrives later).
3. **Memberships** — (principal, business, roles[], store_scope?) — the `StaffMembership` aggregate.

### 12.2 Shipped roles

| Role | Scope | Essence |
|---|---|---|
| **Owner** | Business | Everything, including transfer/close/payout config. Exactly one per business, always. |
| **Manager** | Business or Store | Run the operation: catalog, offers, orders, storefront, view finances. Cannot: staff admin, payout config, close/transfer. |
| **Staff** | Store | Do the work: fulfill orders, edit products, respond to customers. No finances, no settings, no offers by default. |
| **Support Agent** *(platform-side)* | time-boxed | DOF support acting *with merchant consent*: explicit grant, auto-expiring, every action audited and visible to the Owner. Consent-based delegated access — never silent admin impersonation. |
| **Moderator / Administrator** *(platform-side)* | n/a | NOT merchant roles. They live in the Administration domain and act on this domain through its command API (standing changes, enforcement holds), fully audited. Keeping them out of merchant RBAC keeps both models clean. |
| **AI Assistant** | Store, constrained | A real membership for the AI staff member (§13): can draft anything, publish only what its per-merchant policy allows, never touches money, staffing, or destructive operations. |

Future: custom roles, organization-level roles (Enterprise), agency principals (one org managing many businesses — falls out of `StaffMembership.principal` typing, §5.8).

### 12.3 Sensitive-operation protocol

Ownership transfer, business closure, payout changes, handle changes, staff-role elevation: **step-up authentication** (Identity), second-factor confirmation, cooling-off where irreversible (ownership transfer: dual confirmation + 72h window + notification to all admins), and always audit-logged with before/after state.

---

## 13. AI Strategy — "AI is staff, not magic"

### 13.1 The framing that keeps AI safe and useful

AI is modeled as a **staff member with a role** (§12.2), not as an ambient feature. This single decision operationalizes "AI-First, Human-Controlled": AI capabilities are permissions, AI actions are audited memberships' actions, AI autonomy is a per-merchant role configuration (from "draft only, I approve everything" to "publish descriptions freely, ask me about prices"), and revoking AI is revoking a membership.

### 13.2 The AI Job interface (Open Host Service to the AI domain)

The Merchant Domain defines jobs; the AI Domain executes them. Initial jobs: store identity drafting (Ignite), product drafting from media/text, description/voice rewriting, category & attribute suggestion, SEO metadata drafting, price suggestion *with reasoning*, offer suggestion ("weekend deal on X"), image enhancement (via Media), review-response drafting, business insight narration ("your Tuesday visits doubled — here's why we think so"), customer-FAQ drafting.

### 13.3 Hard guardrails (constitutional, non-configurable)

- AI never performs **irreversible** operations: no deletes, no closures, no transfers, no payout config, no staffing changes — at any autonomy setting.
- AI never *changes* a price autonomously; it proposes. (Price errors destroy trust asymmetrically.)
- Every AI-generated field carries `AIProvenance`; merchants can always see what AI wrote and one-tap revert to any prior version.
- AI drafts expire if unapproved; there is no pile of stale robot work.
- All AI actions flow through the same triple command gate as humans (§5.6) — there is no AI side door.

### 13.4 Why this scales for a decade

New AI abilities = new jobs + new permissions in the registry. Model improvements land in the AI Domain without touching Merchant. When 2030-era agents can run whole promotions, that is a *role configuration change*, not an architecture change.

---

## 14. Scalability

Target: 10M+ merchants, hundreds of millions of products, 50M+ users — **without architectural rewrites**. The strategy is a modular monolith with sharp seams, extracting services only when measurements demand it ("Design for Millions, Deliver in Modules").

**Technology Constitution alignment.** The Engineering Constitution fixes the stack: Nuxt 3 + Vue 3 + TypeScript, PostgreSQL, Vercel deployment and storage, contract-first REST APIs. This section conforms: PostgreSQL is the system of record and the day-one host for the outbox and job queue (a Postgres-backed queue such as pg-boss-class tooling — no broker until scale demands one); the versioned query API (§4) and all module APIs are contract-first REST per the constitution; Vercel's serverless model means the modular monolith deploys as Nuxt server routes, with the async workers (§ below) as the one component that runs on a persistent runtime (scheduled/queue-triggered functions day one, dedicated workers at scale). Nothing in the domain layer knows any of this — that is the point.

- **Database.** Every merchant-domain table carries `business_id` as the leading key component — the universal shard key, chosen because merchant workloads are naturally tenant-isolated (a merchant reads their own data; customers read one store at a time). Day one: one Postgres cluster, partitioned logically. Growth path: read replicas → declarative partitioning → shard-by-business (Citus/Vitess-class) — each step invisible to the domain layer because repositories already key by business. No cross-business joins in the domain, ever; cross-business questions belong to Analytics/Search read models.
- **The read path is the scale problem; separate it structurally.** Storefront views (`StorePublicView`) outnumber merchant writes ~1000:1. Public reads are served from denormalized, event-projected read models behind cache — never from aggregate tables. This is the one CQRS separation justified from day one.
- **Caching hierarchy.** CDN/edge for storefront pages and media (long TTL + event-driven purge on `StorefrontPublished`/`ListingPublished`) → Redis for hot projections (store views, entitlement resolutions, handle lookups) → application-level for taxonomy/theme/registry data. Invalidation is event-driven, not TTL-hoping: the domain events already exist (§5.5); caching rides them for free.
- **Events.** Transactional **outbox** pattern from day one (an event MUST NOT be lost between "store published" and "search indexed" — at-least-once with idempotent consumers). Day one transport: the Postgres outbox itself, consumed by workers; a relay to a dedicated broker (Kafka-class) is the growth-stage upgrade and changes nothing for producers or consumers because both already speak the versioned event contract. Ordered per aggregate (partition by `business_id` — the shard key earns its keep again).
- **Queues & background jobs.** All AI jobs, smart-collection evaluation, completion scoring, projections, media-dependent flows are async workers consuming the same event stream/queues. Ignite's AI steps are the only latency-critical async work — they get a dedicated priority queue with p95 budgets, because §9's magic dies at 8 seconds.
- **Search.** Pure event consumer; its own cluster; zero coupling. Merchant Domain guarantees event completeness (rebuild-the-index-from-events is a required capability, exercised in drills).
- **Storage.** Media bytes are Media Domain's problem; `MediaRef` keeps us out of it structurally.
- **Future microservices.** The four subdomains (§4) are the extraction seams, in likely order of need: **Catalog** first (largest data, hottest writes), **Storefront** rendering second (independent scaling of the read path), **Trust & Verification** third (compliance isolation), Merchant Core last (it is the kernel). Extraction is possible *because* subdomains already communicate via events and ids only. Extract only on measured pressure — a premature microservice estate at 10K merchants would be the classic self-inflicted wound.

---

## 15. Security

- **Verification** — §10. Pluggable providers, async, audited, evidence encrypted with retention policies.
- **Ownership** — exactly one Owner invariant; transfer via `OwnershipTransferService` protocol (§12.3); ownership history immutable and queryable (disputes, law enforcement, estate cases — a decade brings all of these).
- **Delegated access** — all third-party action via `StaffMembership` (including Support Agents and AI); no shared credentials pattern anywhere in the design; invitations expire; memberships are revocable instantly with session invalidation (Identity cooperation).
- **Session protection** — Identity owns sessions; Merchant declares *sensitivity levels* per command so Identity can enforce step-up auth (fresh MFA for §12.3 operations), device-change challenges for high-value businesses.
- **Audit log** — append-only, per-business, capturing every command through the gate: actor (human/AI/admin), command, before/after digest, IP/device context. Merchant-visible subset in Settings ("what did my staff/AI do?") — audit as a *feature*, not just forensics. Platform-side full log to Administration/compliance with legal-hold support.
- **Sensitive operations** — the §12.3 protocol; plus rate limits and anomaly flags (mass product deletion, bulk price drops to ~0, handle changes on aged stores — classic account-takeover signatures) feeding Administration's fraud systems.
- **Fraud prevention** — the domain's contribution is *structural*: progressive trust caps blast radius (§0.2); Standing cascades freeze abusive operations quickly; every listing/offer event carries actor + trust context so Administration's ML has clean features; velocity limits (`TierLimitPolicy`) are fraud dampeners disguised as tier limits.
- **Compliance** — PII minimization (this domain stores business data, barely any personal data — by design); GDPR erasure via tombstoning with finance-mandated retention carve-outs; data export as a merchant right (also the honest exit path — Trust Before Growth includes trusting merchants with their own data); KYC/KYB data residency isolated behind the Verification subdomain seam so regional compliance (EU/India/etc.) is a deployment concern, not a model change.

---

## 16. Success Metrics

**North Star: Merchant Activation Rate** — % of started Ignite flows that reach *first sale within 30 days*. It compresses the whole domain's quality — onboarding, catalog tools, storefront quality, discovery handoff — into one number.

| Metric | Definition | Target (Y1) | Guards against |
|---|---|---|---|
| **Time to Live Store** | Ignite start → `StorePublished`, median | < 4 min (p75 < 5) | the Five-Minute promise decaying |
| **Time to First Product** | ...→ first `ProductPublished` | inside Ignite (~3 min) | catalog friction |
| **Time to First Deal** | `StorePublished` → first `OfferActivated` of type Deal | median < 14 days | the platform's namesake going unused (Bible metric) |
| **Time to First Sale** | `StorePublished` → first order | median < 7 days | "live but dead" stores |
| **Ignite completion rate** | started → published | > 60% | onboarding leaks (instrument per step) |
| **Activation** (North Star) | published → sale ≤ 30d | > 25% | vanity signups |
| **Merchant retention** | active (any workspace action or sale) at D30/D90/D365 | 60/40/25% | churn masking growth |
| **Completion Score progression** | avg score at D7 vs D0 | +25 pts | post-launch abandonment of deferred setup |
| **Verification conversion** | first-payout-eligible → Identity-Verified ≤ 7d | > 80% | the §0.2 escrow model failing merchants |
| **AI draft acceptance rate** | AI drafts approved w/o heavy edit | > 70% and rising | AI that annoys instead of helps |
| **Staff adoption** (Growth+) | businesses with ≥1 staff member | trend ↑ | single-founder ceiling |
| **Business growth** | GMV per merchant cohort, MoM | cohort-over-cohort ↑ | platform growing while merchants stagnate |
| **Merchant NPS/CSAT** | quarterly | > 50 | everything the numbers hide |

**Guardrail metrics** (success is invalid if these regress): fraud rate per 1K new businesses, dispute/refund rate, verification false-rejection rate, escrowed-funds age p95, AI-provenance revert rate. A five-minute business machine that mints fraud is a failure regardless of activation numbers — the guardrails encode Trust Before Growth as measurement.

---

## 17. Decisions Log & Open Questions

**Decided in this document** (revisit only with an ADR):
D1 Progressive trust decouples going-live from payouts (§0.2). D2 Three orthogonal merchant axes replace the linear ladder (§0.3). D3 Merchant/Business/Store are distinct aggregates from day one (§0.5). D4 Capability Registry mediates all feature access (§8). D5 Listing exists day one even while invisible (§5.1). D6 AI is modeled as constrained staff (§13). D7 Modular monolith with four named extraction seams (§14). D8 Store status and enforcement holds are orthogonal (§7.2). D9 Catalog is business-level, not store-level (§3).

**Decided in v1.1** (alignment with Platform Bible v1.0 and Engineering Constitution v1.0):
D10 The onboarding flow is named **Ignite**; "Spark(s)" is exclusively the Community conversation domain per official brand language. D11 The visual-identity value object is **BrandKit**; the Bible's **Brand** persona maps to a `Business` at Established/Enterprise tier — flagged because the Bible uses "Brand" as both persona and everyday word; if the Bible later assigns "Brand" a formal entity meaning, this mapping must be revisited. D12 Day-one infrastructure conforms to the Technology Constitution (PostgreSQL as system of record + outbox + queue; Vercel deployment; contract-first REST); brokers and dedicated workers are growth-stage upgrades behind unchanged contracts (§14).

**Open, assigned to future ADRs:**
O1 Platform taxonomy governance (who curates categories at global scale?) — with Search. O2 Multi-currency catalog strategy for global expansion — with Commerce. O3 Theme system extensibility (marketplace of themes? third-party designers?) — Storefront ADR. O4 The exact tier thresholds and limits (product, not architecture — but `TierLimitPolicy` is ready). O5 Service-business booking model (the Capability seam exists; the domain design does not yet).

---

*This document is ADR-001 of the DOF Operating System. Amendments require a superseding ADR that names the section it modifies.*
