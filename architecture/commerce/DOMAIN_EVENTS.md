# DOF Commerce Foundation — DOMAIN_EVENTS

**Status:** Blueprint for Founder Review · v1.0 · 2026-07-25 · The complete commerce event catalog. Names marked **frozen** are ADR-003 §7 taxonomy or already-ratified additions; **additive** names must be registered before first emission (additive-only law). Payloads are producer-owned, registry-locked (M-6), PII-free, amounts in minor units, refs by value.

---

## 1. Orders

| Event | Status | Consumers | Notes |
|---|---|---|---|
| `orders.cart.abandoned` | frozen | future recovery flows, Analytics | 30d quiet clock; carries cart ref + store ref, no lines |
| `orders.order.placed` | frozen | Notification (buyer confirmation), Analytics | merchant hears nothing (A7-8) |
| `orders.order.confirmed` | frozen | Merchant Pulse (the new-order task), Notification, **Moment Ledger (first-sale Signature Moment, A7-9)**, Analytics | money + stock certain |
| `orders.order.payment_failed` | additive (ADR-007 §13) | Notification (buyer retry) | retry window opened |
| `orders.order.fulfillment_requested` | additive | Analytics | cases opened; Operations has its own case events |
| `orders.order.partially_fulfilled` | additive | Notification, Analytics | per-line honesty |
| `orders.order.fulfilled` | frozen | Notification, Trust projection (on-time facts) | |
| `orders.order.completed` | additive | Trust projection (promise-kept, repeat-buyer), Community (review prompt, future) | delivery + return window elapsed |
| `orders.order.cancelled` | frozen | Notification, Payments (void/refund cause), Analytics | scoped payload when per-line |
| `orders.order.returned` | frozen | Analytics, Trust projection | appended at resolution landing |

## 2. Payments

| Event | Status | Consumers | Notes |
|---|---|---|---|
| `payments.authorization.{succeeded,failed}` | additive (ADR-008 §13) | Orders (attempt progression) | |
| `payments.charge.{succeeded,failed}` | frozen | Orders timeline, Merchant balance views, Analytics | charge = capture fact |
| `payments.refund.issued` | frozen | Operations (case settlement, CDC-001 §2.3), Orders timeline, Notification | keyed by cause ref |
| `payments.refund.settled` | additive | reconciliation views | |
| `payments.escrow.{held,released}` | frozen | Merchant balance views, Notification (release = a trust moment) | |
| `payments.payout.{scheduled,completed,blocked}` | frozen | Merchant views, Notification | `blocked` educates (names the fix) |
| `payments.dispute.{opened,submitted,resolved}` | additive | Merchant Pulse (deadline task), Administration | the sanctioned urgency |

## 3. Operations (frozen integration set, consumed by commerce)

`operations.reservation.expired` · `operations.fulfillment.{ready,collected,granted,completed,closed,exception}` · `shipping.shipment.{in_transit,delivered,exception}` · `operations.shipment.promise_at_risk` · `operations.return.{authorized,received,resolved}` · `operations.oversold_detected` — all per ADR-006 §98/CDC-001; Orders and Payments consume via delivery-ledgered consumers.

## 4. Events challenged and rejected (the discipline record)

| Proposed (brief) | Verdict | Why |
|---|---|---|
| `cart.created` | rejected | Noise: a cart with one glance is not a business fact; `cart.abandoned` is the only cart fact with consumers |
| `cart.item_added/removed` | rejected | Interaction telemetry, not domain events; Analytics reads read models |
| `checkout.started` | rejected | Saga-internal; the step ledger is queryable state, not platform fact. Emitting it invites consumers to couple to saga internals |
| `payment.authorized` (order-level) | rejected as duplicate | The authorization is a Payments fact (`payments.authorization.succeeded`); Orders' own progression fact is `placed`/`confirmed` — one fact per owner |
| `order.updated` | rejected forever | The order never updates (O1); there is no generic mutation to announce |
| `shipment.created` | absorbed | Operations' case/shipment events already carry it; Orders re-emitting would violate one-fact-one-owner |
| `inventory.reserved` | rejected as integration event | Reservation *grants* are synchronous command results; only `expired` is a platform fact (the async truth consumers must hear) |

**The test applied to every name:** (1) is it a business fact someone outside the producer must react to? (2) is the producer the owner of that truth? (3) does it stay true forever once emitted? Fail any → not an event.

## 5. Notification matrix (the seam's contract — §5.4)

| Event | Buyer hears | Merchant hears |
|---|---|---|
| `order.placed` | confirmation email (receipt, timeline link, guest lookup token) | — |
| `order.confirmed` | — (already confirmed) | Pulse task; optional email per preference |
| `order.payment_failed` | honest retry email | — |
| `partially_fulfilled` / `fulfilled` | "on its way" with tracking + per-line honesty | — |
| `order.cancelled` | confirmation + money-back statement | Pulse note when buyer-initiated |
| `refund.issued` | "€X back on your Visa" | balance note |
| `escrow.released` / `payout.*` | — | the money moments (release is celebratory; blocked educates) |
| `dispute.opened` | — | the deadline task (sanctioned urgency) |
| `return.authorized` | RMA + instructions | — |
| `promise_at_risk` | *nothing automatic* — R2: merchant signs the proactive note | drafted disclosure proposal |

All copy in merchant/buyer language (never system terminology); every message answers "what happened, what happens next, what can I do."
