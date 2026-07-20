# CER-001 — Commerce Capability Execution Roadmap

**Status:** Authoritative implementation sequence for every remaining Commerce sub-capability.
**Bindings:** Platform Bible, Engineering Constitution, BCA-001, VSA-001, PDS-001, OA-001, **ADR-002 (frozen)**, BLUEPRINT-002, Catalog Capability Contract, Completion Report (D-42), Shared Kernel. Contradicts none.
**Baseline:** Catalog Management is **APPROVED and frozen except bug fixes** (D-42) — the permanent foundation. Everything below builds on it.
**No code is defined here.** Each sub-capability is implemented later under MCEF-001 with its own contract.

---

## 0. The list, challenged (and corrected)

The prompt's list mixes **Commerce** sub-capabilities with **other frozen capabilities**. Per ADR-002's own decomposition (endorsed by BCA-001), Commerce is the *selling side only*; Orders/Payments/Fulfillment are sibling capabilities, and Tax was explicitly evicted from Commerce ("keeping Commerce out of tax compliance entirely" — ADR-002 §8). Corrections:

| Prompt item | Verdict | Why |
|---|---|---|
| Listing Management | ✅ keep — **CS1** | ADR-002 §9; the load-bearing next node (D-42) |
| Inventory Management | ✅ keep — **CS2** | ADR-002 §7; `InventoryRecord` per variant×location |
| Pricing Engine | ✅ keep — **CS3** | `EffectivePriceService` + `PriceSchedule` (ADR-002 §8) — the zero-tolerance correctness surface |
| Offer Management | ✅ keep — **CS4** | ADR-002 §12: the offer *substrate* (targeting, value strategy, schedule, limits) |
| Coupon Management | 🔀 **merged into CS4** | ADR-002 §2 is explicit: *Deal and Coupon are offer types*, not separate capabilities. A separate coupon module would re-create the fragmentation the offer substrate exists to prevent (Platform Over Features). |
| Commerce Policies | 🔀 **dissolved** | Not a sub-capability: policies (specifications, stacking rules, publishability) live *inside* each owning sub-capability + the Shared Kernel. A standalone "policy module" would be a god-module with no aggregate. |
| Order Management | 🚫 **out of Commerce** → C4 Orders | ADR-002 §1 boundary. Sequenced here as the *successor capability*, not a Commerce sub-capability. |
| Tax Foundation | 🚫 out → C5 Payments/Orders | ADR-002 §8 evicted tax from Commerce; Commerce stores only the merchant's kernel tax-settings *reference*. |
| Fulfillment Foundation | 🚫 out → C6 Fulfillment | ADR-002 §1; switches on `FulfillmentKind`, owns none of the catalog. |
| Returns Foundation | 🚫 out → C4 Orders (returns are order lifecycle) + C5 (refunds) | VSA-001 VS10 ownership. |
| *(added)* Collections & Merchandising | ➕ **CS5** | In-Commerce per ADR-002 §11, deferred by D-42 until Listings exist. The prompt omitted it. |

**Result: five Commerce sub-capabilities remain** — CS1 Listings, CS2 Inventory, CS3 Pricing, CS4 Offers (incl. coupons/deals), CS5 Collections — then Commerce is **complete** and the roadmap hands off to C4 Orders → C5 Payments.

---

## 1. CS1 — Listing Management

1. **Name:** Listing Management
2. **Mission:** Publish a product to a channel — the commercial commitment that makes it *buyable there* (per-channel overrides, visibility, publication lifecycle).
3. **Business outcome:** a product becomes purchasable on the store (and later, marketplace) — the "buyable moment" (VSA-001 critical moment).
4. **Strategic outcomes:** O2 first-sale-sooner (primary), O1 launch, O5 shopper habit.
5. **Value streams:** VS2 Launch, VS3 Make-a-Sale (enabling), VS7 Discover (feeds).
6. **Upstream:** Catalog (frozen), Merchant (store/standing/hold), Shared Kernel.
7. **Downstream:** CS2 Inventory (stock per *listed* variant), CS3 Pricing (price a listing in context), CS4 Offers (target listings), CS5 Collections (group listings), C10 Discovery (index), C4 Orders (reserve a listed variant).
8. **Aggregate roots:** `Listing` (one per product×channel; lifecycle `draft → published → unpublished → ended`, distinct machine per ADR-002 §0.3; `ChannelRef` — store 1:1 today, marketplace later, §0.4).
9. **Published events:** `commerce.listing.published`, `.unpublished`, `.overrides_changed`.
10. **Consumed events:** `merchant.store.published` (channel readiness), enforcement-hold events (visibility gate); `commerce.product.archived` (auto-end listings).
11. **DB ownership:** `listings` (BLUEPRINT §2.4) — commerce-owned, `business_id`-led, `(channel_id, status)` secondary index.
12. **Public APIs:** none yet (storefront read is R1-B5/Discovery).
13. **Internal APIs:** publish/unpublish/override commands; listings-by-store query. Contract-first, triple-gated.
14. **Security:** triple gate on mutations; enforcement hold blocks *visibility*, never overwrites status (orthogonality law); tenant masking.
15. **Scalability:** billions of listings (channels multiply listings, not products — ADR-002 §17); hash-partition-ready.
16. **Performance:** publish p95 < 300ms; listing read p95 < 50ms (read-model-bound later).
17. **Test strategy:** aggregate lifecycle unit; publish→event→outbox→audit integration; hold-blocks-visibility; product-archived → listing auto-end consumer; tenant masking.
18. **Readiness criteria:** Catalog frozen ✅; store channel exists ✅; enforcement-hold events available ✅.
19. **DoD:** a merchant publishes/unpublishes a product to their store with per-channel overrides; events flow; the Availability conjunction gains its first real input; all gates green; MCEF-001 phases complete.
20. **Complexity:** **M**

## 2. CS2 — Inventory Management

1. **Name:** Inventory Management · 2. **Mission:** own the truth of *how many can be had* — stock per variant×location, tracking modes, backorder policy, and the reservation **ledger** Orders will command against. · 3. **Outcome:** no oversell, ever; honest availability. · 4. **OA:** O2, O6 purchase confidence (guardrail: oversell = 0), O12 ops efficiency. · 5. **VS:** VS3, VS6 Scale Ops, VS8. · 6. **Upstream:** Catalog (variants), CS1 (what's listed), Operations (locations — built). · 7. **Downstream:** C4 Orders (reservations), Availability completion, C10 (in-stock signals). · 8. **Aggregates:** `InventoryRecord` (per variant×location — separate from Product: the hottest write in commerce must not contend with catalog edits, ADR-002 §7) + `inventory_adjustments` ledger (month-partitioned day one, BLUEPRINT §2.9). · 9. **Publishes:** `commerce.inventory.adjusted`, `.stock_depleted`, `.backorder_started`. · 10. **Consumes:** `commerce.variant.added` (seed records), `operations.location.*`. · 11. **DB:** `inventory_records`, `inventory_adjustments` (ledger, never-delete). · 12–13. **APIs:** internal adjust/set-tracking/policy commands; availability query. Public: none. · 14. **Security:** triple gate; adjustments always ledgered + audited (stock is money-adjacent). · 15. **Scale:** order-velocity decrements; row-level contention isolated to the record; ledger partitioned. · 16. **Perf:** adjustment p95 < 100ms; availability read p95 < 50ms. · 17. **Tests:** concurrent-decrement races (no negative stock), ledger append-only, tracking-mode matrix (tracked/untracked/digital/service), reservation-ledger contract stubs for Orders. · 18. **Readiness:** CS1 done (stock attaches to listed variants' sale context); Operations locations ✅. · 19. **DoD:** availability = listing ∧ visibility ∧ inventory ∧ hold is now fully computable; oversell-race test green. · 20. **Complexity:** **L**

## 3. CS3 — Pricing Engine

1. **Name:** Pricing Engine · 2. **Mission:** one resolver for what a shopper pays *now* — base → sale/schedule → offers — with an explanation trace; the zero-tolerance correctness surface (ADR-002 §8). · 3. **Outcome:** price truth everywhere; merchants understand *why* a price is what it is. · 4. **OA:** O6 (checkout price = displayed price), O9 deal value. · 5. **VS:** VS3, VS8, VS9. · 6. **Upstream:** Catalog (variant base price — built), CS1 (channel context). · 7. **Downstream:** CS4 (offers are resolver inputs), C4 Orders (checkout re-verification uses the SAME service — one implementation, zero drift), storefront read models. · 8. **Aggregates:** `PriceSchedule` (scheduled transitions; a worker applies + emits) — `EffectivePriceService` is a *domain service*, not an aggregate. · 9. **Publishes:** `commerce.variant.price_changed` (already registered), `commerce.price_schedule.applied`. · 10. **Consumes:** offer activation events (CS4, later). · 11. **DB:** `price_schedules` (BLUEPRINT §2.8). · 12–13. **APIs:** internal schedule commands + effective-price query (with trace). Public: none. · 14. **Security:** price writes audited; bulk-price-to-zero anomaly signal (fraud feed) preserved. · 15. **Scale:** scheduled repricing never contends with catalog edits (separate aggregate — by design). · 16. **Perf:** effective-price resolution p95 < 20ms (it sits in every storefront read and checkout). · 17. **Tests:** resolution matrix (base/sale/schedule boundaries at exact instants), trace correctness, schedule-worker idempotency; property tests on Money math. · 18. **Readiness:** CS1 (channel context) done; CS2 not required (price ⊥ stock). · 19. **DoD:** one `EffectivePriceService` consumed by preview + (contractually) future checkout; explanation trace human-readable. · 20. **Complexity:** **M**

## 4. CS4 — Offer Management (Deals & Coupons included)

1. **Name:** Offer Management · 2. **Mission:** the price-affecting substrate — targeting, value strategy (percent/amount/BOGO), schedule, limits, stacking policy — with **Deal** (time-boxed, socially amplified — the namesake) and **Coupon** (code-gated) as offer *types* (ADR-002 §12; merge per §0). · 3. **Outcome:** honest deals that move GMV without manufactured urgency (PDS-001 Calm). · 4. **OA:** O9 (primary), O4, O5. · 5. **VS:** VS9 Save Money (owner), VS4 Grow. · 6. **Upstream:** CS1 (targets), CS3 (resolver). · 7. **Downstream:** C10 (deal surfacing), C11 (deal notices), C4 (offer application at checkout via CS3). · 8. **Aggregates:** `Offer` (type, targeting, `OfferValue`, `StackingPolicy`, schedule, redemption limits). · 9. **Publishes:** `commerce.offer.started`, `.ended`, `.redeemed` (redemption counted at order time). · 10. **Consumes:** schedule ticks (worker), later `order.placed` for redemption accounting. · 11. **DB:** `offers` (BLUEPRINT §2.10). · 12–13. **APIs:** internal offer CRUD + activation; coupon-code validation query. Public: none yet. · 14. **Security:** code-gated coupons hashed/rate-limited against brute force; stacking abuse bounded by policy; audited. · 15. **Scale:** offer evaluation is an input to CS3's hot path — precomputed applicability, not per-request scans. · 16. **Perf:** applicable-offer lookup p95 < 20ms inside the price resolution budget. · 17. **Tests:** stacking matrix, redemption-limit races, schedule boundaries, coupon brute-force rate-limit, honest-math property tests (never below zero, never fake strikethrough). · 18. **Readiness:** CS3 live (offers are resolver inputs — building offers before the resolver would create two price paths, the classic drift bug). · 19. **DoD:** a merchant runs a Deal and a Coupon end-to-end through the single resolver with trace; VS9 funnel instrumented. · 20. **Complexity:** **L**

## 5. CS5 — Collections & Merchandising

1. **Name:** Collections & Merchandising · 2. **Mission:** curated (manual) and rule-based (smart) groupings of listings within a channel (ADR-002 §11) — the merchant's shelf-arranging power. · 3. **Outcome:** shoppable structure; storefront browsability. · 4. **OA:** O5, O4. · 5. **VS:** VS7, VS5. · 6. **Upstream:** CS1 (collections group *listings* — the D-42 sequencing law). · 7. **Downstream:** C10 Discovery, storefront read models, future AI merchandising (proposal-only, ADR-002-A §C). · 8. **Aggregates:** `Collection` (+ `collection_listings` child rows; smart rules evaluated by `SmartCollectionEvaluator` worker). · 9. **Publishes:** `commerce.collection.created`, `.membership_changed`. · 10. **Consumes:** `commerce.listing.published/.unpublished` (smart re-evaluation). · 11. **DB:** `collections`, `collection_listings` (BLUEPRINT §2.5/2.6). · 12–13. **APIs:** internal CRUD + rule definition; collection read query. · 14. **Security:** standard gate; rules validated (no query injection via rule DSL). · 15. **Scale:** smart evaluation is an outbox consumer (partition-serial, idempotent), never request-time. · 16. **Perf:** membership read p95 < 50ms. · 17. **Tests:** rule-evaluation determinism, membership-consumer idempotency, manual/smart interplay. · 18. **Readiness:** CS1 done. · 19. **DoD:** manual + smart collections live; smart membership converges after listing events. · 20. **Complexity:** **M**

---

## 6. Commerce Dependency Graph (with the prompt's skeleton filled)

```
                     CATALOG  (frozen — D-42)
                        │  a product exists, typed, priced (base)
                        ▼
              CS1  LISTING MANAGEMENT            ← the single node four capabilities wait on
       ┌────────────────┼─────────────────┐
       │ stock belongs  │ price needs     │ collections group
       │ to a *listed*  │ channel context │ *listings* (§11)
       ▼                ▼                 ▼
 CS2 INVENTORY    CS3 PRICING ENGINE   CS5 COLLECTIONS
       │                │
       │   offers are *inputs to the resolver* —
       │   built after it or you get two price paths
       │                ▼
       │          CS4 OFFERS (deals + coupons)
       │                │
       └───────┬────────┘
               ▼
        C4 ORDERS  (successor capability — reserves a listed variant,
               │    at the resolver's price, against the inventory ledger)
               ▼
        C5 PAYMENTS (settles what Orders committed; trust-gated payouts)
```

**Why each edge exists:** Catalog→CS1: only authored products can be published. CS1→CS2: stock decrements happen in the context of a *listed, buyable* variant; inventory without listings guards nothing. CS1→CS3: effective price is per-channel — the resolver needs the listing's channel context and overrides. CS3→CS4: an offer is meaningless except as a resolver input; sequencing offers first would fork price truth. CS1→CS5: ADR-002 defines collections over listings — no listings, nothing to group. (CS2,CS3)→Orders: checkout must re-verify price (CS3) and reserve stock (CS2) atomically. Orders→Payments: money settles a committed order, never the reverse.

## 7. Capability Priority Matrix

| Sub-cap | Arch. correctness | Business value | Unblocks | Outcome (OA) | Complexity | Priority |
|---|---|---|---|---|---|---|
| CS1 Listings | the sole ready node | buyable moment | 4 (CS2/3/5 + Discovery) | O2 | M | **1** |
| CS3 Pricing | needs only CS1 | price truth | CS4, Orders checkout | O6/O9 | M | **2** |
| CS2 Inventory | needs CS1; ⊥ CS3 | no oversell | Orders reservations | O6 guardrail | L | **3** (parallel-capable with CS3) |
| CS4 Offers | needs CS3 | the namesake | VS9, Deal GMV | O9 | L | **4** |
| CS5 Collections | needs CS1 only | browsability | Discovery depth | O5 | M | **5** (parallel-capable after CS1; lowest urgency — no one downstream *blocks* on it) |

## 8. Implementation Sequence

**CS1 Listings → CS3 Pricing ∥ CS2 Inventory → CS4 Offers → CS5 Collections → hand off to C4 Orders → C5 Payments.**
(CS3 and CS2 are independent of each other and may run in parallel once CS1 lands; CS5 may slot anywhere after CS1 but earns its place last because nothing blocks on it.)

## 9. Recommended next sub-capability: **CS1 — Listing Management**

By the mandated criteria (not effort):
- **Architectural correctness:** it is the only sub-capability whose upstreams are 100% complete (Catalog frozen, store channel built, hold events live). Every alternative has an unbuilt upstream.
- **Business value:** it creates the *buyable moment* — the VSA-001 critical moment gating VS3 Make-a-Sale, the platform's core revenue loop.
- **Dependency graph:** four capabilities (CS2, CS3, CS5, C10 Discovery) plus Orders wait on it; no other node unblocks more than one.
- **Future extensibility:** `ChannelRef` lands the marketplace/social/POS seam now, cheaply (ADR-002 §0.4) — the OS-level moat (PDS-001) needs channels to exist as a concept before the marketplace does.
- **Outcome contribution:** O2 (first sale sooner) is the highest-leverage open outcome; listings are its prerequisite. It also completes the deferred Availability conjunction's first input.

**Why the others wait:** CS2 without CS1 guards stock nothing can buy; CS3 without CS1 resolves prices with no channel context; **CS4 before CS3 would create a second price path — the drift bug ADR-002's single-resolver law exists to prevent**; CS5 has nothing to group; Orders/Tax/Fulfillment/Returns are other capabilities entirely (§0) and constitutionally cannot precede the Commerce nodes they consume.

---

## Definition of authority
CER-001 is the authoritative Commerce implementation sequence. Each sub-capability is executed under MCEF-001 with its own Capability Contract conforming to this roadmap; deviating from the sequence or re-splitting the sub-capabilities is a CER-001 amendment with dependency-graph justification.
