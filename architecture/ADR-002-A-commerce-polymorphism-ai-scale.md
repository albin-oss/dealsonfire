# ADR-002-A — Commerce Domain: Product Polymorphism, AI Strategy & 10-Year Scale

**Status:** Companion amendment to **ADR-002 (Commerce Domain)** and **BLUEPRINT-002**. Subordinate to them — it deepens three areas PROMPT-009 pushes further than ADR-002; it **contradicts nothing** frozen there. Where this document and ADR-002 appear to differ, ADR-002 governs and this doc is wrong.
**Why an amendment, not a rewrite:** ADR-002 is already the definitive Commerce architecture (Ubiquitous Language, bounded context, domain model, three lifecycle machines, Product≠Listing≠Offer, pricing, inventory, collections, offers, scale). Re-deriving it would duplicate and risk drift. This amendment adds only genuine depth.

---

## A. Conformance map — PROMPT-009 is already answered by ADR-002/BLUEPRINT-002

| PROMPT-009 asks | Where it lives | Depth |
|---|---|---|
| Ubiquitous Language (Catalog, Product, Variant, Listing, Offer, Deal, Coupon, Price, Collection, Attribute, SKU, Inventory, Reservation, Bundle, Subscription…) | ADR-002 §2 | Complete — rejects weak terms; contains the three "brand" meanings |
| Bounded context (in/out; Merchant/Community/Identity/AI/Payments/Shipping/Search) | ADR-002 §0.1, §1, §3 | Complete — includes the ADR-001 boundary redraw + Commerce/Orders/Payments/Shipping decomposition |
| Domain model (entities/VOs/aggregates/repos/factories/policies/specs/commands/queries/events/lifecycle/relationships/extension points) | ADR-002 §4 | Complete |
| Product ≠ Listing ≠ Offer ≠ Deal ≠ Coupon ≠ Promotion ≠ Campaign | ADR-002 §2, §0.2, §9, §12 | Complete — the central "do not mix these" is explicit |
| Pricing (fixed/sale/%/amount/coupon/flash/BOGO/multi-currency) | ADR-002 §8 (`EffectivePriceService`, `OfferValue`, price sets) | Complete for shipped ladder; forward ladder → **§D here** |
| Inventory (unlimited/finite/reserved/backorder/pre-order/digital/service/distributed) | ADR-002 §7 (`InventoryRecord` per variant×location, tracking modes, backorder, reservation ledger) | Complete |
| Catalog (collections/categories/tags/attributes/filters/recommendations/cross/up-sell) | ADR-002 §11 (+smart collections, `SmartCollectionEvaluator`) | Complete |
| Product types (physical/digital/service/subscription/bundle/rental/booking/event/downloadable/AI) without rewrite | ADR-002 §2 (FulfillmentKind), §4.7, §6 (per-kind data) | Named + seam-ready → **polymorphism mechanism deepened in §B here** |
| AI assists merchants/shoppers/admins, human-controlled | ADR-002 §14 (Commerce↔AI Open Host, advisory, provenance) | Merchant-side present → **three-audience strategy in §C here** |
| Scale: 100M products, billions of listings, multi-currency/language/region/tax | ADR-002 §8 (price sets), §17 (business_id shard, hash-partition-ready, channels multiply listings not products) | Complete → confirmations in §E here |

**Conclusion:** the Commerce Domain is already architected. This amendment adds depth to product polymorphism (§B), AI strategy (§C), and the forward pricing ladder (§D), and confirms scale (§E).

---

## B. Product-type polymorphism — one aggregate, N kinds, zero rewrite

**The trap to avoid:** a subtype table or a new aggregate per product type (physical/digital/service/subscription/bundle/rental/booking/event). That is the rewrite ADR-002 forbids and the reason most platforms calcify.

**The model:** the `Product` aggregate stays singular. Polymorphism is expressed by **two orthogonal axes already in the language**, plus one typed capability payload:

1. **`FulfillmentKind`** (ADR-002 §2, kernel column since Module 1): `physical | digital | service`. This answers *how value is delivered* — the only axis Orders/Shipping/Payments care about. It is closed and small on purpose.
2. **`CommercialModel`** (named here, reserved as an extension point in ADR-002 §4.7): `one_time | subscription | bundle | rental | booking | event | pay_what_you_want | auction`. This answers *how the sale is structured over time*. It is open — new values are additive, never a new aggregate.
3. **Per-kind capability VO** (`ProductCapabilities`): a typed, validated value object carried on the Variant, discriminated by the pair above. Examples: digital → `{ assetRef, licenseTerms, downloadLimit }`; service → `{ durationMinutes, capacity, bufferMinutes }`; rental → `{ unitPeriod, deposit, availabilityCalendarRef }`; booking → `{ slotModel, leadTime }`; event → `{ startsAt, venueRef, seatingModel }`; subscription → `{ billingInterval, trialPeriod, commitment }`; bundle → `{ componentRefs[], bundlePricingStrategy }`.

**Why this survives ten years:**
- Orders/Payments/Shipping switch on the **small closed** `FulfillmentKind`, never on the open `CommercialModel` — so adding "rental" never touches those domains' code.
- The capability VO is validated by a per-kind **Specification** (extends ADR-002's `SellableSpecification`), so an invalid rental (no period) cannot exist — the aggregate invariant holds for kinds that don't exist yet.
- A **Bundle** is a Product whose capability lists component variant refs; the `EffectivePriceService` already resolves composite prices via `OfferValue` strategy data — bundle pricing is an offer strategy, not a new pricing engine.
- A **Subscription** product is a selling *agreement*; the recurring *charge* is Payments/Orders (ADR-002 §2) — Commerce owns only the offer of it. Correct seam, no rewrite.
- **AI products** (generated/assembled at purchase) are `digital` + `CommercialModel` extension + a capability referencing an AI job — the AI domain executes; Commerce holds the offer and provenance.

**Migration cost of a new kind:** add a `CommercialModel` value + a capability VO variant + its Specification + an event schema version bump. No new table, no aggregate, no change to Orders/Payments/Shipping. This is the "without redesign" guarantee made concrete.

---

## C. AI Commerce Strategy — three audiences, human-controlled

Constitutional frame: **AI-First, Human-Controlled**. Every AI output in Commerce is a **proposal carrying `AIProvenance`** (kernel VO), reversible, and applied only by a human command — never an autonomous irreversible write. This is the same pattern proven in Ignite's `IgniteIntelligence` port.

**For merchants (assist authoring & pricing):**
- Draft product copy, titles, attributes, SEO from a photo/idea → merchant edits before `product.created`.
- Pricing *suggestions* (competitive/margin-aware) surfaced by `EffectivePriceService`'s explanation trace — merchant sets the price; AI never writes a price (ADR-002 §8: price is a merchant decision).
- `DuplicateDetectionService` (ADR-002 §4.3) — advisory dedupe on import.
- Merchandising suggestions: "these 6 items belong in a Summer collection" → a proposed **smart-collection rule**, applied on approval.

**For shoppers (assist discovery, never manipulate):**
- Recommendations, cross-sell/up-sell, recently-viewed, "complete the look" — served from read models, ranked by the AI/Search domains (Commerce exposes the catalog + signals via the Open Host Service; it does not implement ranking).
- Guardrail: no dark patterns, no fabricated scarcity (Opportunity First, not manufactured urgency). Availability shown is the real `AvailabilityService` value.

**For administrators (assist governance & trust):**
- Anomaly/fraud signals (bulk-price-to-zero already an ADR-001 signal via `variant.price_changed`), category-misclassification flags, policy-violation detection on listings → a moderator **queue**, not an automatic takedown.
- Taxonomy governance assist (ADR-002 O2-1): AI proposes category placements; humans own the taxonomy.

**Non-negotiables:** advisory-only, provenance-stamped, reversible, human-applied, explainable. AI may propose; only a person (or a scoped, audited AI-agent staff principal with explicit `ai_policy`) commits.

---

## D. Forward pricing ladder — extensions on the existing substrate

ADR-002 §8 ships fixed/sale/%/amount/coupon/flash/BOGO/multi-currency on `EffectivePriceService` + `OfferValue`. The forward ladder is **new offer strategies and inputs to the same resolver**, not a new engine — this is why no rewrite is needed:

| Future | How it plugs in | Owner seam |
|---|---|---|
| Dynamic pricing (rules) | A `PriceSchedule`/offer strategy driven by inputs (inventory age, demand) → still resolved by `EffectivePriceService` with a trace | Commerce |
| AI pricing | AI *proposes* a schedule/offer; merchant approves; resolver unchanged | Commerce + AI (advisory) |
| Auctions | `CommercialModel = auction` + a bidding capability; final price is an order-time input Payments settles | Commerce (offer) + Orders/Payments (settlement) |
| Negotiation (offers/counteroffers) | A negotiated price becomes a scoped, code-like single-use `Offer` targeted at one buyer | Commerce (offer) + Orders |

The invariant that protects correctness forever: **there is exactly one `EffectivePriceService`**, used by storefront, merchant preview, and Orders checkout re-verification (ADR-002 §8). Every pricing feature must express itself as an input to that resolver, or it does not ship.

---

## E. Scale confirmations (10-year)

ADR-002 §17 already establishes: `business_id` leading shard key; `products/variants/listings` hash-partition-ready; **channels multiply listings, not products** (catalog stays the size of reality); inventory as a separate hot-write aggregate (no contention with catalog edits); workers on the partition-serial outbox; price sets for multi-currency; per-region channel policy for global expansion; tax kept entirely out of Commerce (Payments/Orders). This amendment adds no new scale claim — it confirms the polymorphism model (§B) preserves them: new kinds add columns/VOs, never new hot tables, so the shard/partition strategy is untouched.

**Open questions carried forward (ADR-002 O2-1…O2-5):** taxonomy governance (now urgent), Reservation contract (with Orders), price-set/multi-currency design (with Payments), marketplace channel policy, bundle composition — each a future ADR. §B here answers O2-5's shape (bundle = Product with component-ref capability); the detailed composition/pricing rules remain for that ADR.

---

## Definition of authority
ADR-002 + BLUEPRINT-002 remain the Commerce Domain architecture of record. This amendment is binding only for the polymorphism mechanism (§B), the AI strategy (§C), and the forward-pricing framing (§D). No implementation, API, or migration is defined here — Commerce implementation continues to conform to ADR-002/BLUEPRINT-002, now with these deepenings.
