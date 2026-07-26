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
