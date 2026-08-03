# C10 REPOSITORY READINESS REVIEW

**Purpose:** the final audit before the Connect-enabled certification run. Written as
if a fresh engineer inherits this repository tomorrow. Connect is NOT yet enabled on
the temporary test account; everything else has been validated against real Stripe.
**State audited:** branch `increment/c10-real-money` at the certification-fixes commit,
after the drift repairs this review mandated (all landed with it).

---

## 1. Fresh-engineer walk — verdict

A new engineer can reconstruct the money system from four documents in order:
[UPDATED_PAYMENT_LIFECYCLE](UPDATED_PAYMENT_LIFECYCLE.md) (§7 boundary law, §8
as-built Element correction), [CONNECT_FUNDS_FLOW](CONNECT_FUNDS_FLOW.md),
[REAL_MONEY_READINESS_REVIEW](REAL_MONEY_READINESS_REVIEW.md) (the gates), and
[CONTRIBUTING](../../CONTRIBUTING.md) (the three platform laws, now including G2).
The code paths they describe are the code paths that exist. The hostile-scenario
tests double as executable documentation — each names the law it proves.

## 2. Documentation audit — drift found and repaired

| Drift | Repair |
|---|---|
| Lifecycle doc still described authorize-inside-checkout ("pay sheet, instant yes/no") — pre-Element | §8 as-built correction added: intent born unconfirmed; the buyer's browser authorizes; webhook/return converge |
| Settlement-vs-presentment currency reality (found by real Stripe) recorded nowhere | §8 records it; the matcher's presentment rule documented at the code site |
| CONTRIBUTING lacked the G2/§7 law — the first thing a payments-touching engineer must know | Added as the third platform law with the runtime-tripwire + static-gate pointers |
| Ops reconstruction (endpoint + runbook) predated the provider-operation journal | `provider_operations` now in the reconstruction response; runbook section added |
| `architecture/README.md` index missing the C10 review corpus + runbooks pointer | Added (this review included) |
| `.env.example` missing the two test knobs (`NUXT_SANDBOX_CLIENT_CONFIRMATION`, `NUXT_REQUIRE_MERCHANT_ONBOARDING`) | Added |

After these, a repo-wide check found **no remaining drift**: no doc asserts
behavior the implementation contradicts.

## 3. Stale-assumption sweep (post-real-Stripe)

Removed/corrected during certification and now consistent everywhere:
balance-transaction amounts are settlement-currency (matcher uses source
presentment); chargeback withdrawals are `adjustment`-typed and dispute-sourced;
webhook events for a CAD-settling account carry EUR presentment in their sources.
The RM review and C6–C9 packets are **point-in-time records** — kept verbatim by
design; the README marks their standing.

## 4. Launch gates → actual implementation

| Gate | Implementation (not plan) |
|---|---|
| G1 Element round trip | `server/api/v1/public/checkout/index.post.ts` (session handoff) · `app/pages/checkout.vue` (`mountElement`/`confirmPayment`/`settleAndGo`) · `server/utils/payment-completion.ts` (ONE convergence path) |
| G2 No provider call in tx | `platform/db.ts` (`assertOutsideTransaction`, ALS) · `domains/payments/application/boundary.ts` (sole provider seam) · `scripts/check-boundaries.mjs` (static rule) |
| G3 Webhook convergence | `server/api/webhooks/stripe.post.ts` + `provider_events` dedupe + row-locked `completeClientAuthorization` |
| G4 Both refund shapes | `refundFlagsFor` (payments.ts) — flags from the charge's shape; plain proven live ×7; destination awaits Connect |
| G5 Dispute freeze/alarm/letter | `openDispute`/`resolveDispute` (payments.ts) · `notify.dispute-*` (notifications.ts) · `dispute_open` in `ops/alarms.get.ts` |
| G6 Reconciliation | `domains/payments/application/reconciliation.ts` + `docs/runbooks/reconciliation.md` — zero unmatched on the real week |
| G7 Till gate + street presence | checkout endpoint gate + `merchant_payment_profiles` snapshot + `applyAccountSnapshot`; proven live for the closed half |
| G8 Void on failure/expiry | `sweepUnconfirmed` (confirm.ts) collects; cron voids via journal |
| G9 Live-key refusal | `assertNotLiveOutsideProduction` (server/utils/config.ts) — proven by process crash |

## 5. Production-survivor audit

Scanned the full C10 diff (54 files): **zero** TODO/FIXME/HACK, zero commented-out
code, zero debug logging, zero temporary shims. Deliberate survivors, each earning
its place: the sandbox twin + `sandbox-confirm.post.ts` (dev-only, triple-gated:
non-production AND sandbox provider AND buyer-gated — it IS the test
infrastructure); `NUXT_COMMERCE_CHECKOUT` production off-switch (launch control);
the two test knobs (documented). The `.env` with temporary keys is git-ignored and
dies with the account. `.mcp.json` (Stripe MCP declaration) is left untracked for
the Founder to keep or drop.

## 6. Hidden technical debt — the C11 register

1. **`payments.ts` is 1,016 lines** — four responsibilities (port+adapters, twin,
   ledger, service). Split in C11 into `provider/` (port, stripe, sandbox),
   `ledger.ts`, `service.ts`. Mechanical; do it before payouts land more code there.
2. **`container.ts` is 869 lines** — the composition root accretes per domain.
   Extract per-domain wiring modules when C11 touches it.
3. **AddressFields emits per-field spreads of its prop** — correct under human
   typing; stale under same-tick programmatic fills (bit the certification driver).
   Make it emit from local state in C11's first UI pass.
4. **Payout machinery is structure-only** (journal kind, manual schedule,
   `payoutAllowed`) — C11's core; reconciliation matches payouts by category until then.
5. **Settlement currency decision** — the production Stripe account should settle
   in EUR (presentment) unless the Founder wants FX exposure; record the choice at
   account creation.
6. **Webhook endpoint for production** — local uses the CLI forwarder; production
   needs the dashboard endpoint + `NUXT_STRIPE_WEBHOOK_SECRET` from it (a deploy
   checklist line, not code).
7. **3DS challenge completion** has never been clicked by human eyes (harness
   cannot click Stripe's iframe). One manual browser purchase with
   `4000 0025 0000 3155` during the Connect run closes it.
8. **Reconciliation batch is 100/run** — fine to ~50 orders/day; page the listing
   before real volume.

## 7. Long-term maintainability (5–10 year lens)

**Holds up:** one provider seam (a second PSP is a `ProviderPort` implementation +
container line); money truth lives in facts+ledger, never in provider state —
Stripe could be replaced without rewriting history; the journal makes every
provider interaction replayable; cause-keyed idempotency is a naming convention a
future team can read (`cancel:*`, `return:*`, `no-ship-aging:*`, `ops:*`);
letters, gates, and alarms are all state-derived — no parallel stores to drift.
**Watch:** the boundary's per-kind switch will grow with payout/transfer-reversal
kinds — at ~8 kinds, convert to a registry map; `checkout.vue` now carries cart,
address, Element, and sandbox-till concerns — split the payment step into a
component in C11's UI pass. **No leaky abstractions found**: orders knows nothing
of Stripe; payments knows nothing of orders' states; the two meet only in the
composition root and by-value ids, as constitution demands.

## 8. Verdict

**READY.** With this review's repairs landed, the repository is at the state the
Founder specified: once Connect is enabled on the test account, the only remaining
work is the Connect validation sequence (onboarding → destination charge → app fee
→ destination refund → restriction/recovery → final reconciliation) and the
GO/NO-GO → merge → tag. Nothing else remains.
