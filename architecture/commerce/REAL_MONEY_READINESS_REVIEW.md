# DOF Commerce Foundation — REAL MONEY READINESS REVIEW

**Status:** Founder-mandated final architectural checkpoint before C10 (real payment processing).
**Method:** Attack review. Ten hostile hats, no deference to prior reviews. Every finding cites the code that proves it — this reviews what IS, against what real money DOES.
**Baseline:** v1.39.0 (campaign C6–C9 merged; sandbox provider twin everywhere; zero real Stripe calls ever made).

The one-sentence verdict: **the money architecture inside DOF is sound and battle-tested; the seam where DOF meets Stripe has four launch-blocking gaps, all of them C10-shaped, none of them constitutional.**

---

## 1. Executive Summary

C4–C9 built and hostile-tested the *internal* truth of money: bounded idempotent refunds, balanced append-only ledger postings, the recompute identity, cause-keyed convergence under races, the payout hold that cannot be bypassed, and the keystone auto-refund with teeth. Twelve hostile scenarios converge. That half is ready.

What has never been exercised is the *boundary*: every provider call to date has hit the deterministic sandbox twin, which is instant, always-confirmed, and never lies. Real Stripe is slow, asynchronous, occasionally down, and legally entangled. The attack found **4 CRITICAL**, **6 HIGH**, and **5 MEDIUM** findings at that boundary. All four criticals are *implementation* gaps that C10 was always going to touch (client confirmation, transaction discipline, disputes, transfer-reversal wiring) — the review's contribution is to make them binding, precise, and test-specified rather than aspirational.

One item requires a Founder decision (dispute-loss allocation, RM-H6) because it is payout policy. It is flagged, a default is proposed, and it does not block the GO.

## 2. Launch Readiness Score

**6.5 / 10** — "architecture ready, boundary unbuilt."

| Dimension | Score | Note |
|---|---|---|
| Internal money truth (ledger, refunds, holds) | 9 | Proven under hostile tests; L1–L3 hold |
| Provider boundary (Element, webhooks, Connect) | 3 | Designed on paper (CONNECT_FUNDS_FLOW), unbuilt |
| Operations (alarms, runbooks, ops surfaces) | 7 | C9 surfaces strong; alerting delivery is stdout |
| Compliance posture (PCI, PII, audit) | 8 | SAQ-A by construction; retention schedule missing |
| Fraud & risk | 6 | Buyer-side strong (keystone); dispute side absent |

## 3. Critical Findings

### RM-C1 — No client confirmation exists; every real capture would fail
`StripeProviderAdapter.authorize()` creates a manual-capture PaymentIntent and returns (`payments.ts:77-89`). Nothing ever *confirms* it — there is no Payment Element, no client secret handed to the browser, no confirm call. Against real Stripe every intent sits in `requires_payment_method` forever and `capture()` (`payments.ts:90-99`) fails 100% of the time. The sandbox twin masks this because its authorize *is* its confirmation.
**Consequence if shipped as-is:** zero successful real payments, ever. Not a subtle bug — a structural inversion.
**C10 must:** create the intent at checkout, return `client_secret` to the buyer's browser, confirm in the Payment Element, and treat provider facts (webhook `payment_intent.amount_capturable_updated`) as the trigger that moves the order out of `payment_pending` — with the client's return redirect and the webhook both idempotently converging on the same confirmation (either may arrive first; C5's confirm saga is already idempotent, so the wiring is the work).

### RM-C2 — Provider network calls run inside open database transactions
`checkout.ts:187` authorizes on the checkout transaction (deliberately — PRR-C1 fixed a pool deadlock by moving *onto* the caller's tx). `capture` runs inside the confirm transaction; `refund` runs inside the C8 cancel-decision and C9 return-decision transactions while order rows are `FOR UPDATE`-locked. With the sandbox twin these are microseconds. With real Stripe they are 300ms–30s network calls **holding row locks on orders, intents, and stock** — the binding Real Stripe Gate explicitly forbids this.
The subtler poison: *provider-succeeds-then-tx-rolls-back*. A Stripe refund that lands, followed by a rollback (any later error in the decision transaction), leaves money moved at Stripe and no fact in our books. Per-operation idempotency keys (`{intent}:refund:{causeKey}`) make a *retry* converge — but nothing guarantees a retry happens, and nothing today would ever notice the drift (see RM-H1).
**C10 must:** adopt the two-phase boundary pattern for every provider call — (1) record intent-to-act inside a short tx, (2) call the provider outside any tx under the operation's idempotency key, (3) record the outcome in a second short tx; a sweeper re-drives phase-3 for any phase-2 that crashed. The refund/decision endpoints keep their atomicity by moving the provider call before the decision tx and passing the confirmed result in.

### RM-C3 — Chargebacks have no machinery at all
`charge.dispute.created` arriving tomorrow would be ingested as an inert `webhook` fact (`payments.ts:390-408`) — no ledger movement, no funds freeze, no timeline entry, no merchant letter, no operator alarm. The `dispute_reserve` ledger account exists in schema (`0020:121`) with **zero code paths touching it**. CONNECT_FUNDS_FLOW §3 designed this; nothing implements it. Disputes are a day-one certainty of real money, they arrive with a 7–21 day evidence deadline, and silence is how deadlines get missed.
**C10 must (minimum viable dispute handling):** ingest → freeze the order's unreleased hold (holding → dispute_reserve posting) → operator alarm (`/ops/alarms` gains a `dispute_open` kind — state-derived, like the others) → timeline note + merchant letter with the deadline stated. Evidence submission stays manual via the Stripe dashboard at this volume; *knowing in time* is the launch requirement.

### RM-C4 — Every real refund would error: `reverse_transfer` on transferless charges
`payments.ts:107-109` sends `reverse_transfer: true` unconditionally. That parameter is only valid for charges carrying a transfer (destination charges); today's adapter creates plain platform charges, and any pre-Connect or non-destination charge refunded against real Stripe throws `StripeInvalidRequestError` — so the keystone auto-refund, the C8 cancellation, and the C9 return would all fail on their first real order. Latent today only because the sandbox ignores the flag.
**C10 must:** set `reverse_transfer` (and `refund_application_fee`) from the charge's actual shape, and the C10 integration tests must cover refund-of-a-destination-charge and refund-of-a-plain-charge both.

## 4. High Findings

### RM-H1 — No external reconciliation
`recomputeCheck` (L3) proves our cached balances equal our entry sums — internal consistency only. Nothing compares the ledger's `psp_clearing` against Stripe's balance transactions and payouts. RM-C2's drift scenario, a missed webhook, or a Stripe-side adjustment would be invisible forever. **C10 must:** a daily reconciliation task (cron lane) that pulls Stripe balance transactions since the last watermark, matches them to payment facts by provider ref, and files unmatched items into the ops alarms queue. Finance answer to "does Stripe agree with us?" must be a query, not a shrug.

### RM-H2 — Failed orders never release the buyer's card authorization
The 24-hour honest-failure path (`confirm.ts:172-186`) marks `payment_failed`, cancels lines, alarms about stock — and never calls `void()`. Only checkout's compensation path voids (`checkout.ts:233`). With real cards, the authorization hold sits on the buyer's account for up to 7 more days after we told them "nothing more will be charged" — buyer-visible money frozen by an order we declared dead. **C10 must:** void the intent in the 24h fail path (via the RM-C2 boundary pattern) and add the expiring-authorization sweep: manual-capture card intents expire ~7 days; any order still pending near expiry must capture-or-void *deliberately*, never by provider timeout.

### RM-H3 — Alarms are stdout
Every keystone alarm — stage-3 refund failure, hold-release failure, payment-stuck — reaches `console.error` (`confirm.ts:52`). On serverless production, that is a log line nobody watches. The C9 `/ops/alarms` queue covers the state-derived ones *if an operator looks*. **C10 must:** the alarm callback also sends a letter through the existing MailPort to a configured ops address (`NUXT_OPS_ALARM_EMAIL`), and hold-release failures gain a state-derived row in `/ops/alarms` (currently the one alarm kind with no queue presence).

### RM-H4 — Connect account lifecycle: the review pins the required shape
Absent by design (it *is* C10), but the review binds the design so implementation cannot drift: Express accounts; **Stripe-hosted onboarding only** (no KYC data transits DOF — preserves both SAQ-A and the privacy posture); `charges_enabled == false` closes that store's checkout with honest street copy while the storefront stays visible; `payouts_enabled` gates payout *initiation only* — never hold release, which is fulfillment truth, not banking status; `account.updated` webhook maintains a capability snapshot per business (a small state table, not inference from cached API calls); restricted/disabled/rejected accounts converge to the same safe state: checkout closed, holds intact, buyer protection unaffected, merchant letter sent with Stripe's stated reason and remediation link. The marketplace continues operating around any one merchant's banking failure.

### RM-H5 — Negative merchant balances become real debt under payouts
The refund ledger clamps the *holding* leg but not the *payable* leg (`payments.ts:336-341`) — refund-after-release correctly drives `merchant_payable` negative. Sound accounting; but the moment C10 pays out, a negative payable is **platform-fronted money** with recovery risk. **C10 must:** payout initiation requires `payable > 0` net of any open disputes; negative balances offset against future earnings automatically; balances negative beyond a threshold/age surface in ops alarms. (Stripe `debit_negative_balances` handles its side; ours must match.)

### RM-H6 — Dispute-loss allocation is an undecided payout policy ⚑ FOUNDER DECISION
When a chargeback is lost after payout release, someone eats the loss. This is payout policy — a Founder gate item, deliberately surfaced here rather than discovered in an incident. **Proposed default:** the platform absorbs early-stage dispute losses (they will be rare and small at launch volume; merchant trust is worth more), the `dispute_reserve` account stays dormant until volume justifies a reserve policy, and the merchant agreement reserves the right to offset proven-fraud losses against payables. Approving C10 with this default, or amending it, is the one decision this review requires.

## 5. Medium Findings

- **RM-M1** — `provider_events` stores event id + type only, not the payload. For financial forensics ("what exactly did Stripe say at 03:12?"), store the event payload JSON. Stripe events carry no card PII; storage is cheap; auditability is not.
- **RM-M2** — Webhook correlation only recognizes `payment_intent` objects (`stripe.post.ts:36-37`). Charge, refund, dispute, and `account.updated` events won't correlate. C10 widens the mapping (charge → its intent; account events → the business's capability snapshot).
- **RM-M3** — PII retention is enforced for carts and attempts (PRR-M1 purges) but orders retain buyer contact indefinitely with no documented schedule. Legitimate (financial records), but write the retention schedule into the data manifest and add the data-subject-request procedure to the runbooks in C11 (accounts increment).
- **RM-M4** — The production clock is one serial cron tick doing six outbox lanes plus seven sweeps (`outbox-dispatch.ts`). Fine at launch; the N+1 `listCases` walks inside aging/hold sweeps are the first real scaling cost (see §Scaling). Not a launch blocker; is a 10k-merchant blocker.
- **RM-M5** — The API version is pinned (`2026-06-24.dahlia`) and the reverification ritual documented, but nothing checks incoming webhook `api_version` against the pin. Log a loud mismatch warning — the cheap tripwire for an unnoticed dashboard upgrade.

## 6. Immediate Fixes (pre-C10, small, this week)

1. RM-C4's conditional `reverse_transfer` — one-line guard, testable now against the sandbox.
2. RM-H2's missing `void()` in the 24h fail path — the twin supports void; test exists to write today.
3. RM-M5's api_version tripwire in the webhook handler.
4. RM-H3's alarm-to-MailPort routing — the port and letters idiom already exist; one afternoon.

Everything else is C10 scope proper.

## 7. Launch Gates (binding — C10 does not tag until all pass)

| # | Gate | Proven by |
|---|---|---|
| G1 | Payment Element confirmation round-trip: intent → client confirm → webhook fact → order confirmed | integration + one real test-mode order |
| G2 | No provider call inside any open DB transaction | boundary test + grep gate in `check:operations` |
| G3 | Webhook convergence: duplicate, delayed, out-of-order, replayed — same end state, money moves once | hostile integration suite |
| G4 | Refunds work against destination AND plain charges | test-mode refunds, both shapes |
| G5 | Dispute ingest → freeze → alarm → letter, inside deadline | injected dispute event test |
| G6 | Daily reconciliation matches a seeded week of Stripe test-mode activity with zero unmatched | reconciliation task test |
| G7 | `charges_enabled` gating: restricted account cannot take checkout; street presence intact; recovery path works | account lifecycle test |
| G8 | Failed/expired orders void their authorizations | 24h-path test |
| G9 | No real key ships until G1–G8 green; keys only via env; `dev-refuses-prod` extended to refuse live keys outside production | config gate |

## 8. Operational Readiness

**Strong:** C9 gave operators reconstruction-without-SQL, bounded audited refunds, the alarms queue, the note/ack pen; runbooks exist and are executable; every money primitive is idempotent so *retry* is always the safe operator move; the keystone runs unattended.
**Gaps:** alarm *delivery* (RM-H3); no dashboard beyond `/ops/alarms` (acceptable at launch — the queue plus Stripe's dashboard covers it; revisit at 1k merchants); disaster recovery documented for the app tier but the reconciliation task (RM-H1) is what makes DB-restore-after-incident *verifiable* against Stripe. Stripe outage posture is correct-by-architecture: checkout fails closed and honestly, webhooks retry for days, sweeps re-drive; add the outage runbook page stating exactly that so nobody improvises.

## 9. Security Readiness

Webhook signature verification fails closed (no secret → 503, bad sig → 400); replay attacks die on the `(provider, event_id)` unique constraint and the SDK's timestamp tolerance; no-keys-no-Stripe construction prevents accidental live calls; secrets live in env with the dev-refuses-prod gate; ops surfaces answer masked 404s to non-operators and every action is audited with actor; step-up auth exists for sensitive commands. **PCI: SAQ-A by construction** — card data never transits DOF (Element in the browser, hosted onboarding for KYC), and the C10 design keeps it that way; the review found no scope creep. Residual risks: account takeover of a merchant redirects nothing (payout destinations live inside Stripe's authenticated surface); recommend step-up on any future payout-affecting setting.

## 10. Financial Readiness

The ledger holds under attack: L1 balanced postings enforced at the poster, L2 append-only, L3 recompute identity proven, refunds schema-bounded (`refunded ≤ captured` as a CHECK — the C8 restaging attempt tripped it, the law proving itself), holds releasable exactly once, every cent cause-linked to an order and intent. Partial captures work (C5's surviving-amount capture). What finance *lacks* is the outside view: RM-H1 (reconciliation), RM-H5 (negative-balance policy), RM-H6 (dispute-loss allocation), and application fees are structurally present but valued at zero pending the Founder's fee policy — the ledger legs already exist, so activating a fee is a policy constant, not a schema change. Tax: marketplace-of-record questions (EU DAC7 reporting, VAT treatment) are flagged for counsel before C12/launch — not a C10 blocker, recorded so it cannot be forgotten.

## 11. Experience Review

Real money must arrive *invisibly*. The binding rules: the Payment Element renders inside the existing one-column checkout letter, styled with DOF tokens — a field among fields, never a Stripe-branded box; the button stays street ("Place order — €67", never "Submit payment"); failure copy stays honest and unbranded ("The payment method declined" — already the twin's words). Stripe-hosted onboarding is framed as what it honestly is: *the bank teller's window* — "Stripe asks the legal questions; DOF never sees your papers" — a doorway from the workshop, not a corporate wall inside it. A restricted merchant's storefront keeps its story and its street presence; only the checkout door closes, with plain words. The keystone promise wording survives intact because the mechanics still make it true: the buyer is charged when the maker confirms, the maker isn't paid until it ships, no-ship refunds automatically. Nothing in C10 requires new trust copy — and per constitutional law, none will be AI-authored.

## 12. Go / No-Go Recommendation

**GO — with the launch gates of §7 as binding C10 definition-of-done.**

No constitutional contradiction was found. The four criticals are precisely the seam C10 exists to build; they are named, test-specified, and gated rather than discovered in production. The single policy decision (RM-H6) is packaged with a proposed default for Founder approval inside the C10 authorization.

## 13. Recommended Amendments Before C10

1. **Adopt §7 launch gates as C10 DoD** — the increment does not tag until G1–G9 pass.
2. **Approve RM-H6 default** (platform absorbs early dispute losses; reserve dormant; offset right reserved) or amend it.
3. **Land the four Immediate Fixes (§6) as a pre-C10 hardening PR** — all four are testable against the sandbox today.
4. **Amend UPDATED_PAYMENT_LIFECYCLE** with the two-phase provider-boundary pattern (RM-C2) so the transaction discipline is written law, not review memory.
5. **Sequence C10 in four verifiable slices:** (a) boundary pattern + immediate fixes, (b) Element confirmation flow + webhook convergence, (c) Connect onboarding + capability gating + destination charges, (d) disputes + reconciliation + negative-balance policy. Each slice keeps the full gate chain green; real keys enter only at (b), test-mode only, live keys at launch.

— *Reviewed against v1.39.0. Every finding cites its evidence. The sandbox twin was the right way to build the truth of money; the twin's very determinism is why the boundary must now be built with this much suspicion.*
