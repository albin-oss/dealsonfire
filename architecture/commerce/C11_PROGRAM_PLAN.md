# C11 PROGRAM PLAN — Payouts & Money Operations

**Posture:** extension of a closed, certified production subsystem. No architecture
review is performed or needed: every capability below extends an existing pattern,
and the two new components carry explicit justifications. Constitutional corpus
(C1–C10, frozen) is assumed throughout.

**The four questions, answered up front:**
*Why does this belong here?* The Foundation deliberately built payout **eligibility**
(holding → payable on fulfillment evidence, C6) and stopped before payout
**initiation** — the money's last mile is the one unfinished lane of the money system.
*Which existing patterns does it reuse?* The §7 boundary journal (whose `payout` and
`transfer_reversal` kinds have been reserved in the schema since 0024), the cause-key
idempotency idiom, the cron clock, state-derived alarms/letters, the reconciliation
engine, the workshop UI contract. *Why are new abstractions necessary?* Exactly two
new components (a `payouts` record table and a boundary-registry refactor), both
justified in §7. *How does this reduce future complexity?* It retires four items of
registered C10 debt and converts reconciliation's weakest matching rule (category)
into identity matching before volume exists.

---

## 1. Objectives

1. Every cent of `merchant_payable` reaches the maker's bank on a predictable
   schedule, through the §7 boundary, exactly once, with the same convergence
   guarantees as every other money movement.
2. The maker can SEE their money: balance, what's still held and why, what was paid
   out and when — in street language, in the workshop.
3. Payout reality reconciles by identity, not category: every Stripe payout matches
   a DOF payout record; unexplained remains zero.
4. The registered C10 debt that touches these files is retired in passing.

## 2. Scope boundaries

IN: payout initiation against released holds; payout lifecycle (requested → in
transit → paid | failed) driven by connected-account webhooks; failure recovery
(payable restored, retried, alarmed); negative-payable and risk-pause enforcement
at initiation (gates already coded in C10); merchant Money page; payout letters;
ops payout surfaces; payout identity reconciliation; the four debt items named in §7.

OUT (see §4): everything else that sounds like money.

## 3. Capabilities

- **C11-1 Payout sweep** (cron lane, reusing the tick): per business — payable > 0
  net of open dispute freezes, `payouts_enabled`, not risk-paused, above the
  minimum threshold (`NUXT_PAYOUT_MIN_MINOR`, default €10), schedule due
  (`NUXT_PAYOUT_INTERVAL_DAYS`, default 7) → journal a `payout` op (idempotency key
  `payout:{businessId}:{period}`) → boundary drives `stripe.payouts.create` **on the
  connected account** (the funds already sit there from destination transfers) →
  settle: ledger posting `merchant_payable −X / psp_clearing +X` (existing account
  kinds — money leaving the Stripe system settles the obligation; no new ledger
  vocabulary), payout record written, letter queued.
- **C11-2 Payout lifecycle**: `payout.paid` / `payout.failed` connected-account
  webhooks (endpoint gains the `account` header context it currently ignores —
  an extension, not a redesign). Failed → payable restored by reversing posting
  (cause-keyed), op re-armed with backoff, `payout_failed` alarm, honest letter.
- **C11-3 Merchant Money page** (`/money`): balance card (on the bench / payable /
  paid out), the WHY of held money (the promise/evidence language from C6), payout
  history with per-payout composition, fee visibility. Workshop idioms only; no
  new UI vocabulary.
- **C11-4 Reconciliation identity matching**: payout balance txns match
  `payouts.provider_payout_id`; transfers gain source-identity matching where the
  expanded source carries our charge; listing gains paging (registered debt).
- **C11-5 Ops**: `payout_failed` / `payout_stuck` in the state-derived alarms
  queue; audited `ops` payout hold/release-retry endpoints following the C9
  masked-404 + audit idiom; runbook section in `reconciliation.md`.

## 4. Out of scope

Merchant-triggered instant payouts · payout advances/loans · multi-currency ·
second PSP · tax reporting (DAC7/1099) · the Administration domain · live keys and
launch itself · changing the hold policy (frozen, C6) · payout schedule per-merchant
customization (one platform schedule at launch).

## 5. Dependencies on C1–C10

Hold release (C6) is the sole source of payable. Destination charges (C10) are the
sole source of connected-account funds. `payouts_enabled` snapshot (C10 S3) gates
initiation. Risk pause (C10 S4) holds initiation. Dispute freezes (C10 S4) net
against payable. The §7 boundary executes everything. The reconciliation engine
(C10 S4) verifies everything.

## 6. Existing components reused (no changes to their contracts)

`provider_operations` journal + `PaymentsBoundary` driver (payout kind reserved
since migration 0024) · `LedgerPoster` and the existing seven account kinds ·
`holdReleaseDue` policy (untouched) · cron tick + recovery driver · state-derived
alarms endpoint · letters-as-consumers idiom · `merchant_payment_profiles`
snapshot · masked-404 ops idiom + audit log · reconciliation runs/items/watermark ·
the sandbox twin (gains payout recording, same test-law style) · workshop UI
contract and components.

## 7. New components (with justification) and debt retired

| New | Justification |
|---|---|
| `payouts` table (business, amount, currency, period, provider_payout_id, state, journal op ref) | Reconciliation identity matching and the Money page both need payout *records*; the journal row is an execution artifact, not a merchant-facing ledger. One table, P0 PII, manifest-registered. |
| Boundary kind-registry (map replacing the switch) | The retrospective's watch-trigger fires: payout + transfer_reversal bring the switch to 6 kinds. Mechanical refactor, no semantic change. |

Debt retired in passing (registered in C10_REPOSITORY_READINESS_REVIEW §6):
`payments.ts` split into `provider/`, `ledger.ts`, `service.ts` (first PR, before
new code lands in it) · `container.ts` per-domain wiring extraction ·
`AddressFields` local-state emit fix (first UI pass) · reconciliation paging.

## 8. Risks

1. **Connected-account webhook plumbing** — payout events carry the `account`
   field our endpoint ignores today; the extension must not disturb platform-event
   handling (mitigation: same signature path, additive account-context branch,
   hostile tests for both event classes).
2. **Balance availability timing** — a connected account's funds may sit in
   `pending` before becoming available for payout; test mode is forgiving, live is
   not (mitigation: payout amount = min(payable, available balance read at drive
   time); shortfall stays payable with a note, never an error).
3. **FX noise on the CAD-settling test account** — payout amounts in CAD vs EUR
   payable (mitigation: presentment-matching pattern from C10; and the production
   EUR-settlement decision in §11 dissolves it).
4. **Validation account** — the C10 temporary account is slated for discard; C11
   validation needs it kept alive OR a fresh test account with Connect enabled
   (Founder input at slice 2).
5. **Period idempotency across schedule changes** — changing the interval mid-period
   must not double-pay (mitigation: period key derives from payout-record history,
   not from wall-clock math).

## 9. Acceptance criteria

Every payable cent above threshold reaches exactly one payout op per period; a
payout never exceeds payable-net-of-freezes nor available balance; disabled/paused
merchants accrue payable but initiate nothing, visibly; failed payouts restore
payable, retry with backoff, alarm, and letter — money never silently stuck NOR
silently vanished; L3 clean after every posting; reconciliation matches every
Stripe payout by identity with zero unexplained; the Money page tells the maker's
money story in street language with no state invented client-side; full gate chain
green; the four debt items demonstrably retired.

## 10. Demonstration scenarios

1. The full river: purchase → dispatch → quiet week → hold release → sweep →
   real test-mode payout → `payout.paid` → Money page shows the story → letter.
2. Failure honesty: payout fails (test bank trigger) → payable restored → alarm →
   letter → retry converges.
3. Protection: risk-paused merchant accrues payable, initiates nothing; resume →
   next sweep pays.
4. Freeze netting: open dispute reduces payable-available; won dispute releases it
   into the next payout.
5. Reconciliation: the week including payouts — zero unexplained, payouts matched
   by identity.
6. Crash: kill between payout drive and settle → recovery driver converges, no
   double payout (idempotency key at Stripe).

## 11. Production rollout considerations

Production Stripe account must settle in **EUR** (Founder decision, registered in
C10 review — dissolves FX risk 3). Dashboard webhook endpoint + secret for
production (deploy checklist). Payout interval/minimum are policy constants the
Founder sets before launch. The merchant-agreement recovery clause (approved
policy §7) remains with legal before live. First production payouts should run
one manual-review cycle (ops confirms the first sweep's plan before it drives —
a launch-week training wheel, removed after).

## 12. Estimated implementation slices

- **S1 — Structure & the sweep** (the debt-retiring PR first: module split +
  boundary registry; then payouts table, sweep, ledger postings, twin payout
  support, hostile tests incl. crash/negative/paused/threshold).
- **S2 — Lifecycle & reconciliation** (connected-account webhooks, failure
  recovery, identity matching + paging, letters, alarms, runbook; live test-mode
  validation of scenarios 1–2, 5–6).
- **S3 — The Money page & ops** (merchant surface, ops endpoints, AddressFields
  fix, browser demo of scenarios 3–4, full sweep, release).

Each slice keeps the full gate chain green; the increment tags only when all
twelve acceptance criteria and six demonstrations pass.

---

*Awaiting Founder approval. No implementation has begun.*
