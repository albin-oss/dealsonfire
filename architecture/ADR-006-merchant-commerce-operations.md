# DOF Platform — ADR-006

# Merchant Commerce Operations Architecture

**Status:** Accepted (constitutional) · **Version:** 1.0 · **Date:** 2026-07-07
**Authors:** CPO / COO / Principal Domain, Supply Chain, Commerce, Fulfillment & Logistics Architects / CTO (one pen)
**Binding docs honored:** Engineering Constitution · Platform & Product Bibles · ADR-001…ADR-005 · UX-BIBLE-001 v1.1 · DESIGN-SYSTEM-001 · BLUEPRINT-001/002 · DECISIONS.md. Conflicts are ratified in §0/§15 — never silently resolved.
**Paired document:** **BLUEPRINT-003** (Merchant Operations Domain, same cycle) is this ADR's implementation contract. This ADR carries the constitutional authority — vision, boundaries, amendments to prior ADRs, and the decade bets; the blueprint carries the aggregate-level detail. Where this ADR **refines** the blueprint (§15 refinements), BLUEPRINT-003 absorbs them as binding before OPS-001.

---

## Executive Summary

Operations is the domain that keeps the merchant's promises after the customer says yes. It owns **physical truth** — locations, stock, movements, shipments, returns — while Commerce keeps the **sellable promise** and (future) Orders keeps the **buyer's intent**. Its architecture is a six-module domain (`locations · inventory · sourcing · shipping · fulfillment · returns`) built on one spine: an **append-only stock ledger** whose events are simultaneously the audit trail, the availability math, the AI's evidence, and the merchant's trust record. Everything above the ledger is born dormant and activates on evidence (the Ghost Location, untracked-by-default stock, reveal-triggered modules), so a home baker and a multi-warehouse retailer run the *same* architecture at different surface depths — Beginner, Growing, and Enterprise are Surface-Level presets, not modes, not products, not forks. The design covers dropshipping, print-on-demand, digital goods, services, and event tickets through two orthogonal dials — **tracking mode** (what stock means) and **fulfillment route** (who executes) — with zero new domains and zero redesign. This ADR ratifies the inventory-ownership amendment (the never-occupied `commerce/inventory` seam relocates to Operations), freezes the consumer-driven contracts the future Orders domain must call, and sets the scaling posture for millions of products and eventual global deployment.

---

## 0. Challenges to the Brief (Read First)

### 0.1 "The operational brain" is the ledger, not a module

The brief warns "this is not inventory, this is not shipping." Correct — and the architectural consequence is specific: the brain is not a smarter module but the **event spine**. Every physical fact (a unit received, moved, damaged, promised, packed, delivered, returned) is one append-only, reason-coded, cause-referenced ledger or domain event. Availability is derived from it; anomalies are detected in it; forecasts are computed over it; the merchant's on-time record is proven by it; Ignite's every operational sentence cites it. Modules are just doors into the spine. This is why Operations is *cheap* to keep invisible: dormant modules are dormant doors, but the spine records reality from day one.

### 0.2 This ADR ratifies; BLUEPRINT-003 details — and the amendments need ADR authority

BLUEPRINT-003 (same cycle) resolved the collision with frozen material: ADR-002 §7's `InventoryRecord` design is adopted verbatim as `StockItem`, but its home is `operations/inventory` — filling the extraction seam ADR-002 §3 named and no sprint ever occupied. A blueprint should not amend ADRs alone; **this ADR carries the ratification** (§15 R-1…R-3): the ADR-003 ownership rows for Inventory/Reservation-ledger move to Operations, the never-emitted `commerce.inventory.*`/`commerce.reservation.*` event names become `operations.*`, and the pre-reserved `shipping.shipment.*` taxonomy is confirmed Operations-owned. Zero consumers exist; the amendment is free today and impossible later.

### 0.3 Beginner / Growing / Enterprise are Surface-Level presets — modes would be a constitutional violation

ADR-005 §0.5 settled this axis: what a merchant *may* do is entitlements (Scale Tier, frozen); what a merchant *sees* is Surface Level. The brief's three "modes" map to S-level presets (§8) over one codebase, one domain model, one API. A "mode" that changed behavior rather than presentation would fork the product — the exact enterprise-software failure DOF exists to end. Enterprise depth (partner warehouses, safety stock, ERP) is *revealed*, never *switched on as a different system*.

### 0.4 Dropshipping, print-on-demand, and tickets need two dials, not three domains

The merchant-model matrix (§5) resolves on two orthogonal axes that already exist in the model:
- **Tracking mode** — what "stock" means: `untracked` (∞) · `tracked` (counted units) · `digital` (∞ / licensed) · `service` (capacity) · **`made_to_order`** (new, this ADR: ∞ availability, zero ledger, production happens per order — print-on-demand's honest mode).
- **Fulfillment route** — who executes the promise: `merchant` (own locations) · `partner` (3PL location via adapter) · **`supplier_direct`** (new: dropshipping — the FulfillmentCase routes to a SupplierItem's adapter; stock was never the merchant's) · **`producer`** (new: POD — the case routes to an on-demand producer adapter).

Event tickets are already solved upstream: a ticket is a variant with a sale window (D-28f) whose capacity is `tracked` stock at a venue-ish location — no new concept. The two new route kinds and one new mode are **§15 refinements** binding on BLUEPRINT-003's FulfillmentCase and StockItem; they are enum values plus adapter contracts, not new aggregates.

### 0.5 An "operational health score" is only constitutional as a to-do list

The brief asks for a health score. UX-BIBLE forbids grades-as-judgment and DESIGN-SYSTEM DS-8/ADR-005 forbid unexplainable numbers. The **Operational Pulse** therefore follows the readiness-checklist law (D-28): an itemized, explainable list — every item a citation of the merchant's own events and, where actionable, a proposal — rendered as narrative, never as a number to feel bad about. A single score may exist *internally* for ranking Ignite's attention; it is never a merchant-facing grade.

---

## 1. Domain Vision (10 years)

Today: the merchant thinks "I have products," and DOF quietly gives every product a shelf, a count, a box, a promise date, and a way home. 2030: routine operations run themselves under bounded Standing Rules — reorder autopilot, label batches, transfer suggestions — with the merchant as approver of consequence, not operator of software. 2035: the Operations ledger is the merchant's **provable operational reputation** — a decade of delivered-on-time, resolved-in-hours facts, derived from immutable events, underwriting them in agentic commerce (ADR-005 §12) — and the fulfillment-route abstraction lets a home business become a brand with 3PLs and producers *without ever migrating platforms*, which is the entire promise of DOF.

---

## 2. Architecture Overview

```
                    the sellable promise                the buyer's intent
                    ┌────────────┐                      ┌────────────┐
                    │  COMMERCE  │                      │   ORDERS   │ (future)
                    └─────┬──────┘                      └─────┬──────┘
        CatalogPort (qry) │   Availability projection         │ Reserve/Commit ·
                          │   (the ONLY bridge out)           │ OpenFulfillment ·
                          ▼                                   ▼ OpenReturn (CDCs)
   ┌──────────────────────────────────────────────────────────────────────┐
   │                        OPERATIONS (physical truth)                   │
   │  locations · inventory (ledger spine) · sourcing · shipping ·        │
   │  fulfillment (5 methods × 4 routes) · returns                        │
   │  triple gate via MerchantAccessPort ── events: operations.* +        │
   │  shipping.shipment.* ── per-domain store/outbox/audit (D-22)         │
   └───────┬──────────────────────┬───────────────────────┬───────────────┘
           │ ACL adapters         │ trust facts            │ proposals/evidence
           ▼                      ▼                        ▼
   carriers · ERP/WMS ·    Merchant track record       IGNITE (advisory,
   POS · 3PL · producers   (on-time, resolution)       R-classed, no side door)
```

Kernel laws apply wholesale: triple command gate, RFC 9457 + stable codes, idempotency, existence masking, keyset pagination, D-29 detected-change events, ADR-004 data constitution, boundary-linted module seams.

## 3. Bounded Contexts

| Module | Owns | Dormant until |
|---|---|---|
| `locations/` | Location (7 kinds: home/store/warehouse/fulfillment-center/partner/temporary/popup), Ghost default | second location |
| `inventory/` | StockItem + movement ledger, Reservation (math/expiry), Transfer, CycleCount, Availability projection | tracking proposal accepted |
| `sourcing/` | Supplier, SupplierItem, receipts/purchase history, source-adapter registry; future PurchaseOrder | first supplier moment |
| `shipping/` | ShippingProfile/Zone/Rate, Shipment, Label, TrackingEvent, PromiseDate math, CarrierPort | beyond the Reveal default |
| `fulfillment/` | FulfillmentCase (methods × routes), packing/picking surfaces | first order (Phase B) |
| `returns/` | ReturnCase, Inspection, Disposition, return labels | first return request (Phase B) |

Fulfillment-center and temporary location kinds, added by this ADR, behave as `warehouse` and `popup` variants with their own labels — vocabulary, not schema.

## 4. Domain Model (the tactical inventory)

**Aggregates** (detail in BLUEPRINT-003 §4): Location · StockItem (+ ledger) · Reservation · Transfer · CycleCount · Supplier · ShippingProfile · Shipment · FulfillmentCase · ReturnCase · *(named, unbuilt: PurchaseOrder)*.

**Entities:** SupplierItem · Zone · Package · TrackingEvent · Inspection · FulfillmentLine · ReturnLine · CountLine · TransferLine.

**Value objects:** Address · OperatingWindow · Quantity buckets (sellable/damaged/**on_hold**/quarantine — `on_hold` added by this ADR for merchant-initiated holds) · **SafetyStock** (per StockItem: units withheld from ATP; added by this ADR) · ReasonCode · Rate (flat/threshold/calculated/pickup/local-delivery) · WeightDims · PromiseDate · RMA · LeadTime · MOQ · Cost (minor units) · TrackingRef · **RouteKind** (merchant/partner/supplier_direct/producer).

**Domain events vs integration events:** every aggregate emits domain events (`operations.*`, `shipping.shipment.*`) into the Operations store; the **integration set** — the subset other domains may consume — is the published taxonomy: availability-affecting inventory facts, reservation lifecycle, shipment lifecycle, fulfillment completion, return resolution, plus `oversold_detected` and `promise_at_risk` (the Recovery Journey triggers). Internal choreography events (count lines, picking steps) never leave the domain.

**Repositories:** one per aggregate root, kernel idioms (rehydration guards, sequence guard, replace-vs-diff documented per child table).

**Specifications:** `CanCloseLocation` (L2) · `CanReserve` (S4: sellable − safety ≥ qty) · `ZoneResolution` (deterministic, SP2) · `ReturnAuthorization` (policy + generosity-bias override, RT1) · `RouteEligibility` (route kind × product kind × location kind).

**Policies (event-reactive):** `GhostLocationPolicy` (first physical product ⇒ ensure default) · `ReservationExpiryPolicy` · `LowStockPolicy` (threshold − safety crossing ⇒ event) · `OversellDetectionPolicy` (packing shortfall ⇒ `oversold_detected` + Recovery Journey) · `PromiseAtRiskPolicy` (carrier data vs PromiseDate) · `TrustFeedPolicy` (delivered/resolved facts ⇒ track-record projection) · `PopupExpiryPolicy` (warn, never auto-close).

**Domain services:** `AvailabilityService` (ATP math incl. safety stock; the query port) · `PromiseDateService` (lead + transit + route) · `RateResolutionService` (profile × zone × basket) · `FulfillmentRoutingService` (line ⇒ location/route via RouteEligibility + stock) · `RestockingService` (disposition ⇒ ledger pairs).

## 5. Merchant-Model Coverage (no redesign, ever)

| Merchant | Tracking mode | Route | What they see |
|---|---|---|---|
| Home business | untracked → tracked (proposed) | merchant (Ghost home) | products, a to-do list |
| Small retailer | tracked | merchant (store) | counts on products, packing runs |
| Multi-location | tracked | merchant (n locations) | locations, transfers |
| Warehouse/enterprise | tracked + safety stock | merchant (warehouse/FC) | counts, holds, ERP/WMS sync |
| Fulfillment partner (3PL) | tracked at partner location | partner | cases flow to partner; facts flow back |
| Dropshipping | untracked (never held) | **supplier_direct** | products; supplier fulfills; tracking flows back |
| Print-on-demand | **made_to_order** | **producer** | products; production per order |
| Digital products | digital (∞) | digital delivery grant | nothing operational at all |
| Services | service (capacity) | service completion | appointments vocabulary (persona skin) |
| Event tickets | tracked (capacity) + sale windows (D-28f) | pickup/digital | "tickets left" |

## 6. Data Ownership & Consistency

**Ownership:** Operations is sole writer of every §3 fact. Cross-domain references (`variant_id`, `order_id`, `business_id`) are by value with command-time existence checks via ports; no cross-domain FKs (ADR-004). **API contracts:** commands/queries per BLUEPRINT-003 §9, contracts-first in `contracts/` per sprint. **Event contracts:** payload-schema-validated at dispatch (M-6) with registry lock. **Consistency rules:** the reservation transaction is the only *binding* availability check (strong, in-aggregate); the Availability projection is eventually consistent (ms–s) and declares it (ADR-003 §2 staleness test) — UIs read the projection, checkout trusts reservations; trust-record and analytics feeds are eventually consistent by design. **Synchronization with external sources:** one-time move vs continuous mirror with field-level ownership (ADR-005 §5.3); conflicts surface as proposals; imported reputation/levels are attributed, never blended (I-19 doctrine extended to stock: an ERP-owned count renders with its source).

## 7. AI Operations (advisory, quartet-bearing, R-classed)

BLUEPRINT-003 §7 rows, plus this ADR's additions:

| Capability | Evidence source | Ceiling | Law |
|---|---|---|---|
| Overstock / slow-mover detection | ledger velocity vs holding time | R0 insight → R2 deal proposal (ties to Offers — "turn slow stock into a weekend deal") | Opportunity First framing, never "you failed" |
| Seasonal recommendation | the merchant's own year-over-year events (requires ≥1 season of data — else silence) | R2 | no platform-wide "trends" invented without a citable benchmark source |
| Suggested replenishment | velocity × lead time × safety stock | R2 / Autopilot as bounded Standing Rule | order math shown in full |
| **Operational Pulse** | on-time, resolution time, stockout-days, aging stock | narrative only (§0.5) | itemized, explainable, every item a proposal; never a merchant-facing grade |

All rows inherit: explanation quartet mandatory, data-threshold honesty (`guess` below evidence floors), self-demotion on reversals, R3 never AI-initiated.

## 8. Progressive Complexity — the three presets

| Preset | Surface | What exists on screen |
|---|---|---|
| **Beginner** | S0–S1 | products with optional counts; a to-do list of cases; one named shipping default; the confirmed return policy. Zero operational nouns |
| **Growing** | S2 | tracking, adjustments-as-stories, suppliers + reorder proposals, barcode, transfers (if 2nd location), zone editing, return module |
| **Enterprise** | S3 | warehouses/FCs, safety stock, holds, cycle counts with freeze option, ERP/WMS/3PL adapters, PO (when built), calculated international rates |

Presets are *starting reveal states*; individual capabilities still reveal/retreat by evidence (ADR-005 §6 incl. de-escalation). Entitlements gate capability, never presentation.

## 9. Scalability Strategy (millions of products, thousands of concurrent merchants)

Per-(variant,location) stock rows shard naturally by business and spread hot variants across locations; reserve/commit is a single-row lock with per-item event ordering (unrelated items fully parallel). The read side absorbs scale: the Availability projection is cache-per-variant with event invalidation, replicable to read replicas, and — for eventual global deployment — **region-pinned per merchant** (a business's operational truth lives in its home region; buyer-facing availability replicates outward read-only; cross-region is a projection problem, never a transaction problem). `stock_movements` partitions monthly from migration one. Carrier and producer traffic is outbox-buffered and webhook-idempotent. Extraction pressure (ADR-003 §9): `shipping/` first (webhook volume), inventory ledger scales in place. Honest ceiling: DOF merchants at boutique-to-mid scale × millions of SKUs platform-wide — not a single-tenant Amazon FC; bins/waves/slotting remain named extension points on FulfillmentCase.

## 10. Security Considerations

Adjustment fraud: mandatory reason codes, full audit, anomaly events to Administration (Operations reports, never punishes). Margin data (supplier costs, label spend): finance-grade permission gate + log-redaction tokens. Carrier/producer credentials: platform secret config behind ACLs, webhook signature verification, per-adapter rate limits. 3PL/partner principals: scoped memberships touching only their location's cases (ADR-001 §12 principal typing). Buyer addresses: PII-scheduled retention, masked logs, refs-not-payloads in events. Step-up: location closure, carrier connect, disabling tracking with nonzero stock.

## 11. Performance Considerations

`GetAvailability` p99 ≤ 15ms in-region (projection) · reserve/commit p99 ≤ 60ms (single row, short tx) · label purchase async (never blocks a packing run) · tracking ingestion idempotent appends · counts/CSV batched through dossiers · ledger queries recency-bounded by partition. Every number is a CI-checkable budget in the owning OPS sprint.

## 12. Future Extensibility (rooms named now)

PurchaseOrder lifecycle (procurement) · booking/capacity engine plugging into `service` mode (ADR-002 §7's own note) · bins/waves on FulfillmentCase · customs/duties documents at label time behind CarrierPort (HS codes are a Commerce product fact) · multi-currency rates (money VOs already carry currency) · producer marketplaces (POD adapters as a registry category) · WMS-grade adapter tier · regional inventory routing policies · the skills-marketplace seam: third-party operational proposal-producers (ADR-005 §12) consuming the same events.

## 13. Risks (honest register)

**R-a** Phase B is gated on Orders — if Orders slips, fulfillment/returns value slips with it (mitigation: Phase A ships standalone value; Orders is next, per AMENDMENT-001). **R-b** Hot-variant contention at flash-deal scale — mitigated by design (§9) but must be load-tested in OPS-001's gate before Deals fan-out exists. **R-c** Adapter sprawl (9+ sources × carriers × producers) — mitigated by the single registry contract + sandbox-twin law; each adapter is a bounded sprint, never a platform change. **R-d** Forecast/insight trust — one confidently-wrong seasonal suggestion costs more than fifty right ones; the data-threshold law and quartet are the guardrails, and reversal telemetry must actually demote (ADR-005 §2.4). **R-e** 3PL/ERP data quality — partner-fed facts can lie; attribution (never blending) plus anomaly detection keep the ledger honest. **R-f** Ledger growth — monthly partitions + archival policy from day one, not at pain.

## 14. Recommendations

1. Implement per BLUEPRINT-003's sprint ladder (OPS-001…006), with this ADR's refinements absorbed first (§15).
2. **Orders is the next domain blueprint** after OPS-001 lands — it must consume the frozen consumer-driven contracts (BLUEPRINT-003 §6) as written.
3. OPS-001's gate must include the S2 ledger-balance recompute check and S4 race tests at flash-deal concurrency (R-b).
4. Wire Ignite's Reveal to real ShippingProfile/policy writes in OPS-002 (closing the UI-COM-002 gap).
5. Ship the CSV stock source with OPS-001 (reuses dossier machinery; highest merchant value per line of code).
6. Add the trust-record projection contract (on-time, resolution time) to `contracts/` in OPS-005/006 per AMENDMENT-001 rec. #1.

## 15. Ratifications, Refinements & Decision Register

**Ratifications (amend frozen docs, effective with OPS-001):** **R-1** ADR-003 §3 ownership rows: Inventory + Reservation ledger → Operations (intent → Orders unchanged). **R-2** ADR-003 §7 planned names `commerce.inventory.*`/`commerce.reservation.*` → `operations.*`; `shipping.shipment.*` confirmed Operations-owned with frozen names. **R-3** ADR-002 §3/§7: the `inventory/` seam retires in place; `InventoryRecord` design adopted verbatim as `StockItem`.

**Refinements binding on BLUEPRINT-003 (absorbed before OPS-001):** **F-1** TrackingMode gains `made_to_order` (POD: ∞ availability, no ledger, production per order). **F-2** FulfillmentCase gains RouteKind `supplier_direct` and `producer` alongside merchant/partner; `RouteEligibility` specification added. **F-3** Condition buckets gain `on_hold` (merchant-initiated withholding, distinct from returns quarantine). **F-4** StockItem gains SafetyStock (withheld from ATP: `available = sellable − safety − reservations`). **F-5** ReturnCase gains return-label issuance via CarrierPort (same Label VO as shipments). **F-6** Partial fulfillment is first-class: an order may open multiple FulfillmentCases; a case may close partially fulfilled with the remainder re-cased — never a silent partial (F2 applies). **F-7** Location kinds extend with `fulfillment_center` and `temporary` labels. **F-8** Source registry adds Excel-native and Etsy and a WMS adapter category.

**Decisions:** **A6-1** The operational brain is the event spine; modules are doors (§0.1). **A6-2** Beginner/Growing/Enterprise are Surface-Level presets over one architecture — modes are unconstitutional (§0.3). **A6-3** Two dials — tracking mode × fulfillment route — cover every merchant model in §5 without new domains. **A6-4** The Operational Pulse is an itemized narrative under the readiness-checklist law; a merchant-facing numeric grade is forbidden (§0.5). **A6-5** Region-pinned operational truth with read-only availability replication is the global-deployment posture (§9). **A6-6** BLUEPRINT-003 is this ADR's implementation contract; neither document may be amended without the other.

---

*ADR-006 in one sentence: one ledger of physical truth, six quiet doors above it, two dials that fit every kind of merchant — so the person who thinks "I have products" is never wrong, and never has to think more than that until reality politely insists.*
