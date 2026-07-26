# DOF Commerce Foundation — PAYMENT_REALITY_REVIEW

**Status:** For Founder Review · v1.0 · 2026-07-26 · Scope: the payment/capture/hold contradiction only. Verified against official Stripe documentation on 2026-07-26 (docs.stripe.com; no API version pinned yet — pinning happens at C4 with the first integration commit; every fact below must be re-verified against the pinned version then).

---

## 1. The contradiction, stated plainly

The blueprint (and ADR-007 A7-6) prescribed **capture-on-fulfillment**: authorize at checkout, "capture line-proportional amount on each fulfillment event." Verified Stripe reality:

1. **Authorization windows are short.** Card-not-present: Visa **7 days** customer-initiated (**5 days** merchant-initiated), Mastercard/Amex/Discover **7 days**. On expiry, "the funds are released and the payment status changes to `canceled`."
2. **One capture per PaymentIntent.** "You can only perform one capture on an authorized payment for most payments. If you partially capture a payment, you can't perform another capture for the difference." — the per-fulfillment-event capture rule is **not implementable** on standard rails.
3. **The escape hatches are gated.** Extended authorization (30 days) and multicapture (up to 50 captures) both require **IC+ pricing** (or a support-granted exception), specific networks, and signal per-card availability at runtime (`extended_authorization.status`, `multicapture.status`) — a policy that only sometimes applies is not a launch policy. Multicapture "only supports online card payments" — wallet coverage is not guaranteed.
4. **Fulfillment routinely exceeds 5–7 days.** Made-to-order (Rosa knits the blanket), preorders, merchant processing delays, split shipments where the second parcel ships in week 3 — the street's actual merchants are exactly the ones that break a 7-day capture deadline.
5. **Destination charges don't hold money on the platform.** "The full charge amount is immediately transferred from the platform to the `transfer_data[destination]` account after the charge is captured." There is no platform-held pool; the blueprint's implication that `merchant_held` maps to money sitting with DOF was wrong.
6. **Refund/dispute gravity points at the platform.** Refunds by default leave the connected account whole "leaving the platform account to cover the negative balance" (unless `reverse_transfer=true`); disputes: "Stripe debits dispute amounts and fees from your platform account."

**Conclusion:** capture-on-fulfillment is rejected for launch. The question becomes *when to capture once*, and *how to keep the buyer-protection and merchant-hold promises using instruments Stripe actually provides*.

## 2. Fulfillment-timing reality model (the honest table)

| Fulfillment shape | Typical time to ship/grant | Inside 5-day window? | Verdict under capture-on-fulfillment |
|---|---|---|---|
| Ready-to-ship physical | 0–3 days | usually | works, sometimes races the window |
| Made-to-order | 1–6 weeks | **no** | broken |
| Preorder / awaiting stock | weeks–months | **no** | broken |
| Merchant delay (life happens) | unbounded | **no** | broken at the worst moment |
| Split shipment (2nd parcel) | days–weeks later | **no** (and needs a 2nd capture — impossible) | broken twice |
| Digital / service grant | instant–days | yes | works |

A policy that works only for the top and bottom rows is not a policy. **What happens when expected fulfillment exceeds authorization expiry must never be "the merchant loses the sale" or "we silently charge early."**

## 3. Capture policy options evaluated

See PAYMENT_POLICY_DECISION.md for the full option-by-option analysis (buyer experience, merchant experience, Stripe compatibility, split shipments, cancellation, refunds, liquidity, disputes, complexity, reversibility, method limitations) and the single recommended launch policy: **Option A — capture-at-confirmation with ledger-held entitlement and payout-hold release.**

## 4. What survives unchanged

The saga shape (authorize inside checkout, order written before money is captured), the idempotency spine, the honest last-unit re-offer (it lands **before capture** and uses the one partial capture legally available if a line falls through), the double-entry ledger requirement, the refund choreography, dispute aggregates, and the TaxPort are all untouched. The change is confined to **when the single capture happens and what "held" means** — enumerated exhaustively in COMMERCE_BLUEPRINT_AMENDMENT_001.md.

## 5. Facts register (for the pinned-version re-verification at C4)

| Fact | Value verified 2026-07-26 | Source page |
|---|---|---|
| CNP auth validity | Visa 7d CIT / 5d MIT; MC/Amex/Discover 7d | payments/place-a-hold-on-a-payment-method |
| Capture count | one; partial capture releases remainder | same |
| Extended auth | 30d; **IC+ required**; per-card `capture_before`/status signaling; not Link | payments/extended-authorization |
| Multicapture | up to 50+1 captures; **IC+ required**; online cards only; per-card status | payments/multicapture |
| Destination charge funds | full amount → connected account at capture; app fee → platform; platform pays Stripe fee | connect/destination-charges |
| Refund default | connected account keeps funds; platform negative; `reverse_transfer=true` reverses proportionally; `refund_application_fee` optional | same |
| Disputes | debit platform account + fee; recover via transfer reversal; `debit_negative_balances` | same |
| Cross-border | different region ⇒ `on_behalf_of` required ⇒ settlement in connected account's country/currency | same |
| Payout control | platform-controlled schedule incl. `manual` + Payouts API, **requires platform-owned fraud/dispute liability**; `delay_days` up to 31; no stated max hold at `manual` | connect/manage-payout-schedule |
