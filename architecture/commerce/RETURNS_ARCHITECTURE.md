# DOF Commerce Foundation — RETURNS_ARCHITECTURE

**Status:** Blueprint for Founder Review · v1.0 · 2026-07-25 · Returns execution is **Operations-owned** (ReturnCase, ADR-006/BLUEPRINT-003); the money is Payments' (CDC-001 §2.3, frozen choreography); the order link is Orders'. This document specifies the composed journey.

---

## 1. Principles

- **Returns append, never rewind** (ADR-007 R-f): the order stays `completed`; the return is a linked case + timeline facts.
- **Generosity bias** (RT1): the policy window is a default, not a wall — the merchant override is one tap toward the buyer, and the fair-judge decision card presents consequence math, not friction.
- **The decision IS the approval:** when a merchant resolves a return (or the auto-approve window applies), no second confirmation exists anywhere — the resolution event carries the refund intent (choreography, never orchestration).

## 2. The journey

| Stage | Buyer sees | Merchant sees | System truth |
|---|---|---|---|
| **Request** | "Send it back" on delivered lines, within window (`CanInitiateReturn`) — reason, optional comment/photo | nothing yet | Orders: `OpenReturnCase(orderRef, lines, reasonCode, buyerComment?)` (idempotent by orderRef+line set); link recorded |
| **Authorized** | RMA + instructions (+ label when carrier tier active) | a decision card if outside auto-approve policy; else silent | ReturnCase `requested → authorized`; `operations.return.authorized` |
| **In transit / received** | honest tracking of *their* shipment | "arriving" on the case | `operations.return.received` |
| **Inspection** | "checking it over" (narrated waiting) | Inspection entity: condition, disposition (restock / damaged / discard) — stock ledger consequences are Operations' business, never blocking money (CDC-001 forbidden list) | case facts |
| **Resolution** | refund confirmation with amount + tender ("back on your Visa") | done; consequence math recorded | `operations.return.resolved{intent: refund, amountMinor}` → Payments executes → `payments.refund.issued{returnCaseId}` → Operations records settlement; Orders appends → `orders.order.returned` |

## 3. Partial returns

First-class by construction: ReturnCase lines are a subset of order lines; the refund amount is line-proportional (unit price + line-proportional shipping per policy; tax reversal follows the TaxPort's finalized lines). Multiple sequential return cases per order are legal; `RefundWithinBounds` (O4/P2) caps the lifetime total in both domains independently.

## 4. Declines & disputes

A declined return is a decision with a reason the buyer can read (UX-BIBLE honesty), appended to the timeline. Escalation is not a returns feature: a buyer who disputes at their bank triggers the Payments Dispute aggregate (ADR-008), where the return record becomes evidence — the domains stay in their lanes.

## 5. Refund without return

Cancellation refunds (pre-fulfillment) and goodwill refunds (merchant-initiated, cause-typed `goodwill`) use the same Payments Refund aggregate directly from Orders decisions — no fake ReturnCase is ever created. One money path, several honest causes.

## 6. Exchange (future seam, structure named now)

An exchange = **a resolution kind that links a new order** (`operations.return.resolved{intent: exchange}` → Orders places a zero-or-difference-priced linked order through the normal placement path) — the old order never mutates, the new order is a first-class order, and the refund/charge difference is a normal money fact. Nothing ships in v1; the resolution enum and the order-link field are reserved so arrival is additive.

## 7. Failure modes

| Failure | Behavior |
|---|---|
| Buyer never ships the return | case ages → auto-close policy (merchant-visible), no refund, honest copy |
| Refund execution fails | Payments Refund `failed` + loud task; case stays `resolved/awaiting settlement` — money never silently stuck |
| Duplicate resolution event | delivery ledger idempotency; one refund per case (refund keyed by returnCaseId) |
| Merchant disputes condition | disposition is theirs (restock vs damaged); the *money* decision is still theirs via the decision card — DOF provides consequence math, not judgment |
