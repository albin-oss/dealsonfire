# DOF Platform — ADR-007

# Order Management Domain Architecture

**Status:** Accepted (constitutional) · **Version:** 1.0 · **Date:** 2026-07-07
**Authors:** CPO / Principal Domain, Commerce, Distributed-Systems, Fulfillment & Payments Architects / CTO (one pen)
**Binding docs honored:** Engineering Constitution · Platform & Product Bibles · ADR-001…ADR-006 · BLUEPRINT-003 v1.1 · OPS-001B-DESIGN · **CDC-001 (Orders' integration half was frozen there before this domain existed — this ADR conforms to it, clause by clause)** · UX-BIBLE-001 v1.1 · DESIGN-SYSTEM-001 · DECISIONS.md. Conflicts are reconciled in §0/§13, never silently resolved.
**Contains:** no code, no schemas, no APIs — the constitutional architecture for every customer purchase on DOF.

---

## 1. Executive Summary

Orders is the domain of **buyer intent becoming a kept promise**. It owns the cart (a mutable working document), the checkout (a compensating saga, not a transaction), and the Order itself — an **immutable record of what was promised at a moment in time**, with an append-only timeline of how the promise unfolded. It owns none of the things it orchestrates: products and prices are snapshotted *from* Commerce at placement; stock claims are made *through* Operations' frozen reservation commands (CDC-001); fulfillment and returns are *requested from* Operations and observed as events; money moves *through* a Payments port designed now and implemented later. The lifecycle covers physical, digital, service, and ticket lines — mixed in one cart, split across locations and methods, partially fulfilled — with one rule making all of it tractable: **the order never mutates; reality appends**. Cancellations, returns, refunds, and failures are appended decisions and consumed facts, never edits to history. Checkout is idempotent end-to-end (one attempt key governs reserve → authorize → place), overselling resolves at commit time into an honest answer or a Recovery Journey (this ADR finally unlocks ADR-005 §2.5), and the timeline the buyer sees and the one the merchant sees are projections of the same events — which is how trust stays one fabric.

## 0. Challenges to the Brief (Read First)

**0.1 The order is a snapshot plus a diary — immutability is the design, not a constraint.** "Orders must remain immutable after creation" is promoted from rule to architecture: the Order aggregate is a frozen *promise record* (line snapshots with product title, variant, unit price, applied offers, totals, promise dates — all captured at placement) plus an **append-only timeline**. Everything that happens afterward — payment facts, fulfillment facts, cancellation decisions, return resolutions — is appended, sourced either from Orders' own decisions or from other domains' events. Disputes, support, and analytics get a single authoritative "what did we promise and what happened," and no consumer ever needs to re-derive history.

**0.2 CDC-001 wrote our integration contract first — we conform.** `ReserveStock` / `ReleaseReservation` / `CommitReservation` (idempotent by order line), `OpenFulfillmentCase` / `OpenReturnCase`, the consumed set (`reservation.expired`, `fulfillment.*`, `shipment.*`, `return.*`), reservation-TTL clamping, and the typed `RESERVATION_EXPIRED` answer are inherited as **requirements**, not proposals. Operations internals are unreachable by construction; availability is read only from the projection, and only advisorily — the binding check is the reservation itself.

**0.3 Checkout is a saga with one idempotency spine.** Reserve, authorize, place — three systems, no distributed transaction (ADR-003 P5). A single **checkout attempt key** makes every step replay-safe: a retried attempt re-lands on the same reservations (natural-key idempotency, CDC-001), the same payment authorization (PaymentPort contract), and ultimately the same order. Compensation is explicit per step (release on auth failure, void on placement failure). A buyer double-clicking "Pay" can produce at most one order in the universe.

**0.4 Cart ≠ Order.** The cart is buyer-owned, mutable, guest-capable, live-priced (re-quoted on read — a price change before checkout is the truth, shown honestly), and holds **no reservations** — stock is claimed only when checkout begins, TTL-bound, so browsing never hoards inventory. The frozen `orders.cart.abandoned` event (ADR-003 §7) feeds future recovery flows; abandonment releases nothing because nothing was held.

**0.5 Buyers are not merchants — identity is thin, claimable, and never duplicated.** Guest checkout captures the minimum (contact + delivery), keyed by a guest token; the frozen Ignite claim pattern (ADR-001 §9 Step 4) applies to buyers: a later registration claims order history via Identity. Merchant-side "Customers" is a **read model derived from order events** (a future CRM surface), never an Orders-owned aggregate — Orders emits facts about buyers, it does not own relationships.

**0.6 Kind-polymorphism lives in the lines, not the order.** Every line resolves a fulfillment method (from the product's kind + buyer choice, ADR-006's method×route dials); the order groups lines *by resolved (location, method)* into fulfillment case requests — mixed carts, split and multi-location fulfillment, and partial shipment fall out of one mechanism. Backorders and pre-orders are **named line-states** (`awaiting_stock`, `awaiting_release`) reserved now, unbuilt, requiring no lifecycle redesign.

## 2. Domain Vision (10 years)

Today: the promise record every other domain trusts. 2030: the substrate of the Trust Fabric's hardest numbers — repeat-purchase rate, promise-kept rate — and of Recovery Journeys that fire before buyers notice. 2035: the negotiation ledger of agentic commerce (ADR-005 §12): when buyer agents transact with merchant Ignites, the artifacts they exchange are exactly this domain's objects — quotes become carts, accepted offers become orders, and a decade of immutable promise records is what lets machines trust the marketplace.

## 3. Bounded Context

**Owns:** Cart · CheckoutAttempt (saga state) · Order + lines + timeline · reservation *intent/lifecycle* (the ADR-002 §7 split, kept) · fulfillment/return *requests* · cancellation decisions · notification triggers (what to say when — delivery belongs to Notification) · buyer order history & guest lookup · the order read models (merchant needs-action list, buyer timeline).
**Does NOT own:** products/prices/offers (Commerce — snapshotted via query at placement) · stock math/ledger, fulfillment execution, shipping rates/labels, return handling (Operations, via CDC-001) · money movement (Payments, via port) · marketplace ranking (Discovery) · customer identity (Identity) · CRM (future read-model domain).
**Module layout** (`domains/orders/`, extraction seams per house pattern): `cart/` · `checkout/` · `order/` · `shared-kernel/` — with the D-22 quartet (`orders_domain_events` etc.) and its own dispatcher.

## 4. Aggregate Design

**Cart** (root) — buyer ref (user id or guest token) · store ref · lines {variant ref, qty, price-as-displayed} · currency · updated-at (abandonment clock). Invariants: **C1** one active cart per (buyer, store); **C2** line prices are display hints — re-quoted via Commerce on read; the cart never asserts price truth; **C3** no reservations, ever.

**CheckoutAttempt** (root, saga) — cart snapshot · attempt key (the idempotency spine) · buyer contact/delivery capture · step ledger (`reserving → reserved → authorizing → authorized → placing → placed | compensating → failed`) · reservation refs · auth ref. Invariants: **K1** replays with the same key resume, never duplicate; **K2** every failure path names its compensation (release reservations; void authorization); **K3** attempt TTL ≤ reservation TTL (the promise to the buyer never outlives the stock claim).

**Order** (root) — immutable header: order number (human-friendly, per-store sequence) · buyer snapshot · business/store refs · **LineSnapshots** (product/variant identity + title, options, unit price, offer applied, tax lines (future), fulfillment method resolved, PromiseSnapshot) · totals (minor units) · payment refs · state (§5) · **Timeline** (append-only entities: decision records + consumed facts, each with actor/source/occurred-at) · linked case refs (fulfillment, returns) by value. Invariants: **O1** header and line snapshots never change after placement (the constitutional one); **O2** state transitions only via the §5 machine; **O3** every externally caused transition cites its evidence (the consumed event id) in the timeline; **O4** monetary integrity — captures + refunds never exceed authorization/captures respectively (enforced against the payment-fact records); **O5** order completion requires every line resolved (fulfilled, cancelled, or returned-terminal).

**Entities:** OrderLine (snapshot + line state: `open → reserved → committed → in_fulfillment → fulfilled | cancelled | returned`; future: `awaiting_stock/awaiting_release`) · TimelineEntry · PaymentFact (auth/capture/refund records, by-value refs) · CancellationRecord · ReturnLink.
**Value objects:** Money (minor units) · LineSnapshot · BuyerContact · DeliverySnapshot (address or pickup/digital/service marker) · PromiseSnapshot (the defended date shown at checkout — UX-BIBLE §3.1) · AttemptKey · OrderNumber · CancellationReason (enumerated + free text).
**Specifications:** `CanCancel` (state- and fulfillment-aware: free before cases open; after that, per-line with merchant approval) · `CanInitiateReturn` (delivered lines within policy window; generosity-biased override per RT1) · `LinesResolved` (O5) · `RefundWithinBounds` (O4).
**Policies (event-reactive):** `ReservationExpiryPolicy` (consume `operations.reservation.expired` → fail the attempt or line honestly) · `FulfillmentProgressPolicy` (cases/shipments → line states → order state) · `PaymentOutcomePolicy` · `AbandonmentPolicy` (cart clock → `cart.abandoned`) · `CompletionPolicy` (delivery + return-window → `completed`) · `PromiseAtRiskPolicy` (consume `operations.shipment.promise_at_risk` → proactive-disclosure Recovery Journey — ADR-005 §2.5, finally wired).
**Domain services:** `CheckoutOrchestrator` (the saga) · `QuoteService` (Commerce snapshot + Operations promise-date + shipping-rate resolution via their query ports — Orders composes quotes, computes nothing it doesn't own) · `FulfillmentPlanner` (lines → (location, method) case requests via CDC-001) · `OrderNumberService`.

## 5. Lifecycle — the state machine with four voices

Order states: `placed → confirmed → in_fulfillment → partially_fulfilled → fulfilled → completed`, with `payment_pending/payment_failed` between placed and confirmed, and `cancelled` reachable before fulfillment (per-line afterwards). Returns never rewind state — they append to `completed`.

| Transition | Customer expects | Merchant expects | Domain behavior | Events |
|---|---|---|---|---|
| Cart → Checkout | "I'm buying this" | nothing yet | attempt created; **ReserveStock per line** (TTL-bound); quote frozen into draft snapshots | *(internal step facts)* |
| Checkout → **Placed** | instant confirmation page + email | nothing yet (no false alarms) | PaymentPort.authorize under the attempt key; Order written with immutable snapshots; timeline opens | `orders.order.placed` |
| Placed → **Confirmed** | "it's really happening" | **the new-order Pulse task appears now** — only when money and stock are certain | **CommitReservation per line** (the last-unit race resolves here: a typed `RESERVATION_EXPIRED` → honest re-offer to the buyer, never silent theft — CDC-001 §2.2); authorization confirmed | `orders.order.confirmed` |
| payment failure | honest retry screen, nothing charged | nothing (never sees the noise) | releases reservations after grace; retry window under the same attempt key; then auto-cancel | `orders.order.payment_failed` *(new — §13 additive)* |
| Confirmed → **In fulfillment** | "getting ready" + promise date | the packing task (case), not an "order screen" | `OpenFulfillmentCase` per (location, method) group; digital lines grant instantly and may complete alone | `orders.order.fulfillment_requested` *(new)* + Operations' case events |
| → **Partially fulfilled** | honest per-line tracking ("2 of 3 shipped") | remaining-work task stays open | line states advance from consumed `shipment.*`/`fulfillment.*` facts; timeline appends each | `orders.order.partially_fulfilled` *(new)* |
| → **Fulfilled** | "everything's on its way / delivered" | task clears; on-time facts recorded (Trust) | all lines terminal-fulfilled | `orders.order.fulfilled` |
| → **Completed** | quiet; review prompt (Community) | revenue settles (capture completes per §7) | delivery confirmed + return window elapsed (or service confirmed / digital grant) | `orders.order.completed` *(new)* |
| **Cancellation** (before cases) | one tap, instant, money back | usually invisible (auto-approved window) | release reservations, void/refund via port, record decision + reason | `orders.order.cancelled` |
| Cancellation (after cases) | request, honest answer | a decision card (approve/decline with consequence math) | per-line; only unfulfilled lines cancellable; case amendment requested from Operations | `orders.order.cancelled` (scoped payload) |
| **Return initiated** | "send it back" — guided, RMA + label | the fair-judge decision card (Ops UX) | `OpenReturnCase` via CDC-001; Orders records the link; refund follows `operations.return.resolved` → PaymentPort.refund → `payments.refund.issued` consumed → timeline | `orders.order.returned` (when resolution lands) |

## 6. Event Taxonomy & Integration Strategy

**Emits** (ADR-003 frozen set + four additive extensions registered before first emission — §13): `orders.cart.abandoned` · `orders.order.{placed, confirmed, payment_failed, fulfillment_requested, partially_fulfilled, fulfilled, completed, cancelled, returned}`. Payloads are producer-owned, registry-locked (M-6), PII-free (buyer contact stays in the aggregate; events carry refs).
**Consumes:** Operations — `reservation.expired`, `fulfillment.{ready,collected,granted,completed,closed,exception}`, `shipping.shipment.{in_transit,delivered,exception}`, `operations.shipment.promise_at_risk`, `operations.return.{authorized,received,resolved}` · Payments (future) — `payments.{charge,refund}.*` · all via delivery-ledgered consumers, idempotent by law.
**Queries out (fail-closed at checkout):** Commerce product/variant/price snapshot + offer resolution · Operations `AvailabilityQuery` (advisory), `PromiseDateQuery`, `ShippingCapabilityQuery`/rate resolution · Merchant access gate for merchant-side actions (buyer-side actions authenticate through Identity/guest tokens — a **new gate class this ADR introduces: the buyer context**, scoped to the order's buyer ref, masking exactly like the merchant gate).
**Payments seam (designed now, implemented later):** a synchronous `PaymentPort` — `authorize(attemptKey, totals, method)` at checkout (fail-closed) · `capture(orderRef, amount)` on fulfillment milestones (capture-on-fulfillment default for physical; on-grant for digital/service — buyer-protective, escrow-compatible with ADR-001's trust ladder) · `refund(orderRef, amount, cause)` from cancellation/return decisions — plus consumed settlement events. Idempotent by attempt/order keys; sandbox adapter from day one (test law). No PSP concepts leak inward.

## 7. Data Ownership

Orders is sole writer of carts, attempts, orders, timelines, cancellation records, and the order read models. Cross-domain ids by value only; **snapshots are copies by design, not denormalization sins** — O1 makes them the product. Consistency declarations: checkout steps are strongly consistent per system with saga compensation across; timelines and read models are eventually consistent (seconds), declared; the buyer's "where is my order" view may lag reality by an event-hop and says so honestly (UX-BIBLE §6.3 narrated waiting).

## 8. AI Touchpoints (advisory — quartet + R-classes, per ADR-005/CDC-001 discipline)

| Capability | Evidence | Ceiling |
|---|---|---|
| Fulfillment priorities | promise dates vs clock, carrier cutoffs ("these 2 must ship by 3pm to keep Friday promises") | R0 ranking of the existing task list — ordering a list is presentation, not action |
| Delayed-order disclosure | `promise_at_risk`, case aging | **R2** — drafts the proactive buyer note + goodwill option (the ADR-005 §2.5 journey); merchant signs |
| Cancellation insights | reason distributions, pre-cancel patterns | R0 narrative → R2 fix proposals ("size-related cancellations cluster on X — add a size chart?") |
| Operational recommendations | cross-order facts (packing-time trends, method mix) | R0/R2; never auto-messages a buyer — **sending words to customers is R2 forever** |

## 9. Scalability

Order writes are once-plus-appends: the hot path is checkout, and its contention lives where it belongs (Operations' per-item reservation rows). Idempotent placement makes retry storms safe; attempt keys dedupe at the edge. Orders partition by placement month with business/buyer indexes (queried forever, written once); timelines are append-only; read models absorb the merchant-list and buyer-history read load. Concurrent checkout on the last unit is *designed* to race — the resolution is Operations' commit-time answer plus this domain's honest re-offer, load-tested with the Deals fan-out profile (the flash-sale case: many attempts, few commits, zero double-sells, zero silent failures). Replay safety: every consumer delivery-ledgered; timelines rebuild from events; region-pinning follows the merchant's region (ADR-006 A6-5) with buyer reads replicated.

## 10. Security

Buyer PII is the domain's chief burden: contact/delivery snapshots encrypted-at-rest posture, retention-scheduled, masked in logs (D-26 tokens extended), never in events. Guest lookup tokens are single-order-scoped, expiring, and rate-limited (enumeration-proof: constant-time miss answers). The buyer gate masks exactly like the merchant gate (existence is information). Merchant-side actions run the triple gate; cancellation/refund decisions are audited with actors; refund bounds (O4) are aggregate-enforced so no compromised surface can over-refund. Payment method data never enters the domain — the port carries tokens only (PCI scope stays in Payments/PSP).

## 11. Risks

**R-a** Payments is the critical path to real money and doesn't exist — mitigated by the port + sandbox design, but ADR-008 (Payments) must follow immediately; checkout cannot GA on the sandbox. **R-b** Saga complexity is the domain's tax — mitigated by the single attempt-key spine, per-step compensation table, and contract tests inherited from CDC-001 §7; any new step must name its compensation before merge (ADR-003 rule 9). **R-c** Snapshot drift (Commerce changes shape) — snapshots are schema-versioned; old orders render forever without Commerce's help. **R-d** Timeline fan-in ordering (facts arrive out of order) — entries order by occurred-at with source sequence; the state machine tolerates late facts idempotently. **R-e** Guest-token abuse — rate limits + scoping (§10). **R-f** The completed/return boundary invites state-machine creep — held by the "returns append, never rewind" law.

## 12. Recommendations

1. **BLUEPRINT-004 (Orders implementation blueprint) next**, consuming CDC-001's contracts verbatim; first sprint = Cart + CheckoutAttempt + Order placement against Operations' dark-shipped reservation machinery (OPS-001B OD-5) with the sandbox PaymentPort.
2. **ADR-008 Payments immediately after** — the port contract in §6 is its consumer-driven requirement set (the CDC pattern, repeated).
3. Wire the two long-awaited unlocks in the first implementation sprint: Recovery Journeys (promise-at-risk → disclosure proposal) and the first-sale Signature Moment (`orders.order.confirmed` is the Moment Ledger's trigger — UX-BIBLE §14.3's biggest ceremony finally has its event).
4. Register the four additive event names + a CDC-002 (Orders' own consumer contracts: what Marketplace/Analytics/Notification may consume from Orders) before implementation.
5. Extend the trust-record projection contract (AMENDMENT-001 rec. #1) with promise-kept and repeat-buyer facts as soon as `confirmed`/`completed` events exist.

## 13. Reconciliation & Decision Register

**Reconciliations:** R-1: ADR-003 §7's planned Orders taxonomy is adopted; four additive names (`payment_failed`, `fulfillment_requested`, `partially_fulfilled`, `completed`) join it before first emission (additive-only law). R-2: ADR-002 §7's reservation split honored verbatim (intent here, math in Operations). R-3: CDC-001 §2.2 inherited as requirements — no deviations found necessary. R-4: escrow remains ADR-001/Payments territory; capture policy (§6) is designed to compose with it.

**Decisions:** **A7-1** The order is an immutable promise record + append-only timeline; reality appends, never edits. **A7-2** Checkout is a compensating saga on one attempt key; at most one order per attempt in all failure interleavings. **A7-3** Carts hold no reservations; stock is claimed only at checkout, TTL-bound. **A7-4** Kind-polymorphism is per-line method resolution; cases group by (location, method); backorder/pre-order are reserved line-states. **A7-5** The last-unit race resolves at commit into an honest re-offer — never silent cancellation (the CDC answer, given its UX). **A7-6** PaymentPort: authorize at checkout, capture on fulfillment milestones, refund by decision — tokens only, sandbox from day one. **A7-7** Buyers get their own gate class (order-scoped, masking, guest-token rules); Customers-as-CRM is a future read model, not an Orders aggregate. **A7-8** New-order merchant tasks appear at `confirmed`, never `placed` — merchants see certainty, not noise. **A7-9** `orders.order.confirmed` is the first-sale Signature Moment trigger; promise-at-risk consumption opens the first production Recovery Journey. **A7-10** Buyer-facing words are R2 forever, for every AI capability.

---

*ADR-007 in one sentence: a cart that promises nothing, a checkout that can survive any failure exactly once, and an order that never changes — only gathers the true story of how a promise was kept.*
