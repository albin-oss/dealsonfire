# DOF Commerce Foundation — UPDATED_PAYMENT_LIFECYCLE

**Status:** For Founder Review · v1.0 · 2026-07-26 · **Supersedes PAYMENT_LIFECYCLE.md** (kept in place for the amendment diff). Realizes ADR-008 under the corrected capture policy (PAYMENT_POLICY_DECISION.md Option A) and the verified Connect funds flow.

---

## 1. Stripe integration shape (corrected)

- Stripe **Connect, destination charges + `application_fee_amount`**; launch region EU = merchant region (no `on_behalf_of` at launch; the flag is the cross-border seam).
- Connected accounts: **controller configuration with platform-owned fraud & dispute liability** and **platform-controlled payout schedule** (the hold mechanism) — Stripe-hosted onboarding via account links; `debit_negative_balances=true`.
- **PaymentIntents, `capture_method: manual`** — authorize inside the checkout saga; **one capture of the full surviving amount at order `confirmed`** (minutes later; partial only when the commit-race dropped a line — the single partial capture Stripe permits, remainder auto-released).
- **No capture ever waits on fulfillment.** Fulfillment evidence drives **entitlement release** in the DOF ledger (`merchant_holding → merchant_payable`) and payout sweeps — never Stripe captures.
- Hosted Payment Element (SAQ-A); webhooks signature-verified, event-id-ledgered, per-intent FIFO; sandbox twin adapter for every test lane. All unchanged from the original document.

## 2. Intent lifecycle mapping (unchanged states, corrected timing)

| DOF intent state | Stripe reality | When |
|---|---|---|
| `created` | PI created (destination, app fee, manual, idempotency `attemptKey:intent`) | checkout step 3 |
| `authorized` | `requires_capture` | checkout, pre-place |
| `requires_action` | 3DS | checkout, buyer completes |
| `captured` → `fully_captured` | **one capture at order `confirmed`** (`amount_to_capture` = surviving total; key `attemptKey:capture:1`) | minutes after placement |
| `voided` | PI canceled | attempt compensation, or cancel-before-confirm |
| `failed` | terminal decline / auth expiry (7d safety net — should never fire; alarms if it does) | exception |

The intent timeline, ledger postings on capture/refund/dispute facts, and P1–P4 invariants are unchanged from ADR-008.

## 3. The ledger accounts (renamed for truth — see AMENDMENT §3)

`psp_clearing` · `merchant_holding(business)` *(captured, in the merchant's connected balance, awaiting fulfillment evidence — formerly conflated with "escrow")* · `merchant_payable(business)` *(evidence landed; payout-eligible — formerly `merchant_available`)* · `platform_fees` · `psp_fee_expense` · `refund_liability` · `dispute_reserve` · future `buyer_credit(buyer)`.

**Reconciliation identity:** Stripe connected-account balance ≡ `merchant_holding + merchant_payable` (pending payout) per business. L1–L3 unchanged.

## 4. The money story (corrected stage table)

| Stage | Buyer | Merchant | Domain behavior | Events |
|---|---|---|---|---|
| Authorize | pay sheet, instant yes/no | nothing | PI authorize under attempt key | `payments.authorization.{succeeded,failed}` |
| **Capture at `confirmed`** | charge appears now (purchase-time — the norm) | "€45.00 from your first sale is in" | one capture; postings: `psp_clearing → merchant_holding + platform_fees` | `payments.charge.succeeded` + `payments.hold.opened` |
| Fulfillment evidence | — | "€30.10 released — payout Friday" | `merchant_holding → merchant_payable` per line group | `payments.hold.released` (scoped) |
| Payout | — | money arrives; blocked payouts explain themselves | Payouts API sweep of `merchant_payable`; trust-gated (PO2) | `payments.payout.{scheduled,completed,blocked}` |
| Refund | fast, honest, original tender | consequence math was shown at decision | refund + `reverse_transfer=true` (+ fee policy); holding-first reversal order | `payments.refund.issued/settled` |
| Dispute | (their bank) | deadline task, evidence 80% assembled | `dispute_reserve` freeze; reversal on loss only | `payments.dispute.*` |
| No-ship aging | auto-refund path before anger | Recovery Journey first | promise-date + grace → escalation → refund decision | *(consumes `promise_at_risk`)* |

## 5. Event taxonomy delta

`payments.escrow.{held,released}` (frozen names, never emitted) are **retired before first emission** and replaced by `payments.hold.{opened,released}` — the additive-only law is satisfied because zero consumers exist; the rename is recorded in AMENDMENT §4. All other events unchanged.

## 6. Failure modes (delta only)

| Failure | Behavior |
|---|---|
| Capture fails at `confirmed` (rare: post-auth decline) | order → `payment_pending`; retry window on the same intent; then `payment_failed` → auto-cancel + release (unchanged path, now the *only* capture-failure surface) |
| Auth nears 7d uncaptured (should be impossible — capture is minutes after auth) | alarm + forced resolution; this is a bug detector, not a workflow |
| Refund exceeds merchant balance (post-payout) | Stripe external-account debit (`debit_negative_balances`); residual → platform liability record + Administration case (loud) |
| Payout sweep exceeds `merchant_payable` | impossible by construction (PO1 against the ledger, checked against Stripe balance before sweep) |

Sections not repeated here (webhook pipeline, idempotency derivation, reconciliation cadence, "what Payments will never do") stand as written in PAYMENT_LIFECYCLE.md, unmodified by this correction.

## 7. The two-phase provider boundary (RM-C2 amendment — WRITTEN LAW as of the Real Money Readiness Review)

No Stripe network request may run while a database transaction or row lock is open. The sandbox twin's zero latency hid this; real latency (300ms–30s) held locks on orders, intents, and stock. Every provider-touching operation follows one shape:

1. **Phase 1 — record intent-to-act** in a short transaction: a `provider_operations` journal row (operation kind, target, amount, the stable idempotency key derived from the domain cause — `{intent}:refund:{causeKey}`, `{attemptKey}:intent`, etc.), state `pending`.
2. **Phase 2 — call the provider outside every transaction**, under that stable key. The key makes retries converge on the provider side no matter how many times phase 2 runs.
3. **Phase 3 — record the outcome** in a second short transaction: journal row → `succeeded`/`failed` + the domain facts/ledger postings that the outcome justifies.

**Recovery sweep:** a cron lane re-drives any journal row stuck in `pending` past a grace window — re-running phase 2 (idempotent) and completing phase 3. A crash between phases 2 and 3 therefore converges instead of drifting; external reconciliation (§C10 slice 4) is the final tripwire for anything the sweep cannot see.

Domain decisions (cancel, return, keystone refund) keep their atomicity by *sequencing*, not by wrapping: decide → phase 1 → commit decision tx → phases 2/3 → outcome facts. A provider failure after a committed decision is an *operational* state (journal row failed, alarm raised, sweep retries), never a silent rollback of money that already moved.

## 8. Element correction (C10 as-built — supersedes the authorize rows above)

Real Stripe made the authorization a TWO-ACTOR act, and the tables above read
accordingly:

- The checkout saga **creates** the intent (born `requires_action`, fact
  `created`) — it never authorizes. The BUYER'S BROWSER authorizes by
  confirming in the Payment Element (SAQ-A: card data never transits DOF).
- `authorized` is recorded when the provider says so — webhook
  (`payment_intent.amount_capturable_updated`) or the client's return, either
  order, both idempotent (`completeClientAuthorization`, row-locked flip).
- Capture still happens ONCE at system order confirmation (unchanged); the
  application fee joins at capture on the captured amount.
- The sandbox twin mirrors this flow under `NUXT_SANDBOX_CLIENT_CONFIRMATION=1`;
  without it the twin authorizes instantly (the pre-C10 test shape).

Validated against real Stripe test mode (C10 certification): the settlement
currency of the platform account (e.g. CAD) differs from presentment (EUR) —
**balance transactions report settlement amounts**; reconciliation therefore
matches on the expanded source's presentment amount/currency, and chargeback
withdrawals (`adjustment` sourced by a dispute) match the dispute record.
