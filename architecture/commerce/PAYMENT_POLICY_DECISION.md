# DOF Commerce Foundation — PAYMENT_POLICY_DECISION

**Status:** For Founder Review · v1.0 · 2026-07-26 · The capture-policy options, evaluated on the founder's eleven dimensions, with exactly one recommendation.

---

## Option A — Capture full at confirmation; hold entitlement in the DOF ledger; release payout eligibility on fulfillment evidence  ⭐ RECOMMENDED

| Dimension | Assessment |
|---|---|
| Buyer experience | Charged at purchase — the universal e-commerce norm (Shopify default behavior); one charge, one receipt; refunds arrive fast and honestly narrated. The subtle loss vs capture-on-ship ("card charged only when it ships") is a norm nobody expects; the gain is no auth-expiry cancellations ever |
| Merchant experience | Sale is money the moment it's confirmed (balance visible immediately); payout arrives when fulfillment evidence lands — the incentive story writes itself ("ship it, get paid") |
| Stripe compatibility | **Universal.** One capture, minutes after authorization, on every method (cards, Apple Pay, Google Pay, Link); no IC+, no per-card eligibility branching |
| Split shipments | Trivial — money already captured; per-line payout release as each parcel ships |
| Cancellation | Pre-fulfillment cancel = refund (not void). Money moved and comes back — honest copy handles it; commit-race line-drop **before capture** uses the one legal partial capture (charge only what survived) |
| Refunds | Partial refunds universally supported; `reverse_transfer=true` keeps the merchant's balance honest |
| Platform liquidity exposure | Lowest of all options: funds sit in the *connected account* balance under payout hold — DOF never fronts money; the hold IS the risk reserve for refunds/disputes |
| Dispute exposure | Disputes debit the platform (Stripe rule, all options equal) — but held balances make recovery-by-reversal reliable for unfulfilled orders, the highest-risk class |
| Implementation complexity | Lowest: no capture scheduler racing auth clocks, no reauth journeys, no per-card eligibility branches |
| Reversibility | High: moving later to capture-on-ready (Option C) for eligible merchants, or per-card extended-auth upgrades, are policy changes on the same intent lifecycle |
| Method limitations | None for the launch set — this is the only option with a clean row in the support matrix |

## Option B — Authorize at checkout; capture once before expiry; hold internally
A worse Option A: it keeps a capture scheduler racing per-network auth clocks (5 vs 7 days, MIT vs CIT) purely to delay the norm-consistent charge by a few days, and still fails made-to-order (capture fires before the blanket is knitted anyway — same money timing as A with more machinery). Buyer sees a charge days after purchase (confusing); cancellation before capture is a void (marginal win). **Rejected: all of A's outcomes, more failure modes.**

## Option C — Capture once when the entire physical order is ready; reauthorization journey on expiry
The purest buyer-protection story, and the most operationally hostile: made-to-order/preorders guarantee expiry → "reauthorization journeys" = emailing buyers to re-approve payment (abandonment, support burden, revenue loss at the merchant's worst moment); split shipments force one capture at *last*-ready (merchant ships parcel 1 unpaid) or impossible multicapture; whole-order-ready is exactly wrong for the street's makers. **Rejected for launch; viable later as an opt-in for ready-to-ship merchants (reversibility of A allows this).**

## Option D — Separate PaymentIntents per fulfillment group
Multiple pending charges per checkout (buyer confusion, N× decline surface, partial-success carts needing cross-intent compensation), N× fees, N× disputes, and the auth-expiry problem returns *per group*. Amazon can charge-per-shipment because it captures at ship on enterprise rails DOF doesn't have. **Rejected: maximal complexity, minimal benefit at DOF's scale.**

## Option E — Stronger alternative considered: separate charges & transfers (platform holds funds, transfers on fulfillment)
Charge lands on the *platform* balance; DOF transfers to merchants on fulfillment evidence. Real hold semantics, but: DOF becomes the money pool (regulatory posture worsens — closer to money transmission), cross-border transfer corridors constrain which merchant countries work, `source_transaction` interactions limit tooling, and platform liquidity absorbs every refund/dispute with no merchant-side reserve. Stripe's own guidance points marketplaces with per-sale sellers at destination charges + payout control. **Rejected as default; retained as the named fallback if payout-hold proves insufficient for a merchant class (the ledger does not change either way — that is the point of the ledger).**

---

## THE DECISION (recommended to the Founder)

**Launch policy: Option A.**

1. Authorize at checkout (manual capture) — the saga unchanged.
2. **Capture the full surviving amount at `confirmed`** (after reservation commit; minutes after auth; one capture, partial only when the commit-race dropped a line).
3. Destination charge with `application_fee_amount`; funds land in the merchant's connected account balance.
4. **Payout hold**: connected accounts run platform-controlled payout schedules (requires platform-owned fraud/dispute liability — an onboarding-configuration consequence, see CONNECT_FUNDS_FLOW.md §5); the DOF ledger splits merchant entitlement into `merchant_payable` (fulfillment-evidenced, payout-eligible) and `merchant_holding` (captured, awaiting evidence). Payouts sweep only `merchant_payable`.
5. Buyer-protection promise, restated honestly: *"you are charged at purchase; if it doesn't ship, the refund is automatic and fast"* — enforced by an aging policy: confirmed orders with no fulfillment evidence by promise-date + grace escalate to a Recovery Journey and an auto-refund decision path.
6. Digital/service: identical policy (capture at confirmation; grant usually beats the capture anyway).

This keeps every constitutional promise (buyer protection, merchant hold, honest re-offer, ledger truth) using only universally available Stripe primitives. ADR-007 A7-6 and ADR-008's capture rows are amended accordingly (COMMERCE_BLUEPRINT_AMENDMENT_001.md).
