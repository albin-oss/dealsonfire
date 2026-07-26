# DOF Commerce Foundation — COMMERCE_BLUEPRINT_AMENDMENT_001

**Status:** For Founder Review · v1.0 · 2026-07-26 · The complete, exhaustive delta the Payment Reality Review applies to the approved blueprint. Migration impact: **zero** — no commerce code exists (C1/C2 carry no payment behavior).

---

## 1. Original statements changed

| # | Original (location) | Amended to | Reason |
|---|---|---|---|
| A1 | "capture-on-fulfillment default for physical; on-grant for digital" (ADR-007 §6, A7-6; PAYMENT_LIFECYCLE §1, §5; COMMERCE_ARCHITECTURE §2 table) | **One full capture at order `confirmed`**; fulfillment evidence releases ledger entitlement, never triggers captures | One capture per PI on standard rails; 5–7d auth windows vs weeks-long fulfillment; multicapture/extended-auth are IC+-gated per-card features (verified) |
| A2 | "capture line-proportional amount on each fulfillment event" (PAYMENT_LIFECYCLE §5) | Deleted; per-line money resolution happens via payout release and partial refunds | Not implementable (single capture rule) |
| A3 | "destination charges … map 1:1 to `merchant_available`/`merchant_held` ledger legs" (COMMERCE_ARCHITECTURE §5.5, PAYMENT_LIFECYCLE §1) | Destination charge lands the **full amount in the connected account balance**; the DOF ledger sub-divides that Stripe-side balance into `merchant_holding` / `merchant_payable`; the hold is enforced by **platform-controlled payout schedules**, not by money kept on the platform | Verified funds flow: "immediately transferred … after the charge is captured" |
| A4 | "Escrow = `merchant_held` postings … releases ride trust events" (ADR-008 A8-5 realization rows) | **The word "escrow" is retired from product and domain language.** DOF operates a **payout hold** (see §3); ADR-008's *structure* (a named balance state, trust-gated release) is preserved under truthful names. DOF does not provide regulated legal escrow and will not describe itself as doing so | Founder directive §5; legal accuracy; the mechanism that exists is payout-timing control over the merchant's own balance |
| A5 | "cancellation pre-fulfillment → void; buyer never charged" (implicit in capture-on-fulfillment narrative, CHECKOUT/ORDER docs' "money never moved" copy) | Cancel **before `confirmed`** → void (unchanged); cancel **after `confirmed`** → fast refund with honest copy ("your €45.00 is on its way back") | Capture now happens at confirmed |
| A6 | Capture triggers table row "`operations.fulfillment.collected` → capture line-proportional" (PAYMENT_LIFECYCLE §5) | `operations.fulfillment.collected`/grant facts → `payments.hold.released` postings (line-proportional entitlement) | A1 |
| A7 | Payout draws from `merchant_available` (ADR-008 PO1 naming) | Payout sweeps `merchant_payable` via the Payouts API acting as the connected account; PO1's *rule* (only evidenced funds pay out) unchanged | A3 renaming; verified payout-control mechanism |
| A8 | Onboarding unspecified beyond "Connect" | Controller config with **platform-owned fraud & dispute liability**, Stripe-hosted onboarding, `debit_negative_balances=true`, `charges_enabled` gating checkout per store, closure policy (CONNECT_FUNDS_FLOW §5) | Payout-schedule control requires platform liability (verified); operability gaps the founder named |

## 2. Affected increments (roadmap delta — IMPLEMENTATION_ROADMAP updated in place)

- **C1, C2:** untouched (no payment behavior) — proceeding under the standing authorization.
- **C3:** unchanged mechanically; the sandbox PaymentPort's capture semantics follow the new policy (capture at confirm, not at fulfillment) — *smaller*, since the sandbox no longer simulates fulfillment-triggered captures.
- **C4:** + onboarding shape (hosted account links, liability config, payout-schedule control) and the account-capability gates; + `psp_fee_expense` account; **pin the Stripe API version and re-verify the facts register**.
- **C5:** capture moves *into* this increment (at `confirmed`, with the partial-capture race branch); `payments.hold.opened` emission.
- **C6:** capture-on-fulfillment wiring **removed**; replaced by hold-release postings + `payments.hold.released` — *smaller*.
- **C8:** cancellation copy branches (void pre-confirm / refund post-confirm); `reverse_transfer` + fee-refund policy wiring.
- **C12:** "EscrowPolicy live" → **HoldPolicy live** (trust-tiered payout delay + release sweeps); adds the no-ship aging → auto-refund decision path; dispute reserve freeze semantics per CONNECT_FUNDS_FLOW §3.
- **C7, C9, C10, C11:** unaffected.

**Timeline:** C6 and C3 shrink; C4/C5 grow by roughly the same amount; net change ≈ 0. **The ~51-day estimate remains credible** (re-stated at the bottom of IMPLEMENTATION_ROADMAP.md).

## 3. Affected states, events, ledger accounts

- **Order states: none.** `payment_pending`/`payment_failed` now describe capture-at-confirm failures; the machine is untouched.
- **Intent states: none** (`captured`/`fully_captured` timing changes, not shape).
- **Events:** `payments.escrow.{held,released}` retired **before first emission** → `payments.hold.{opened,released}` (legal under additive-only law: zero consumers exist; the ADR-003 registry entry is corrected, recorded here).
- **Ledger accounts:** `merchant_available` → `merchant_payable`; `merchant_held` → `merchant_holding`; **new** `psp_fee_expense`. Double-entry law, L1–L3, recompute gate: unchanged.

## 4. Affected tests

None exist (no commerce code). Test *plans* affected: C3's storm harness drops fulfillment-capture scenarios; C5 gains capture-at-confirm + partial-capture-race contract tests; C4 gains the reconciliation identity test (`Stripe balance ≡ holding + payable`) and webhook fixtures for one-capture flows; C12 gains hold-release sweeps and no-ship aging tests.

## 5. Decisions confirmed without change

The authorize-inside-checkout saga and the whole idempotency spine · order immutability + timeline · reservation lifecycle and the honest last-unit re-offer (now explicitly *pre-capture*, strengthening it) · the double-entry ledger requirement and all L-invariants · Stripe adapter isolation (ACL) and the sandbox twin · webhook event-id ledger + per-intent FIFO · refund choreography (CDC-001 §2.3) · dispute aggregate + evidence assembly + sanctioned-urgency deadlines · TaxPort boundary · notification seam · payout trust-gating (PO2) · "no AI-initiated financial action, ever" (A8-10) · PCI SAQ-A posture · marketplace money structure from day one (A8-2 — *how* the hold works changed; *that* merchant balances, fees, and holds are first-class ledger truths did not).
