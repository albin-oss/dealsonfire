# DOF Commerce Foundation — PAYMENT_LIFECYCLE

> ⚠️ **SUPERSEDED — do not implement from this document.**
> The capture-on-fulfillment policy described here was **rejected** by the
> Payment Reality Review (verified Stripe reality: one capture per intent,
> 5–7 day auth windows). The document of record is
> **UPDATED_PAYMENT_LIFECYCLE.md** (capture-at-confirmation, Option A).
> Kept unmodified below for the amendment diff (COMMERCE_BLUEPRINT_AMENDMENT_001).

**Status:** SUPERSEDED by UPDATED_PAYMENT_LIFECYCLE.md · originally: Blueprint for Founder Review · v1.0 · 2026-07-25 · ADR-008 conformed verbatim; this document is the **Stripe realization** of that constitution. Stripe specifics live in `domains/payments/providers/stripe/` and nowhere else (ACL law).

---

## 1. Stripe integration shape

- **Stripe Connect** (destination charges + application fees) from the first real charge — the marketplace money structure (A8-2) maps 1:1: destination charge → `psp_clearing → merchant_available/held + platform_fees` ledger legs.
- **Payment Intents with `capture_method: manual`** — authorize at checkout, capture on fulfillment milestones (ADR-007 capture policy). Physical: capture on first shipment-collected fact per capturable amount; digital/service: capture on grant.
- **Hosted payment fields (Payment Element)** — SAQ-A structurally (A8-4). DOF renders the element inside checkout; tokens only inward.
- **Webhooks** — signature-verified, ingested idempotently by Stripe event id, translated to internal facts, ordered per intent (partition key = intent id) before any domain logic.
- **Sandbox twin** — the `SandboxPspAdapter` (deterministic, failure-injectable) implements the same ports; every saga/ledger test runs on it; Stripe test-mode is a second CI lane, not the daily loop.

## 2. Intent lifecycle mapping (DOF ↔ Stripe)

| DOF PaymentIntent state | Stripe reality | Transition evidence |
|---|---|---|
| `created` | PaymentIntent created (amount, currency, `manual`, transfer_data.destination, application_fee_amount, idempotency key = `attemptKey:intent`) | sync response |
| `authorized` | status `requires_capture` | sync response or `payment_intent.amount_capturable_updated` |
| `requires_action` | status `requires_action` (3DS) | sync response; buyer completes in Element |
| `requires_review` | DOF risk pause (Stripe Radar signal → RiskAssessment) | internal decision; Administration case |
| `failed` | `payment_intent.payment_failed` / terminal decline | webhook or sync |
| `captured` (partial ok) | `payment_intent.succeeded` / capture responses | webhook `payment_intent.succeeded`, `charge.updated` |
| `voided` | `payment_intent.canceled` | sync (compensation) or webhook |
| `fully_captured` | all capturable amount captured | derived from facts |

Facts append to the intent timeline; the *ledger* posts only on capture/refund/dispute facts (money truth = moved money, not promises).

## 3. Idempotency derivation (the spine's payments segment)

```
attempt key (Orders)          → intent lookup/create        (P4: one intent per attempt, forever)
attemptKey:intent             → Stripe idempotency key      (create)
attemptKey:capture:<n>        → Stripe capture key          (per capture event n)
orderRef:refund:<refundId>    → Stripe refund key
Stripe event id               → webhook delivery ledger     (ingest exactly once)
```

A retried authorize after network loss returns the same Stripe PaymentIntent; a replayed webhook is a no-op; a re-run capture job cannot double-capture (P2 checked in-domain *and* Stripe rejects the reused key).

## 4. Webhook processing pipeline

```
receive → verify signature → insert (event_id) into provider_events [conflict: ack + stop]
        → translate to internal fact (no domain logic yet)
        → enqueue per-intent (FIFO by intent id)
        → apply: append fact → advance intent state machine → post ledger entries (LedgerPoster only)
        → outbox: emit payments.* domain events
```

Rules: acknowledge Stripe fast (< 2s) — apply is async behind the ledgered queue; unknown event types are recorded and ignored (forward-compatible); out-of-order per intent is impossible by queue construction; a poisoned event parks loudly (Administration-visible) without blocking other intents.

## 5. Capture policy (conformed) & the money postings

| Trigger | Capture | Ledger posting (balanced, L1) |
|---|---|---|
| `operations.fulfillment.collected` (physical lines) | capture line-proportional amount | `psp_clearing → merchant_available` (or `merchant_held` per EscrowPolicy) + `→ platform_fees` |
| digital/service grant | capture at grant | same |
| cancellation pre-capture | void (no capture) | none (nothing moved) |
| refund decision | Stripe refund (full/partial) | reversing postings, fee policy applied |
| dispute opened | — | `dispute_reserve` posting |
| payout schedule | Stripe transfer/payout via Connect | `merchant_available → (payout)` sweep |

Buyer-protective consequence: an order cancelled before shipment was **never charged** — only authorized. The honest re-offer (CHECKOUT_STATE_MACHINE §5) is free by construction.

## 6. Refunds

Full and partial, cause-typed (`return_case | cancellation | goodwill | dispute`), bounds-checked twice (P2 in Payments, O4 in Orders), executed leg-proportional (v1: one leg). Choreography for returns is CDC-001 §2.3 verbatim: `operations.return.resolved` (carries intent) → Payments executes → `payments.refund.issued{returnCaseId}` → Operations records settlement; Orders appends the fact to the timeline. Nobody calls anybody synchronously for money.

## 7. Reconciliation

Daily: Stripe balance transactions / payout reports ingested (`StatementPort`) → ReconciliationBatch matches provider facts to ledger entries → discrepancies become **loud first-class records** (never auto-adjusted; corrections are human reversing postings, A8-8). The `check:ledger` gate (L3 recompute) runs in CI from the first ledger increment — the treaty is never retrofitted (ADR-008 rec. 1).

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Stripe down at authorize | fail-closed; honest buyer copy; attempt resumable; reservations TTL out naturally |
| Capture fails post-fulfillment | retry with same key; alert after budget; order timeline shows honest "payment settling" |
| Webhook lag | intent state honest at last fact; buyer/merchant surfaces say "processing" (declared eventual consistency, ADR-008 §8) |
| Refund fails | Refund aggregate `failed` + loud task; money never silently stuck |
| Dispute deadline approaching | the sanctioned urgency: real-deadline Pulse task, evidence pre-assembled (A8-9) |

## 9. What Payments will never do

No charge API for other domains (Orders is the only money-moving caller, via the port). No PAN storage (no field exists). No AI-initiated financial action at any autonomy setting, forever (A8-10). No silent ledger corrections (A8-8). No fraud *judgment* — Risk pauses, Administration decides (A8-6).
