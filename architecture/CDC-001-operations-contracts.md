# DOF Platform — CDC-001

# Merchant Operations — Consumer-Driven Contracts

**Status:** Accepted (constitutional) · **Version:** 1.0 · **Date:** 2026-07-07
**Authors:** Principal Domain / API / Solutions Architects · Staff Backend Engineer · CTO (one pen)
**Derives from:** ADR-006 · BLUEPRINT-003 v1.1 · OPS-001-BLUEPRINT · ADR-001…ADR-005 · Platform & Product Bibles.
**Force:** after acceptance, this document is the ONLY way any domain touches Operations. Every Operations implementation must conform to it; every consumer blueprint (Orders, Payments, Marketplace, Analytics — including domains that do not exist yet) must integrate exclusively through it. Amendments follow §7 versioning — never ad-hoc.

---

## 0. Laws Before Contracts

**0.1 Operations is already "a separate microservice" by construction — this document makes it official.** Per-domain event/outbox/audit tables (D-22), boundary-linted module seams, ports-not-imports, published language in `contracts/` — the monolith discipline (ADR-003) means extraction is mechanical. CDC-001 freezes the *byte-level* surface so that in-process dispatch can be swapped for a broker and the Query ports for HTTP without any consumer noticing (ADR-003 §9's strangler plan, pre-paid).

**0.2 Exactly three doors.** A consumer may interact with Operations through:
- **D1 — Command ports:** named, per-consumer-allowlisted commands (P2/P5), synchronous, transactional inside Operations.
- **D2 — Query ports & read models:** named read surfaces with declared consistency (P4), plus the Availability projection.
- **D3 — Published events:** the integration taxonomy (P3), at-least-once via the outbox, payload schemas producer-owned and registry-locked (M-6).

There is no fourth door. The merchant-facing REST API (`/api/v1/…`) is a *UI surface*, not a cross-domain integration surface — domains never call each other's HTTP endpoints in-monolith.

**0.3 One writer, one reader-surface.** Operations is sole writer of every physical fact (ADR-006 §6). Symmetrically, each fact has exactly one sanctioned read surface: availability is answered ONLY by the Availability projection/`AvailabilityQuery` — a consumer that computes availability from events instead is in breach (it would fork the math).

**0.4 Consumer-driven means future-consumer-driven.** Orders, Payments, and Marketplace do not exist. Their contracts are frozen here anyway — that is the point: their blueprints inherit these signatures as *requirements*, and Operations' Phase-B code is built against these exact shapes (BLUEPRINT-003 §0.3). A future consumer needing more requests an amendment (§7); it never widens the surface unilaterally.

---

## 1. The Public Surface Inventory (complete)

**Commands (D1):** `ReserveStock` · `ReleaseReservation` · `CommitReservation` · `OpenFulfillmentCase` · `OpenReturnCase` — *Orders only.* `EnableTracking` · `AdjustStock` (+ OPS-003's `RecordReceipt`, OPS-002's `PutShippingProfile`) — *merchant-actor commands, also executable by Ignite under the AI membership within §2.5 limits.* Nothing else is externally invocable; location management, disable-tracking, counts, transfers, imports are merchant/UI commands with no cross-domain caller.

**Queries (D2):** `AvailabilityQuery.get(businessId, variantIds[])` · `AvailabilityQuery.forDisplay(variantIds[])` (buyer-side, per-merchant-region replica) · `ShippingCapabilityQuery.resolve(storeId, destination)` (ships?/pickup?/local?; rate *kinds*, never amounts unless quoted) · `PromiseDateQuery.estimate(variantId, destination)` · `FulfillmentStatusQuery.get(orderRef)` · `ReturnResolutionQuery.get(returnCaseId)` · `OperationalAuditQuery` (Administration only, consent rules).

**Published events (D3) — the integration set, nothing more:** `operations.location.{created,updated,closed}` · `operations.inventory.{tracking_enabled,tracking_disabled,adjusted,received,low_stock,out_of_stock,restocked,oversold_detected}` · `operations.reservation.{created,committed,released,expired}` · `operations.transfer.{dispatched,received}` · `operations.supplier.*` (Ignite/Analytics only) · `shipping.shipment.{created,label_purchased,in_transit,delivered,exception}` + `operations.shipment.promise_at_risk` · `operations.fulfillment.{opened,ready,collected,out_for_delivery,granted,completed,closed,exception}` · `operations.return.{requested,authorized,received,inspected,resolved}`. Internal choreography events (count lines, picking steps, projection ticks) are **not published** and consuming them is a breach.

**Event payload ownership:** Operations owns every payload schema (producer-owned), registered in `contracts/schemas/events/operations-payloads.ts` and registry-locked. Consumers pin the lock; payloads evolve **additively only** (§7).

---

## 2. Per-Consumer Contracts

### 2.1 Commerce

| | Contract |
|---|---|
| **Commands** | **None.** Commerce never mutates physical truth. (Product archival does not touch stock — history survives the product.) |
| **Queries** | `AvailabilityQuery.get` — for listing readiness and workspace display. Advisory freshness (§3); never used as a selling guarantee. |
| **Events consumed by Commerce** | `inventory.{low_stock,out_of_stock,restocked}` (listing badges/readiness), `tracking_enabled/disabled` (display mode). |
| **Events Operations consumes from Commerce** | `commerce.product.created` (Ghost Location policy), `commerce.product.archived` (informational; stock retained), `commerce.variant.added` (none required — StockItems are lazy). |
| **Forbidden** | Joining/reading `stock_*` tables · embedding availability computed from events · writing any movement (a "sale" is Orders' `CommitReservation`, never Commerce's) · caching availability beyond declared TTL (§3). |

### 2.2 Orders (future — these signatures are requirements on the Orders blueprint)

**Commands (all synchronous, strongly consistent, idempotent by natural key):**
- `ReserveStock({ orderLineId, businessId, variantId, quantity, ttl })` → `{ reservationId }` | `RESERVATION_DECLINED { available }` (educating: carries what *is* available). Idempotent on `orderLineId` — a retry returns the original reservation. Untracked/digital/made-to-order variants return a reservation that is a recorded no-op claim (uniform interface; Orders never branches on tracking mode).
- `ReleaseReservation({ reservationId })` — idempotent; releasing a committed/expired reservation is a silent no-op with a distinguishing result flag.
- `CommitReservation({ reservationId })` → converts claim to `sold` ledger line atomically. Idempotent. Committing an *expired* reservation returns `RESERVATION_EXPIRED` — Orders must re-reserve (the last-unit race answer, ADR-006 §0.4).
- `OpenFulfillmentCase({ orderRef, lines[{orderLineId, variantId, quantity, method}], destination?, buyerNote? })` → `{ caseIds[] }` (routing may split — partial fulfillment is first-class, F-6). Idempotent on `orderRef + line set hash`.
- `OpenReturnCase({ orderRef, lines, reasonCode, buyerComment? })` → `{ returnCaseId }`. Idempotent on `orderRef + line set`.

**Reservation lifecycle (frozen):** `active` —(Orders: commit)→ `committed`; —(Orders: release)→ `released`; —(TTL, Operations-owned clock)→ `expired` + `operations.reservation.expired` (Orders MUST consume this and free the cart line). TTL is Orders-proposed, Operations-clamped (declared min/max in the contract schema). Operations never cancels an order — it only answers claims.

**Queries:** `AvailabilityQuery.get` (pre-cart display; the *binding* check is `ReserveStock` itself). `FulfillmentStatusQuery.get(orderRef)` → case/shipment states for order timelines.

**Events consumed by Orders:** `reservation.expired` · `fulfillment.{ready,collected,granted,completed,closed,exception}` · `shipment.{in_transit,delivered,exception}` · `return.{authorized,received,resolved}`.

**Forbidden:** reserving without an order line (no speculative holds — that is a future capability, not a workaround) · reading reservations of other orders · driving fulfillment state directly (only Operations' own workflow moves cases; Orders reacts to events).

### 2.3 Payments (future)

| | Contract |
|---|---|
| **Commands** | **None into Operations.** |
| **Queries** | `ReturnResolutionQuery.get(returnCaseId)` → the resolution snapshot `{ intent: refund/exchange/credit, amountMinor, currency, orderRef, resolvedAt }` — for reconciliation and dispute evidence. |
| **Refund coordination** | Choreography, never orchestration: `operations.return.resolved` carries the intent; Payments executes and emits `payments.refund.issued { returnCaseId }`; Operations consumes it and records settlement on the case. Neither domain calls the other synchronously for money. |
| **Forbidden** | Blocking a refund on restocking state (the merchant's disposition is Operations' business, the money is Payments') · reading stock/shipments/suppliers · interpreting return *reasons* (analytics territory). |

### 2.4 Marketplace / Storefront (future)

| | Contract |
|---|---|
| **Queries** | `AvailabilityQuery.forDisplay(variantIds[])` — buyer-facing, replica-served, coarse (`in_stock / low / out / unlimited` + optional count when merchant opts in) · `ShippingCapabilityQuery.resolve(storeId, destination)` → `{ ships, pickup, localDelivery, rateKinds[] }` · `PromiseDateQuery.estimate(variantId, destination)` → a *defended* date or `null` (never a guess — UX-BIBLE §3.1). |
| **Operational health** | Marketplace reads the **merchant trust-record projection** (Merchant domain's, fed by Operations facts per AMENDMENT-001) — never raw Operations KPIs. On-time rate reaches buyers only through the track record's rendering rules. |
| **Events** | `inventory.{out_of_stock,restocked}` for surface invalidation only. |
| **Forbidden** | Per-location breakdowns (merchant-private) · supplier/cost anything (finance-grade, §11 ADR-006) · movement history · exact counts unless merchant opted in · computing its own promise dates. |

### 2.5 Ignite

| | Contract |
|---|---|
| **Read** | The full D3 integration set + `AvailabilityQuery` + a declared `LowStockReadModel` (threshold-crossed items with velocity context) — evidence for the quartet. |
| **Proposal generation** | Ignite proposes from events/read models; **on merchant approval it executes ordinary D1/merchant commands under the AI Assistant membership** (ADR-001 §12.2) with approval provenance in the request context. No Ignite-special endpoints exist — no side door (ADR-005 Law 1). |
| **Approval workflows** | R-classes govern (ADR-005 §2.2): `EnableTracking`, `AdjustStock(received)`, OPS-003 `RecordReceipt`/reorder = R2 proposals. |
| **Standing Rules / Autopilot limits** | A standing rule executes only commands from the **AI-permitted list** with per-rule bounds (max quantity, max spend in minor units, per-window frequency) enforced twice: by the Autonomy Ledger before execution AND by the AI membership's permission grade at the gate. **AI-forbidden forever (R3 map):** `CloseLocation`, `DisableTracking` on nonzero stock, any supplier/cost mutation beyond an approved reorder, anything step-up. |
| **Forbidden** | Reading Operations tables/repos to "enrich" evidence (events + declared read models only — evidence must be citable) · executing without a ledger entry · re-proposing dismissed proposals (Never Ask Twice — enforced by Ignite, auditable via provenance). |

### 2.6 Analytics (future)

| | Contract |
|---|---|
| **Projection feeds** | The full D3 stream, consumed read-only through the standard delivery ledger. Bulk backfill via the platform replay machinery (delivery-ledger-aware, D-27) — never table dumps. |
| **KPIs** | Analytics *computes* KPIs from events — inventory (stockout-days, shrinkage via `adjusted{lost}`, aging), shipping (on-time %, exception rate, label spend only if granted finance read), returns (rate, reasons distribution, resolution time). Operations pre-computes **nothing** for Analytics, with one exception: per-event derived facts already on payloads (e.g., `delivered` carries `on_time: boolean` versus PromiseDate — computed at the source because only Operations holds the promise). |
| **Forbidden** | Emitting anything Operations-shaped (Analytics publishes `analytics.insight.*` only) · feeding raw Operations data to other domains (consumers go to the source) · joining Operations tables. |

### 2.7 Administration

| | Contract |
|---|---|
| **Standing enforcement** | Administration never commands Operations. Enforcement flows through Merchant standing (`merchant.business.standing_changed`), which the triple gate applies to every Operations command automatically. A suspended business's stock is frozen *by the gate*, not by an ops-freeze command. |
| **Auditing** | `OperationalAuditQuery` over `operations_audit_logs` — admin-scoped, consent-modeled like support access (ADR-001 §12.2), every access itself audited. |
| **Incidents** | Consumes `oversold_detected`, dead-letter alarms from the operations outbox, and (future) anomaly events — signals for cases, never levers. |
| **Forbidden** | Direct data correction (a bad balance is fixed by a merchant-context `AdjustStock` with reason + audit, executed via support-consent delegation — never SQL). |

---

## 3. Cross-Cutting Guarantees

| Concern | Contract |
|---|---|
| **Authorization** | Every D1 command passes the triple gate in the *merchant's* context (P/E/T), regardless of caller. System callers (Orders committing a reservation) act as `{ type: 'system', domain }` actors with command-specific service grants — defined per command in the contract schema, never blanket. Ignite acts as the AI membership. Queries: merchant-context queries gate on `store.view`-class permissions; buyer-display queries (`forDisplay`, capability, promise) are public-surface, tenant-scoped by store, and expose only the §2.4 allowlist. |
| **Idempotency** | Commands: natural-key idempotency where one exists (`orderLineId`, `orderRef+lines`, content hashes) plus Idempotency-Key support at transport level; replays return the original result. Events: at-least-once delivery; every consumer MUST be idempotent via the delivery ledger (platform law). |
| **Retry** | Producers: outbox with backoff + dead-letter (M-6 poison handling). Consumers of D1: retries are safe *because* of idempotency; `RESERVATION_DECLINED`-class business answers are not retryable and must not be retried. Queries: consumer-side timeouts with the declared failure mode. |
| **Failure modes (declared, ADR-003 rule 9)** | `ReserveStock/Commit/Release`: **fail-closed** (no answer = no promise; Orders must surface honest unavailability). `AvailabilityQuery.get`: fail-closed for merchant surfaces. `forDisplay`: **degrade** to `unknown` (storefronts render without stock badges rather than erroring). `ShippingCapabilityQuery`/`PromiseDateQuery`: degrade to `null` (no promise shown beats a made-up one). Event stream: delivery may lag; never lossy (outbox). |
| **Eventual consistency** | Binding availability = the reservation transaction only. Availability projection: eventual, target lag p99 ≤ 2s, declared on the port. Buyer replicas: ≤ 30s. Trust-record feeds: minutes. Every read model's staleness is part of its contract signature — a consumer needing stronger reads is asking for a different door and must amend (§7). |

## 4. Forbidden Interactions (global, absolute)

No consumer, ever: direct database access to any `operations_*`/`locations`/`stock_*`/`shipments`/`return_*`/`supplier*` table · direct repository/aggregate imports (boundary-lint enforced) · table joins across the domain line · aggregate reconstruction from events ("event-sourcing yourself a StockItem") · cross-domain transactions (no consumer work inside an Operations transaction or vice versa) · consuming internal (non-D3) events · calling merchant-facing REST endpoints domain-to-domain · caching beyond declared staleness · synchronous chains deeper than one hop (A→Ops→B synchronously is forbidden; choreograph via events) · widening this surface without a §7 amendment.

## 5. Read Models (the D2 registry)

| Read model | Consumers | Consistency | Notes |
|---|---|---|---|
| Availability projection | Commerce, Orders, Ignite, Marketplace (display variant) | eventual ≤ 2s / replica ≤ 30s | `null` = unlimited; the only availability answer |
| LowStockReadModel | Ignite | eventual | threshold context + velocity for quartet evidence |
| FulfillmentStatus | Orders | eventual (event-fed) | order-timeline rendering |
| ReturnResolution | Payments | strong (case read) | reconciliation snapshot |
| ShippingCapability / PromiseDate | Marketplace, Orders (checkout) | profile-fresh / computed | degrade-to-null |
| OperationalAudit | Administration | strong | consent-modeled |
| Movement biography | **merchant UI only** | strong | explicitly NOT cross-domain |

## 6. Versioning, Deprecation, Compatibility

- **Everything here lives in `contracts/`** (schemas for command/query DTOs and event payloads) — the published language is the versioned artifact, not this prose.
- **v1 evolution is additive-only:** new optional fields, new events, new commands. Never: field removal, retyping, semantic change, tightened validation on existing consumer input.
- **Breaking change = new major surface, side by side:** `ReserveStock.v2` beside v1; dual-emit for renamed events (`old` + `new` for the full window); consumers migrate on their cadence; v1 retires only when the delivery ledger shows zero v1 consumers for 30 days.
- **Deprecation:** marked in contracts + CHANGELOG with replacement named; minimum two release cycles; dead-letter monitoring confirms drain before removal.
- **Compatibility guarantee:** a consumer that pins the registry lock and passes its contract suite today passes it after any non-major Operations release — this sentence is the contract's contract, CI-enforced (§7).

## 7. Testing & CI Enforcement

- **Consumer contract suites** (`tests/contract/operations/<consumer>.test.ts`): each consumer owns a suite expressing ITS expectations (CDC proper) — e.g., the Orders suite asserts Reserve/Commit/Release semantics, idempotent replays, `RESERVATION_DECLINED` shape, expiry event delivery — run against the real ports (embedded PG), not mocks. Suites for not-yet-existing consumers are authored with the Operations sprint that builds their door (Phase B) and become the *acceptance tests* those domains inherit.
- **Registry lock** (already law, M-6): event payload schemas locked; any non-additive change fails `tests/unit/*event-schemas*`.
- **Breaking-change detection:** `check:contracts` gate — JSON-schema snapshots of every D1/D2 DTO committed under `contracts/locks/operations/`; CI diffs and fails on non-additive change without a `.v2` sibling.
- **Boundary enforcement:** `check:boundaries` extends with the §4 blacklist (no `@domains/operations` imports outside operations except the composition root; grep-gates on `operations_` table names outside the domain).
- **Extraction rehearsal (annual, once Phase B exists):** run the contract suites against the ports re-hosted behind HTTP in a test harness — proving the microservice claim stays true, not aspirational.

## 8. Decision Register

**C-1** Three doors only (commands, queries/read models, events); the merchant REST API is not a cross-domain surface. **C-2** Commerce reads availability and mutates nothing physical. **C-3** The reservation lifecycle and its five Orders commands are frozen as requirements on the future Orders blueprint; idempotency by natural keys; expired-commit returns a typed answer, never silent theft. **C-4** Payments coordinates refunds by choreography (`return.resolved` → `refund.issued`), no synchronous money calls. **C-5** Marketplace sees coarse display availability, capability booleans, and defended promise dates — merchant-private operational detail never reaches buyers except through the trust record. **C-6** Ignite has no special doors: evidence from events/read models, execution through ordinary gated commands under the AI membership, autopilot double-bounded (ledger + permission grade), with a frozen AI-forbidden command list. **C-7** Analytics computes KPIs from the event stream; Operations pre-computes only source-only facts (on-time booleans). **C-8** Administration enforces through Merchant standing and reads through consent-modeled audit — never operational levers. **C-9** Failure modes are part of every signature: reserve-class fail-closed, display-class degrade-to-unknown/null. **C-10** Additive-only v1, side-by-side majors, drain-verified retirement, snapshot-diff CI (`check:contracts`), consumer-owned contract suites against real ports. **C-11** Any interaction not listed in §1–§5 is forbidden by default — the surface is an allowlist, not a guideline.

---

*CDC-001 in one sentence: Operations has three doors and a guest list — everything a neighbor domain will ever need is named here with its guarantees attached, and everything else is a wall.*
