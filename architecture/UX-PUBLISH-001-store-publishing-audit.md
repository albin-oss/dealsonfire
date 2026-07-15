# UX-PUBLISH-001 — Store Publishing Experience (Vertical Slice 004, Phase 1)

**Status:** Phase 1 deliverable — repository audit, gap analysis, UX, dependency review, recommended scope. **No code.** Awaiting approval.
**Bindings:** ADR-002 (frozen — §0.3 three-machines law, §9 Listings), BLUEPRINT-002 §2.4, CER-001 (CS1 is the approved next node), UX-AUTHOR-001/002, PDS-001 (Calm), the frozen Ignite/Workspace/Authoring experiences.
**The naming law honored:** internally this slice builds Listings; externally the merchant only ever sees **"On your store."** The word "listing" appears nowhere in the UI.

---

## 1. Repository Audit (evidence-based, three states)

| Area | State | Evidence |
|---|---|---|
| **Listings** | ❌ **Missing** (designed, pre-seamed) | No `listings` table/aggregate/events. But the platform *pre-wired the seams*: `catalog.listing.write` permission already in the role maps; `ListingReadinessPort` exists with a dormant `CatalogAbsentListingReadiness` adapter ("Module 2 replaces this adapter — no spec or command change required"); `PublishableStoreSpec` already carries the "≥1 published listing" clause behind `catalogAvailable` |
| **Product visibility** | ⚠️ **Partial — and the critical defect** | The public shelf uses the *documented interim rule* (`listPublicShelf`: non-archived + price > 0). Publication is therefore **implicit and irreversible**: any priced product is public the moment it exists, and the only way off the storefront is archiving |
| **Storefront rendering** | ✅ Implemented | `/s/:handle` SSR + `GET /api/v1/public/stores/:handle` (live-only, hold-masked, redirect-aware, cached `s-maxage=60`) |
| **Publication workflow (store-level)** | ✅ Implemented | store `draft→live` publish command, triple-gated, `store.published` event, enforcement-hold orthogonality — all tested |
| **Publication workflow (product-level)** | ❌ Missing | No command exists; see the mechanical proof below |
| **Public product pages** | ❌ Missing (out of scope) | Shelf tiles only; product detail pages belong to the buyer surface (R1-B5/Discovery) |
| **Store availability** | ✅ Implemented | status ⊥ enforcement_hold; live-only public reads |
| **Search indexing hooks** | ✅ Implemented *as designed* | No indexer (C10 future) — the transactional outbox + `ConsumerRegistry` **is** the hook; a future indexer subscribes to events without producer changes |
| **Domain events** | ⚠️ Partial | 8 `commerce.product/variant.*` events registered + locked; **no listing events** (additive registration required: payload schemas + registry lock, compat-checked) |

**The decisive mechanical fact:** the frozen product status machine allows `draft→active`, `active→archived`, `archived→active` — **`active→draft` is forbidden**. Product status *cannot* implement unpublish even if we wanted to conflate the machines. ADR-002 §0.3's three-machines law isn't just philosophy here; it's enforced by the shipped VO. **The Listing machine is the only correct home for publication**, exactly as CER-001 concluded.

## 2. Gap Analysis (per expected outcome)

| Outcome | Today | Gap |
|---|---|---|
| Review a product | ✅ Composer + grid | — |
| Understand whether it's ready | ⚠️ Composer-time only (`productReadiness` + `DofReadinessSummary`) | Surface the same voice at publish time on the grid |
| Publish it | ⚠️ Implicit (priced ⇒ public) | An explicit, owned act |
| See it immediately in the storefront | ⚠️ Works, but CDN cache allows ≤60s staleness | Merchant's own "see it" link must bypass staleness |
| **Unpublish it** | ❌ **Impossible** (only archive) | The core gap |
| Republish it | ❌ | Listing machine (`published ⇄ unpublished`) |
| Understand current visibility | ❌ Grid shows authoring status (draft/active), which does **not** equal visibility | An honest "On your store / Not on your store" line |

## 3. Store Publishing UX (merchant-facing; no new pages, no new nouns)

- **Composer (frozen; one label change + wiring):** the existing "Put it on the shelf" CTA becomes *true*: create product **and** publish to the store in one flow. The two-field budget is untouched; publication costs zero additional decisions. A quieter "Save without publishing" secondary covers the not-ready case.
- **Product grid rows:** one visibility line + one action, in merchant language: **`● On your store · [Take off my store]`** / **`○ Not on your store · [Publish to my store]`**. Toggle is instant, calm, reversible; no confirmation dialog for unpublish (it's reversible — an undo toast instead, per DS idiom).
- **Readiness reuse:** publishing an unready product from the grid opens no wizard — the existing `DofReadinessSummary` renders inline with the same secured/invited grammar; the publish bar stays the domain's own (title + price).
- **Store-not-live case:** publishing while the store is draft succeeds (the listing waits) with an honest line: "It'll appear the moment your store opens" + the store-publish CTA — the two publish acts compose instead of blocking each other.
- **"See it on your store":** links to `/s/:handle?v={timestamp}` — a cache-key-busting query so the merchant's own verification is always fresh while public traffic keeps the CDN benefit.
- **Workspace tie-in (no new work):** the Opportunity engine's `share-store` step and the storefront shelf both become *listing-truthful* automatically once the shelf reads listings.

## 4. Dependency Review

**All upstreams are built and frozen:** Catalog (products/variants/pricing) ✅ · store channel + store publish ✅ · enforcement hold events ✅ · triple gate + `catalog.listing.write` permission ✅ · outbox/consumer machinery ✅ · `DofReadinessSummary`/composer ✅. **Pre-wired landing points:** the dormant `ListingReadinessPort` adapter and the store-publish spec clause activate with zero spec changes. **No blockers; nothing waits on Inventory/Pricing/Offers** (they're downstream of this node, per CER-001's graph).

## 5. Recommended smallest production-quality increment

**A minimal, honest CS1 Listings core** — the smallest slice that is *not* future debt (every cheaper alternative violates the frozen ADR or the status machine):

1. **Migration `0012_listings`** (BLUEPRINT §2.4 shape, minimum columns): `id, business_id, product_id (in-domain FK), channel_id (the store, 1:1 today), status ('published','unpublished','ended'), published_at, ended_at` + unique `(product_id, channel_id)` + manifest. *Deliberately deferred from the full §2.4:* per-channel overrides, visibility enum (public-only today), collections.
2. **`Listing` model + two commands:** `publishToStore` (creates-or-republishes; auto-creates the listing — the merchant never manages it) and `unpublishFromStore`. Triple-gated (`catalog.listing.write`), audited, one tx each. **Two new events** `commerce.listing.published` / `.unpublished` (payload schemas + registry lock, additive) — the future Search indexer's food.
3. **Auto-end consumer:** `commerce.product.archived` → listing `ended` (idempotent outbox consumer — the second real consumer in the registry).
4. **Retire the interim shelf rule** (delete, not layer): `listPublicShelf` reads published listings joined to products. The documented retirement clause in `product-read-dao.ts` executes exactly as written.
5. **Activate the dormant seam:** replace `CatalogAbsentListingReadiness` with the real count — the store-publish spec's "≥1 published listing" clause switches on, with the compensating UX: Ignite's launch publishes its first product's listing (one line in the launch saga), so the Five-Minute flow still ends in a live store.
6. **UI (§3):** composer wiring + grid visibility line/toggle + readiness-at-publish + cache-busting view link. No new DS components — `DofStatus`, `DofUndoToast`, `DofReadinessSummary` cover it.
7. **Tests:** listing lifecycle unit; publish→event→outbox→audit, unpublish→shelf-removal, archive→auto-end, tenant masking, store-draft compose case (integration); grid toggle + axe (e2e).

**Explicitly excluded (future, per CER-001):** multi-channel, overrides, visibility tiers, collections, product detail pages, price scheduling, search indexer itself.

**PR decomposition (PROMPT-027 law):** **PR-1** backend listing core (migration + model + commands + events + consumer + shelf switch + readiness adapter + integration tests, ~600 lines) → **PR-2** experience (composer/grid/UX + e2e, ~350 lines). PR-1 is independently deployable: it changes shelf semantics only for products *without* listings — and its own migration backfills a published listing for every currently-shelf-visible product, so **no live storefront loses a product during the transition** (the honest cutover).

## 6. The final question, answered

> *What is the smallest production-quality implementation that completes Idea → Business → Store → Product → **Published Product** without future technical debt?*

**The §5 slice — a ~950-line, two-PR minimal Listings core.** Anything smaller (a `visible` boolean on products, or driving `active⇄draft`) either violates the frozen ADR-002 three-machines law, is mechanically forbidden by the shipped status machine, or re-creates the implicit-publication defect that is this slice's reason to exist — all three are precisely the "future technical debt" the question excludes. Anything larger (overrides, visibility tiers, collections) builds future commerce features this prompt forbids. This slice completes the journey, retires a documented interim rule, activates two pre-wired seams, and leaves CS2/CS3/Discovery cleaner landings than they have today.

---
**Phase 1 complete. STOPPING for approval before any code, per the prompt.**
