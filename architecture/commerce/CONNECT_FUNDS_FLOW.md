# DOF Commerce Foundation — CONNECT_FUNDS_FLOW

**Status:** For Founder Review · v1.0 · 2026-07-26 · The exact Stripe-side money movement under the recommended policy (Option A), and the ledger identity that makes DOF's story and Stripe's story provably the same story.

---

## 1. The happy path, cent by cent (€50.00 order, 10% platform fee illustration — fee VALUE is a founder decision, not architecture)

| Step | Stripe reality | DOF ledger posting (balanced) |
|---|---|---|
| Authorize (checkout) | PaymentIntent `requires_capture`, destination=`acct_merchant`, `application_fee_amount=500` | none — no money moved; intent fact only |
| Capture (at `confirmed`) | €50.00 charged; **full €50.00 → connected account balance**; €5.00 app fee → platform balance; Stripe fee (e.g. €1.75) debited from **platform** balance | `psp_clearing → merchant_holding 4500` · `psp_clearing → platform_fees 500` · `platform_fees → psp_fee_expense 175` |
| Fulfillment evidence (per line group) | nothing moves at Stripe | `merchant_holding → merchant_payable` (line-proportional) |
| Payout sweep | Payouts API (as connected account) pays out ≤ `merchant_payable` | `merchant_payable → paid_out` |

**The reconciliation identity (checked by `check:ledger` and daily reconciliation):**
`Stripe connected-account balance = merchant_holding + merchant_payable (pending payout)` — the two systems can never tell contradictory stories because the ledger's job is to sub-divide *exactly the money Stripe says the merchant has* into evidence states Stripe doesn't model. DOF's ledger never claims money is anywhere Stripe disagrees with.

## 2. Refunds

- Refund created with **`reverse_transfer=true`** (proportional pull-back from the connected account) and `refund_application_fee` per fee policy (founder decision: default **true** — DOF does not profit from a failed sale).
- Ledger: reverse postings against `merchant_holding` first, then `merchant_payable` (evidence-order fairness); app-fee reversal against `platform_fees`.
- **If the merchant balance is insufficient** (already paid out): Stripe attempts external-account debit when `debit_negative_balances=true` (set at onboarding); residual failures are platform liability — which is precisely why payout release follows evidence, making this window structurally small.

## 3. Disputes / chargebacks

Stripe rule (verified): "For destination charges, with or without `on_behalf_of`, Stripe debits dispute amounts and fees from your platform account." DOF's model:
- `charge.dispute.created` webhook → Dispute aggregate opens → ledger posts `dispute_reserve` against the merchant's entitlement (`merchant_holding`/`merchant_payable`), freezing payout of the disputed amount.
- Recovery: transfer reversal to repay the platform — executed on dispute **loss** (per Stripe's cross-border guidance: reversing early can be unrepayable); on win, the reserve releases.
- Net platform exposure = disputed amounts on already-paid-out orders — bounded by the payout-hold window.

## 4. Cross-border

Launch posture: **platform and merchants in the same region (EU)**, avoiding the `on_behalf_of` requirement entirely. When cross-region merchants arrive: destination charges with `on_behalf_of` (settlement in the merchant's country/currency; their descriptor on statements) — a per-merchant routing flag, not a redesign. The multi-currency question stays with the deferred O2-3 ADR.

## 5. Onboarding & operability (the payment-operability decisions)

| Question | Decision |
|---|---|
| Account configuration | Connect **controller configuration: platform owns fraud & dispute liability + Stripe-hosted dashboard access none/Express** — required for payout-schedule control (verified: platforms controlling payout timing must own liability). Recorded consequence: DOF carries the liability the hold model manages |
| Onboarding UI | **Stripe-hosted onboarding** (account links) at launch — compliance-maintained by Stripe, matches Ignite's "four minutes" spirit; embedded components later if evidence demands |
| Capability gates | `charges_enabled` gates checkout availability per store (a store without it shows the shelf but not "buy" — honest copy); `payouts_enabled` + the DOF trust ladder gate payout sweeps (PO2 unchanged) |
| Merchant can't receive payments | checkout stays off for that store; the workspace explains exactly what Stripe needs (requirements from the account object), in merchant language |
| Negative balance responsibility | `debit_negative_balances=true`; residual = platform (bounded by hold window); reconciliation surfaces every negative-balance event loudly |
| Refund/dispute responsibility | Platform executes (verified Stripe rule); merchant economic responsibility enforced via reversals + holds; the decision cards make the consequence math visible before the merchant decides |
| Account closure with open orders/balance | Blocked by policy: closure requires no open orders and zero entitlement balances; forced closures (Stripe-side) park entitlements in the ledger and open an Administration case |

## 6. Liquidity & reserve posture

DOF fronts nothing on the happy path. Platform cash exposure exists only for: Stripe fees (recouped from app fees), refunds/disputes on paid-out orders (bounded by the hold window), and negative-balance residuals. The payout-hold window is therefore DOF's **only tunable reserve dial** — set per merchant trust level (the existing ladder), never below dispute-statistics-informed floors once data exists.
