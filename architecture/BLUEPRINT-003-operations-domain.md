# DOF Platform — BLUEPRINT-003

# Merchant Operations Domain — Implementation Blueprint

**Status:** Accepted (implementation contract for all OPS-* sprints) · **Version:** 1.1 · **Date:** 2026-07-07
**Authors:** Principal Domain Architect / Supply Chain / Fulfillment / Inventory Architects / CTO (one pen)
**Binding docs honored:** Engineering Constitution · Platform & Product Bibles · ADR-001…ADR-005 · UX-BIBLE-001 v1.1 · DESIGN-SYSTEM-001 · BLUEPRINT-001/002 · DECISIONS.md D-01…D-36. Conflicts with frozen material are reconciled in §0 and registered in §15 — never silently resolved.
**Contains:** no implementation code, no migrations, no API schemas — architecture only. Table/command/event *names* appear as contract vocabulary.

**v1.1 (ADR-006 pairing):** ADR-006 is this blueprint's constitutional layer; it carries the §0.1/§15 amendments with ADR authority (R-1…R-3) and adds eight binding refinements absorbed here before OPS-001: TrackingMode `made_to_order` (print-on-demand) · FulfillmentCase RouteKind `supplier_direct` (dropshipping) and `producer` (POD) + `RouteEligibility` spec · condition bucket `on_hold` · SafetyStock on StockItem (`available = sellable − safety − reservations`) · return labels via CarrierPort · first-class partial fulfillment (multiple cases per order, evented remainders) · location kind labels `fulfillment_center`/`temporary` · Excel/Etsy/WMS source-adapter entries. Neither document may be amended without the other (A6-6).

**The one-sentence mission:** the merchant thinks *"I have products"*; Operations thinks locations, stock, reservations, suppliers, shipping, fulfillment, and returns — and never makes the merchant think them until reality does.

---

## 0. Challenges & Reconciliations (Read First)

### 0.1 Inventory ownership moves — by filling a seam, not by redesigning a domain

ADR-002 §7 designed inventory correctly and completely: a separate `InventoryRecord` aggregate per (variant, location), untracked-by-default, reservation *ledger* owned locally while Orders owns reservation *intent*. ADR-003's ownership matrix assigned "Inventory, Reservation ledger" to **Commerce** — and ADR-002 §3 simultaneously declared `inventory/` a **named extraction seam** that no sprint has ever filled with code (verified: `domains/commerce/` contains catalog only).

**This blueprint ratifies the extraction before the seam was ever occupied.** The `InventoryRecord` design from ADR-002 §7 is preserved **verbatim** — same aggregate shape, same tracking modes, same ledger/intent split with Orders — but its owning module is `operations/inventory`, not `commerce/inventory`. Why Operations and not Commerce: stock is *physical reality* (it exists at a location, moves in trucks, gets damaged, gets counted), and every other physical-reality concern in the brief — locations, transfers, shipments, returns handling — must share its transactional neighborhood. Splitting "stock" from "the shelf it sits on and the box it leaves in" would force the cross-domain transactions ADR-003 P1–P5 forbid.

Two frozen artifacts are amended, explicitly and before first use:
- **ADR-003 §3 matrix rows** "Inventory, Reservation ledger → Commerce" become "→ Operations" (Reservation intent/lifecycle → Orders, unchanged).
- **ADR-003 §7 planned event names** `commerce.inventory.*` and `commerce.reservation.*` — never emitted by any code — are renamed `operations.inventory.*` / `operations.reservation.*`; the already-future-namespaced `shipping.shipment.*` taxonomy is ratified as Operations-owned and keeps its frozen names. Zero consumers exist; zero breakage is possible. (Register rows R-1…R-3, §15.)

What Commerce keeps, unambiguously: products, variants, options, prices, listings, offers — the **sellable promise**. Operations owns the **physical truth**. The bridge is one published read model: the **Availability projection** (§5), which Commerce's listing-readiness and future Orders' promise-checks consume without ever reaching into Operations tables.

### 0.2 "I have products" is an architecture requirement, not a UX wish

Every module below is **born dormant** and activates on evidence, mirroring ADR-005 §6/§7 mechanically:

- The **Ghost Location**: creating the first physical product implicitly ensures a default location (kind `home`, invisible in every UI). Locations become a *concept* the merchant meets only at the second location. `location_id` is real in every stock row from day one (ADR-002 §7's own rule) — multi-location is new rows, not a migration.
- **Untracked is the default stock mode**: availability = ∞, no counts anywhere, nothing to maintain. Tracking is *proposed* (an Ignite R2 proposal) at the first oversell near-miss or by merchant request — never enabled silently.
- Suppliers begin as **a name on a product**; shipping begins as **one named default profile** written by Ignite's Reveal; returns begin as **the policy text** the merchant confirmed. Each module's full surface stays behind its reveal trigger (§8).

The law for implementers: **a merchant who never needs a module must never see its nouns** — and the domain model must make that free, not clever.

### 0.3 Orders does not exist yet — design the couple, wire it later

Reservations, fulfillment, and returns are *triggered* by order facts. Rather than invent a shadow order concept (forbidden: no new domain concepts owned in the wrong place), Operations ships in **two activation phases**:

- **Phase A (implementable now):** Locations, Inventory (stock, adjustments, transfers, counts, sources), Suppliers, Shipping profiles/zones/rates. Everything keyed by ids Operations owns plus `variant_id`/`business_id` by value. Ignite's Reveal and the CSV dossier machinery wire in immediately.
- **Phase B (activates when Orders lands):** Reservation lifecycle, FulfillmentCase, ReturnCase, Shipment-for-order, carrier labels. All Phase-B aggregates are **fully designed in this blueprint** (§4) with `order_id`/`order_line_id` held by value; their commands are consumer-driven contracts Orders will call (P2/P5), and their events are already in the taxonomy. Building Phase B early against a fake order would be placeholder architecture — the Engineering Constitution's cardinal sin.

This also settles sequencing: **AMENDMENT-001's recommendation stands — Orders is the next domain after OPS Phase A**, because Recovery Journeys (ADR-005 §2.5) need order facts to repair against.

### 0.4 Overselling protection is promise math plus repair — never a lock

Grandma must never meet a row lock. Protection is layered: (1) **available-to-promise** (`available = on_hand[sellable] − active_reservations`, ∞ when untracked) answered from the Availability projection; (2) **reservation-at-checkout** (Phase B) making the promise explicit and expiring; (3) **the last-unit race resolved at commit** inside the StockItem aggregate's transaction — one buyer wins, the other's flow gets an honest answer in seconds, not a shipped apology in days; (4) when reality still slips (untracked stock, count drift, damage discovered while packing), the **oversell is a first-class event** (`operations.inventory.oversold_detected`) that opens the inventory Recovery Journey (ADR-005 §2.5) — honest options to the buyer, and *the moment the tracking proposal finally lands* (D-36-style teaching). Silent cancellation is constitutionally impossible: there is no code path that reduces a promise without an event.

### 0.5 Fulfillment is work, not warehousing — and it is polymorphic

The brief lists picking/packing next to digital and service fulfillment. One model covers them without WMS cosplay: a **FulfillmentCase** is *the work required to keep a promise*, with a **method** — `ship`, `pickup`, `local_delivery`, `digital`, `service` — chosen per line from the product's fulfillment kind + the buyer's choice. Ship-method cases produce Shipments; pickup produces a ready/collected handshake; digital produces delivery grants (executed by Commerce/Media capability, recorded here); service produces a completion confirmation. Pick-paths, wave-picking, and bin locations are S3+ vocabulary that this model *can* grow (a case has lines; lines can gain bin hints) but which no OPS sprint may surface before the reveal trigger fires (§8).

### 0.6 Suppliers are a memory, not a procurement system

Phase-A suppliers exist to power reorder proposals ("you bought these from Rosa's Wholesale, lead time ~6 days") — a profile, contact, per-variant catalog entries with cost and lead time, and a purchase *history* built from received stock (§4.4). PurchaseOrder is a **named future aggregate** with its lifecycle sketched and deliberately unbuilt: procurement (approvals, partial receipts, invoicing) arrives with demand signals worth procuring against. Supplier *costs* are the domain's most sensitive numbers (§11).

---

## 1. Domain Mission

**Responsible for:** physical locations and their kinds · stock truth per (variant, location) including condition buckets, movements, adjustments-with-reasons, transfers, cycle counts · the reservation ledger (math + expiry) · available-to-promise answers as published language · inventory ingestion via source adapters · supplier records, catalogs, lead times, purchase history · shipping profiles, zones, rates, pickup/local-delivery configuration · shipments, labels, tracking facts · return cases, inspection, disposition, restocking · fulfillment cases across all five methods · the operational facts that feed Trust records (on-time rate, resolution time — AMENDMENT-001).

**Explicitly NOT responsible for:** products/variants/prices/listings (Commerce) · order intent, cart, checkout, reservation lifecycle decisions (Orders, future) · money movement — refund *execution*, payouts, charges (Payments, future; Operations records the refund *decision* and hands off) · carrier contracts/billing reconciliation (behind the CarrierPort ACL) · taxes (future Tax capability) · buyer identity (Identity) · policy *text* authorship (Merchant owns PolicyText; Operations executes the operational consequences) · media bytes (MediaRef only).

**Ten-year vision:** the merchant's operational autopilot — the domain whose events let Ignite run "reorder when low, up to €200/week" as a bounded standing rule, whose ledger makes every unit's biography queryable, and whose on-time record is the merchant's provable collateral in the 2035 agentic marketplace (ADR-005 §12).

---

## 2. Ubiquitous Language

| Term | Meaning |
|---|---|
| **Location** | A place stock can be or work can happen: `home` (the Ghost default) · `store` · `warehouse` · `popup` (time-boxed) · `partner` (3PL — executes, never owns) |
| **StockItem** | The stock truth for one (variant, location): mode, buckets, thresholds. The ADR-002 §7 `InventoryRecord`, renamed to the merchant's mental model |
| **TrackingMode** | `untracked` (∞, the default) · `tracked` · `digital` (∞ until licensing caps) · `service` (capacity-based, future booking plug-in) |
| **Condition bucket** | Where units sit within a StockItem: `sellable` · `damaged` · `quarantine` (returns awaiting inspection). Only `sellable` counts toward availability |
| **StockMovement** | One append-only ledger line: the quantity delta, bucket, reason, and cause reference. Stock history is the ledger; balances are the aggregate's cache of it |
| **Reason code** | Why stock moved: `received` · `sold` · `adjustment` (with sub-reason: damaged/lost/found/correction) · `count` · `transfer_out/in` · `return_restock` · `oversell_correction` |
| **Reservation** | A time-boxed claim on sellable units for an order line. Operations owns the math and expiry; Orders owns the intent (frozen split, ADR-002 §7) |
| **Available-to-promise (ATP)** | `on_hand[sellable] − active_reservations`, per variant across locations; ∞ when untracked. The only availability number anyone else may read |
| **Transfer** | Stock moving between the merchant's own locations: draft → in_transit → received (with per-line variance) |
| **CycleCount** | A counting session: expected vs counted per line; variance becomes adjustments with reason `count` |
| **InventorySource** | An ingestion adapter (manual, CSV, Shopify, …, ERP, API) with a declared capability matrix — the ADR-005 §5.1 Source Adapter contract, reused |
| **Supplier / SupplierItem** | Who the merchant buys from; a supplier's offer for one variant (cost, lead time, MOQ). Preferred supplier is per-variant |
| **ShippingProfile / Zone / Rate** | What the merchant promises buyers: a profile groups products; zones map regions; rates are `flat` · `threshold` (free over X) · `calculated` (carrier-quoted via port) · `pickup` · `local_delivery` (radius/areas) |
| **Shipment / Label / TrackingEvent** | The physical execution of a ship-method fulfillment: packages with lines, a purchased Label (MediaRef + cost), and carrier tracking facts appended behind idempotent webhooks |
| **FulfillmentCase** | The work unit for keeping an order's promise; method `ship` / `pickup` / `local_delivery` / `digital` / `service`; the Pulse task the merchant actually sees |
| **ReturnCase** | One return conversation: request → authorized (RMA) → received → inspected → disposition (`restock` / `damage` / `discard`) + resolution intent (`refund` / `exchange` / `credit`) — the trust-building moment, modeled |
| **PromiseDate** | The delivery estimate shown to buyers — a *defended* date derived from lead + transit data, never marketing (UX-BIBLE §3.1) |

---

## 3. Bounded Context Map

`domains/operations/` — one domain, six modules, each an extraction seam in the ADR-002 §3 style (own folder, own aggregates, shared operations event store per D-22):

```
domains/operations/
├── shared-kernel/          # branded ids (LocationId, StockItemId, ShipmentId…), reason codes
├── locations/              # Location aggregate; Ghost-default policy
├── inventory/              # StockItem + ledger, Reservation, Transfer, CycleCount, Availability projection
├── sourcing/               # InventorySource adapters (ACL), Supplier, SupplierItem, purchase history; future PurchaseOrder
├── shipping/               # ShippingProfile/Zone/Rate; Shipment, Label, Tracking (CarrierPort ACL)
├── fulfillment/            # FulfillmentCase (5 methods), packing/picking work surfaces
└── returns/                # ReturnCase, Inspection, Disposition; restock handoff to inventory/
```

**Relationships (ADR-003 patterns):** Merchant → Operations: conformist (triple gate via the `MerchantAccessPort` mechanism proven by Commerce, D-30c) · Commerce ↔ Operations: published language both ways (Operations reads variant existence/kind via a `CatalogPort` query; Commerce reads ATP via the Availability projection — no direct table access either way) · Orders (future) → Operations: customer/supplier with consumer-driven contracts (Orders calls Reserve/Release/Commit and OpenFulfillmentCase) · Carriers/ERP/POS: ACL adapters in `operations/*/infrastructure/` per ADR-003 §6, with sandbox adapters (test law) · Ignite: event consumer + proposal producer only — no side door (ADR-005 Law 1).

**Extraction pressure prediction** (ADR-003 §9 doctrine): `shipping/` extracts first if carrier-webhook volume demands it; `inventory/` ledger partitions long before the module ever needs to leave the monolith.

---

## 4. Domain Model

Every aggregate follows kernel law: UUIDv7 app-generated ids · optimistic sequence guard · events describe DETECTED change with silent no-ops (D-29) · rehydration guards · existence masking · audit on every command.

### 4.1 locations/ — `Location` (root)

**Holds:** kind (`home`/`store`/`warehouse`/`popup`/`partner`) · name · Address VO · pickup instructions VO (nullable) · operating window VO (popups: mandatory end date) · status (`active`/`closed`) · `is_default`.
**Invariants:** **L1** exactly one default location per business, always (the Ghost — created idempotently on first physical-product event, never user-visible until a second location exists) · **L2** a location with non-zero sellable or reserved stock cannot close (transfer first — the domain refuses to strand units; Errors Educate copy names the transfer door) · **L3** `partner` locations cannot host manual adjustments (their stock truth arrives via their adapter) · **L4** popup expiry warns (Pulse task), never auto-closes (calm, not automation theater).
**Events:** `operations.location.{created, updated, closed, default_changed}`.

### 4.2 inventory/ — `StockItem` (root), `Reservation` (root), `Transfer` (root), `CycleCount` (root)

**StockItem** — one per (variant_id, location_id), created lazily on first movement or mode change.
Holds: TrackingMode · balances per condition bucket (cached from ledger) · reserved total · incoming total (from transfers/receipts en route) · low-stock threshold (nullable = Ignite-suggested later) · backorder policy VO.
The **StockMovement ledger** is append-only, immutability-granted like audit logs (ADR-004 C4), every line carrying reason code + cause ref (`transfer_id`, `return_case_id`, `order_line_id`, `count_id`, `source_batch_id`) — a unit's biography is a query.
**Invariants:** **S1** `sellable` never negative *through domain commands*; discovered negatives (count says 3, ledger says 5) are recorded as `count` adjustments, loudly — reality wins, the ledger says so · **S2** every balance change appends exactly one ledger line in the same transaction (balances are provably the ledger's sum — a nightly `check:ledger` gate recomputes) · **S3** mode changes are events (`tracking_enabled` seeds an opening `count` movement; `tracking_disabled` keeps the ledger — history is never erased) · **S4** reserved may never exceed sellable *at reservation time*; the last-unit race is settled inside this aggregate's transaction (§0.4) · **S5** condition moves (sellable→damaged, quarantine→sellable) are paired ledger lines, never edits.
**Events:** `operations.inventory.{tracking_enabled, tracking_disabled, adjusted, received, transferred_out, transferred_in, condition_changed, counted, low_stock, out_of_stock, restocked, oversold_detected}`.

**Reservation** — holds: order_line ref (by value) · variant/location · quantity · state (`active`/`committed`/`released`/`expired`) · TTL.
**Invariants:** **R1** created only through the Reserve command (Orders' door, Phase B) · **R2** expiry is time-driven and emits (`expired` releases units — abandoned carts return stock without anyone clicking) · **R3** commit converts the claim to a `sold` ledger line atomically with the StockItem.
**Events:** `operations.reservation.{created, committed, released, expired}`.

**Transfer** — draft → `in_transit` (stock leaves source: `transfer_out` lines; destination `incoming` rises) → `received` (per-line received qty; variance auto-adjusts with reason `transfer_variance`, evented). **T1** source and destination must differ and belong to the business; **T2** receiving more than shipped is recorded, flagged, never rejected (reality wins).
**Events:** `operations.transfer.{created, dispatched, received, cancelled}`.

**CycleCount** — a session over a location (optionally filtered): lines of expected/counted; closing emits `counted` + one adjustment per variance. **C1** counts snapshot `expected` at line-add time and record drift at close (the honest window); **C2** a count never blocks selling (no freeze mode at S0–S2; freeze is a named future option for warehouses).
**Events:** `operations.count.{opened, closed}`.

### 4.3 sourcing/ — `Supplier` (root) + `InventorySource` adapters

**Supplier** — profile (name, contact VO, notes) · **SupplierItem** children: variant ref, cost (minor units), currency, lead-time-days, MOQ · preferred flag per variant (one preferred supplier per variant, **P1**) · purchase history entries appended from `received` movements that carry a supplier ref (Phase A: receipts; PurchaseOrder formalizes later).
**Events:** `operations.supplier.{created, updated, archived, item_added, item_updated, preferred_changed}`.

**InventorySource** — not an aggregate: an **adapter registry** implementing ADR-005 §5.1's Source Adapter contract for *stock*: `manual` (the UI) · `csv` (reuses the dossier machinery; lands as `received`/`count` movements, batch-tagged, batch-undoable via compensating adjustments) · `shopify`/`woocommerce`/`amazon`/`square`/`lightspeed`/`erp`/`api` — each declaring capabilities (levels? costs? locations? webhooks or poll?) and a sync mode (one-time vs mirror with field-level ownership per ADR-005 §5.3). All adapters are ACLs (ADR-003 §6): foreign models never leak past `infrastructure/`; every inbound webhook is authenticated, idempotency-checked, and translated to internal commands before domain logic. **The Ignite import registry and this registry are one registry** — a source that brings products (Commerce) and stock (Operations) lands each fact in its owning domain through its own commands.

### 4.4 shipping/ — `ShippingProfile` (root), `Shipment` (root)

**ShippingProfile** — scope (store-wide default, or product-group by value refs) · **Zone** children (region sets) · **Rate** VOs per zone: `flat {price}` · `threshold {price, free_over}` · `calculated {carrier_service ref}` · `pickup {location refs}` · `local_delivery {radius|areas, fee, window}`. Money in minor units, everywhere.
**Invariants:** **SP1** every store has exactly one default profile (Ignite's Reveal writes it — a *named default*, R2 because rates are money) · **SP2** a zone must resolve deterministically for any buyer address (overlaps resolve by specificity, ties are validation errors at save — never runtime surprises) · **SP3** `calculated` rates require a connected carrier; the profile refuses the rate kind otherwise (Errors Educate names the connection door).
**Events:** `operations.shipping_profile.{created, updated, archived}`.

**Shipment** — order ref by value · packages (lines, weight/dims VO) · from-location · method service ref · Label VO (MediaRef + cost + carrier id) · tracking number · state (`pending` → `label_purchased` → `in_transit` → `delivered` | `exception`) · **TrackingEvent** append-only children from carrier webhooks (idempotent by carrier event id — the `event_deliveries` discipline applied to inbound).
**Invariants:** **SH1** label purchase is async through the outbox (a slow carrier never blocks the packing run) · **SH2** tracking facts are append-only and idempotent · **SH3** `delivered` vs PromiseDate computes the on-time fact — **the input to the merchant's Trust record** (AMENDMENT-001); late shipments emit `promise_at_risk` *before* delivery when carrier data allows (proactive disclosure, ADR-005 §2.5).
**Events:** `shipping.shipment.{created, label_purchased, in_transit, delivered, exception}` *(frozen ADR-003 names, ratified Operations-owned)* + `operations.shipment.promise_at_risk`.

### 4.5 fulfillment/ — `FulfillmentCase` (root)

Holds: order ref by value · method (`ship`/`pickup`/`local_delivery`/`digital`/`service`) · lines (order-line refs + quantities + resolved location) · state machine per method:
- `ship`: `open` → `picking`(optional surface) → `packed` → shipment created → closes on `delivered`/`exception`
- `pickup`: `open` → `ready` (buyer notified) → `collected`
- `local_delivery`: `open` → `out_for_delivery` → `delivered`
- `digital`: `open` → `granted` (delivery grant issued; executed by the owning capability, recorded here) — usually seconds, invisible as a task
- `service`: `open` → `scheduled?` → `completed` (merchant confirms; the future booking capability plugs in)
**Invariants:** **F1** every line's method must be compatible with its product's fulfillment kind (read via CatalogPort) · **F2** packing a tracked line *may* reveal shortage → `oversold_detected` + the Recovery Journey, never a silent partial · **F3** cases are the merchant-visible unit: Pulse renders cases, never shipments (tasks, not modules — ADR-005 §7) · **F4** partner locations receive cases through their adapter and report back facts.
**Events:** `operations.fulfillment.{opened, ready, collected, out_for_delivery, granted, completed, closed, exception}`.

### 4.6 returns/ — `ReturnCase` (root)

Holds: order ref + lines (by value) · reason VO (enumerated + free text — the pattern-mining input) · state (`requested` → `authorized` (RMA code) → `received` → `inspected` → `resolved`) · **Inspection** entity (condition found, photos as MediaRefs, notes) · disposition per line (`restock` → quarantine→sellable ledger pair · `damage` → damaged bucket · `discard` → adjustment out) · resolution intent (`refund`/`exchange`/`credit`) with amount in minor units — **the decision recorded here; execution commanded to Payments/Orders when they exist** (Phase B wiring; the decision record is Phase-B-shaped but the aggregate ships whole).
**Invariants:** **RT1** authorization checks the confirmed policy (Merchant's PolicyText ref) but the merchant can always override *toward generosity* without ceremony — and toward strictness only with an explicit reason (audited; the Trust record favors generosity, UX-BIBLE §10) · **RT2** restock quantities never exceed received · **RT3** resolution time (request → resolved) is computed and evented — the second Trust-record input · **RT4** every disposition writes its ledger pair in the same transaction.
**Events:** `operations.return.{requested, authorized, received, inspected, resolved}`.

---

## 5. Availability & Overselling Protection (the published contract)

The **Availability projection** — Operations' most-read surface and its *only* externally readable fact:

- Per variant: `available` (∑ sellable − ∑ active reservations across locations; `null` = untracked = unlimited), `incoming`, per-location breakdown at higher surfaces.
- Maintained by the projection registry from ledger/reservation events (versioned, rebuildable — platform machinery as-is).
- Consumers: Commerce listing readiness ("in stock" surfaces), future Orders promise checks, the workspace grid, Ignite's low-stock detection. **Contract: consumers read the projection or call the AvailabilityQuery port — never Operations tables** (one writer per fact, and one *reader surface* per fact).
- Freshness declared honestly (ADR-003 §2 staleness test): the projection may lag milliseconds-to-seconds; the *binding* check is the reservation transaction (§4.2 S4). UI shows projection numbers; checkout trusts only reservations.

Oversell lifecycle (the §0.4 layers, as facts): `low_stock` (threshold) → `out_of_stock` (ATP hits 0) → `oversold_detected` (reality < promises) → Recovery Journey proposal → `restocked`/resolution. Every arrow is an event; nothing in the chain is silent.

---

## 6. Integration Points

| With | Direction | Mechanism |
|---|---|---|
| **Merchant** | Ops → Merchant | Triple gate per command via the MerchantAccessPort mechanism (D-30c); new capabilities registered: `ops.inventory`, `ops.locations`, `ops.shipping`, `ops.fulfillment`, `ops.returns`, `ops.suppliers` (tier-gated per registry, e.g. multi-location at Growth+) |
| **Merchant Trust record** | Ops → projections | `delivered`-vs-promise and return resolution-time events feed the track-record projection (AMENDMENT-001 rec. #1) — derived from events, never asserted |
| **Commerce** | both, published language | Ops reads variant existence/fulfillment-kind via **CatalogPort** (query, fail-closed); Commerce reads the **Availability projection**. No FKs across domains (ADR-004); `variant_id` by value with existence checks at command time |
| **Orders (future)** | Orders → Ops | Consumer-driven contracts frozen by this blueprint: `Reserve/Release/Commit`, `OpenFulfillmentCase`, `OpenReturnCase` — plus Ops events Orders consumes (`shipment.delivered` → order fulfilled) |
| **Payments (future)** | Ops → Payments | Refund *decision* handoff (`operations.return.resolved` carries intent + amount; Payments executes and emits `payments.refund.issued`) |
| **Ignite** | events + proposals | Consumes the taxonomy; produces R-classed proposals (§7); reorder autopilot is a bounded Standing Rule (ADR-005 §2.4) executing ordinary Ops/sourcing commands under the AI membership — no side door |
| **Media** | ref only | Labels, inspection photos as MediaRefs |
| **Carriers / ERP / POS** | behind ACLs | `CarrierPort` (quote, buy label, track, webhook verify) and source adapters in `infrastructure/`; sandbox adapter per port (test law); credentials in the platform secret configuration, never in domain state |

---

## 7. AI Touchpoints (quartet-bearing, R-classed)

| Capability | Trigger (evidence source) | Ceiling | Honesty constraint |
|---|---|---|---|
| Low-stock alert + reorder proposal | `low_stock` + supplier lead time + sales velocity | R0 alert / R2 order / Autopilot as bounded Standing Rule | Evidence cites the merchant's own velocity and the supplier's own lead time |
| Supplier recommendation | purchase history + lead-time variance | R0 insight | Only suppliers the merchant already uses are compared; no external supplier data exists to cite |
| Shipping recommendation | rate table vs order patterns ("free over €50 pays for itself") | R2 (rates are money) | The math shown is the merchant's own orders |
| Inventory anomaly | ledger patterns (shrinkage, count drift, impossible sequences) | R0 insight → R2 count proposal | Anomaly ≠ accusation: copy describes the numbers, never guesses causes |
| Demand forecasting | sales history per variant | R0 narrative | **Data threshold law:** below ~20 orders/variant Ignite must say "you'll have real data after ~N orders" (confidence: `guess`); forecasts always carry the quartet |
| Tracking-enable proposal | oversell near-miss / `oversold_detected` | R2 | Arrives at the moment of the problem (ADR-005 §6.1), pre-filled with the opening count |
| Operational coaching | on-time rate, resolution time trends | R0 whisper/digest | Mirror-not-judgment framing (UX-BIBLE §3.2); repair visible, never scolded |

---

## 8. Progressive Complexity Map (binding on every OPS UI sprint)

| Concept | Reveal trigger | Before the trigger |
|---|---|---|
| Locations | second location need (transfer intent, popup creation, partner connect) | Ghost default; the word "location" appears nowhere |
| Stock tracking | oversell near-miss proposal, or merchant asks | quantities absent; availability ∞ |
| Adjustments/ledger | tracking enabled | — (adjustments render as one-line stories: "−2, damaged") |
| Transfers | second active location | — |
| Cycle counts | tracked stock + S2 | — |
| Suppliers | "where do you get this?" asked once at a natural moment, or reorder proposal accepted | supplier is a text field on receipt, nothing more |
| Shipping zones/tables | first out-of-region order or merchant intent | one named default profile (Reveal-written) |
| Carrier integration | volume makes label-buying kind (S2) | manual "mark as sent + paste tracking" |
| Returns module | first return request | the confirmed policy text is the whole surface |
| Barcode / scanner | S2 volume | — |
| ERP/3PL/partner | S3, by explicit ask | — |

---

## 9. API Boundaries (names only — kernel laws apply: RFC 9457 + stable codes, Idempotency-Key, keyset cursors, existence masking, step-up where noted)

- **locations:** `CreateLocation` · `UpdateLocation` · `CloseLocation` (step-up; L2 educates) · `SetDefaultLocation` · `ListLocations`
- **inventory:** `EnableTracking` (opening count inline) · `DisableTracking` · `AdjustStock` (reason mandatory) · `MoveCondition` · `SetLowStockThreshold` · `CreateTransfer/DispatchTransfer/ReceiveTransfer` · `OpenCount/RecordCountLine/CloseCount` · `GetAvailability` (the port) · `ListStock` · `ListMovements` (the biography query)
- **sourcing:** `CreateSupplier/UpdateSupplier/ArchiveSupplier` · `PutSupplierItem` · `SetPreferredSupplier` · `RecordReceipt` (supplier-ref'd receiving) · `ConnectSource/RunSourceSync` (adapter registry) · `ListSuppliers/GetSupplier`
- **shipping:** `PutShippingProfile` (whole-document, like BrandKit) · `ConnectCarrier` (step-up; credentials via ACL) · `QuoteRates` (port) · `PurchaseLabel` (async) · `RecordTrackingWebhook` (internal, idempotent) · `ListShipments/GetShipment`
- **fulfillment (Phase B door for Orders):** `OpenFulfillmentCase` · `MarkPicked/MarkPacked` · `MarkReady/MarkCollected` · `MarkOutForDelivery/MarkDelivered` · `GrantDigitalDelivery` · `CompleteService` · `ListCases` (needs-action first)
- **returns (Phase B):** `RequestReturn` (buyer-side via Orders) · `AuthorizeReturn` · `ReceiveReturn` · `RecordInspection` · `ResolveReturn` (disposition + intent; R2 always) · `ListReturnCases`

No schemas here — contracts-first zod + OpenAPI arrive with each sprint, in `contracts/` per house law.

---

## 10. Data Ownership & Constitution Compliance (ADR-004)

- Manifest-first: every table enters `contracts/data/manifest.json` before its migration. Sketch (names, not DDL): `locations` · `stock_items` · `stock_movements` (**month-partitioned** — the domain's audit-log-scale table; INSERT+SELECT grants only, like audit) · `reservations` · `transfers` + `transfer_lines` · `cycle_counts` + `cycle_count_lines` · `suppliers` + `supplier_items` + `supplier_receipts` · `shipping_profiles` + `shipping_zones` (rates as jsonb VOs — the options-as-VO precedent, D-30a) · `shipments` + `shipment_tracking_events` · `fulfillment_cases` + `fulfillment_case_lines` · `return_cases` + `return_case_lines` + `return_inspections` · plus the D-22 quartet: `operations_domain_events`, `operations_outbox_events`, `operations_event_deliveries`, `operations_audit_logs`.
- Money bigint minor units; quantities integer; timestamptz only; text+CHECK not enums; **no cross-domain FKs** — `variant_id`, `order_id`, `business_id` by value with command-time existence checks via ports; tombstones/archival, no CASCADE anywhere; UUIDv7 app-generated; forward-only checksummed migrations.
- Ordering scope (D-19): StockItem events partition by `stock_item_id` (per-item serial — the hot path stays parallel across items); shipment/return/fulfillment events by their aggregate id; supplier/profile by `business_id`.

---

## 11. Security Considerations

Stock adjustments are theft-adjacent: reason codes mandatory, actor always audited, anomaly events feed (never trigger) review — Administration enforces, Operations reports. Supplier costs and label spend are margin data: read-gated behind `finance`-grade permissions, excluded from staff-role defaults, redaction-listed in logs (D-26 tokens extended: `cost`, `unit_cost`). Carrier credentials live in platform secret config behind the ACL, never in domain rows; webhook endpoints verify carrier signatures and rate-limit. Partner (3PL) principals act through scoped memberships (ADR-001 §12's principal typing), touching only their location's cases. `CloseLocation` and `ConnectCarrier` are step-up operations. Buyer addresses on shipments are PII: retention-scheduled, masked in logs, never in events (events carry refs).

---

## 12. Performance & Scaling Strategy

The hot path is **reserve/commit on popular variants**: single-row `SELECT … FOR UPDATE` on `stock_items` with short transactions (the Product-slice concurrency pattern, proven under race tests); per-item event ordering keeps unrelated items fully parallel; a variant's multi-location fan-out spreads load across rows by design. **Reads never touch the hot row**: the Availability projection absorbs the 1000:1 read ratio, cache-able per variant with event-driven invalidation; p99 target for `GetAvailability` ≤ 15ms in-region. `stock_movements` partitions by month from day one (write-only, queried by recency). Label purchase and carrier calls are outbox jobs (SH1); tracking webhooks are idempotent appends. Cycle counts and CSV syncs batch through the dossier machinery, never row-by-row commands. Scale ceiling honesty: the design targets 100k merchants × modest SKU counts (the DOF customer), not Amazon FCs — warehouse-grade features (bins, waves, slotting) are *named extension points* on FulfillmentCase, unbuilt.

---

## 13. Migration & Activation Strategy

Greenfield domain — no data migrates. The strategy is **activation choreography**:

1. **Seam closure (with OPS-001):** ADR-002's empty `commerce/inventory` seam is formally retired; ADR-003 matrix + taxonomy amendments (§0.1) land in the same PR as the first Operations migration; DECISIONS.md records the D-number.
2. **Ghost backfill:** a one-time job ensures the default location per existing business with physical products (idempotent; invisible).
3. **Ignite wiring:** the Reveal's shipping/returns items start writing real `ShippingProfile` defaults and policy refs (closing UI-COM-002's "reveal items are drafts" gap).
4. **Phase B switch-on:** when Orders lands, its blueprint must consume the §6 consumer-driven contracts *as frozen here*; reservation enforcement turns on per business via a capability flag (Trust Before Growth: promise math before promise enforcement).
5. **Mirror-mode sources:** platform adapters (Shopify et al.) arrive per-adapter with field-level ownership rules; one-time moves ship before continuous sync (ADR-005 §5.3).

---

## 14. Implementation Order (the OPS sprint ladder)

1. **OPS-001 — Locations + Inventory core** (Phase A heart): Location + Ghost policy, StockItem + ledger + adjustments, availability projection, tracking-enable flow, CSV stock source. *Gate: ledger-balance invariant test (S2) + race tests on S4.*
2. **OPS-002 — Shipping profiles + Ignite Reveal wiring**: profiles/zones/rates, the named default, PromiseDate math v1.
3. **OPS-003 — Suppliers + receiving + reorder proposals**: sourcing module, receipt-driven history, Ignite low-stock → reorder (R2).
4. **OPS-004 — Transfers + cycle counts** (unlocks at second location / S2).
5. **OPS-005 — Fulfillment + Shipments + carrier ACL** (Phase B, blocked on Orders): cases, packing runs, labels, tracking, on-time Trust feed.
6. **OPS-006 — Returns** (Phase B): cases, inspection, disposition, restock ledger pairs, resolution-time Trust feed, Recovery Journey wiring.

---

## 15. Decision & Reconciliation Register

**Reconciliations (amendments to frozen docs, effective with OPS-001):**
**R-1** ADR-003 §3: Inventory + Reservation-ledger ownership rows move Commerce → Operations (Reservation intent stays Orders). **R-2** ADR-003 §7: planned, never-emitted `commerce.inventory.*`/`commerce.reservation.*` names become `operations.*`; `shipping.shipment.*` keeps its frozen names under Operations ownership. **R-3** ADR-002 §3/§7: the `inventory/` seam is retired in place; §7's `InventoryRecord` design is adopted verbatim as `StockItem` (ledger split, tracking modes, untracked default, location-real-from-day-one all preserved).

**Decisions:**
**O-1** Operations owns physical truth; Commerce owns the sellable promise; the Availability projection is the only bridge. **O-2** The Ghost Location: exactly one invisible default per business, created idempotently; multi-location is rows, never a migration. **O-3** Stock truth is an append-only, immutability-granted ledger with reason codes and cause refs; balances are its cached sum, gate-verified. **O-4** Untracked is the constitutional default; tracking arrives as an evidence-bearing proposal at the moment of need. **O-5** Overselling protection is layered promise math (ATP → reservation → commit-time race settlement → evented Recovery Journey); no code path reduces a promise silently, and no path locks Grandma's UI. **O-6** Reservation math/expiry here, intent/lifecycle in Orders — ADR-002 §7's split, kept. **O-7** FulfillmentCase is the polymorphic work unit (five methods, per-method state machines); Pulse renders cases, never shipments. **O-8** ReturnCase models the trust moment: inspection with evidence, disposition with ledger pairs, generosity-biased overrides, resolution-time as a Trust-record fact. **O-9** Suppliers are memory now, procurement later; PurchaseOrder is named and unbuilt. **O-10** One source-adapter registry serves Ignite imports and inventory sources; every external system sits behind an ACL with a sandbox twin. **O-11** Two-phase activation: Phase A ships now; Phase B aggregates are fully designed, wired only when Orders lands — whose blueprint must consume §6's contracts as frozen. **O-12** PromiseDate is a defended date: computed from lead + transit facts, at-risk events fire proactively, and delivered-vs-promise feeds the merchant's track record. **O-13** On-time rate and resolution time are event-derived Trust inputs (AMENDMENT-001), never asserted numbers. **O-14** Supplier costs are finance-grade secrets (permission-gated, redaction-listed). **O-15** `stock_movements` partitions by month with audit-grade immutability grants from the first migration.

---

*BLUEPRINT-003 in one sentence: the merchant keeps thinking "I have products" — Operations quietly gives every product a shelf, a count, a supplier, a box, a promise date, and a way home, each appearing only on the day reality asks for it.*
