# C11 PRINCIPAL ENGINEER REVIEW — Minimum-Complexity Audit of the Program Plan

**Scope:** the C11_PROGRAM_PLAN implementation surface only. The Foundation is
frozen and unchallenged. The lens: ten years of maintenance, deletion preferred
over addition, reuse preferred over creation. The reviewer is the engineer who
will answer the 3 a.m. page for whatever this plan creates.

---

## 1. Executive verdict

**The approved plan is sound but not minimal. This review deletes its largest
proposed component and four smaller ones.** The original plan proposed one new
table, one refactor, two ops endpoints, one new page, one new API route, and
three events. The optimized strategy delivers identical capability with **zero
new tables, zero new endpoints, zero new pages, zero new services, and two new
events** — because the Foundation, examined harder, already contains every
persistence and surface payouts need. The plan's own instinct ("the journal's
payout kind has waited since migration 0024") was right; it just didn't follow
that instinct far enough.

## 2. Complexity score

| | As planned | As optimized |
|---|---|---|
| New tables | 1 (`payouts`) | **0** |
| New endpoints | 3 (money GET + 2 ops) | **0** (one existing GET extended) |
| New UI surfaces | 1 (`/money` page) | **0** (Settings card extended) |
| New services/classes | 0–1 (registry refactor) | **0** (one method on PaymentsService) |
| New events | 3 (initiated/paid/failed) | **2** (paid/failed) |
| New migrations | 1 | **0** |
| New cron jobs | 0 (lane in tick) | 0 (unchanged) |
| Config knobs | 2 | 2 (policy values — irreducible) |

**Score: the optimized plan is a pure extension** — every byte of new persistence
lands in tables that already exist under laws that already govern them.

## 3. Components that should be REMOVED

**3.1 The `payouts` table — removed.** The plan justified it twice (reconciliation
identity, Money page records); both needs are already served:
- *Execution record:* the `provider_operations` journal row carries business,
  amount, currency, the period inside its idempotency key
  (`payout:{business}:{period}`), and — after drive — the Stripe payout id in
  `provider_ref`. Reconciliation's identity match reads the journal (its 90-day
  window comfortably covers a daily reconciliation looking back one day).
- *Permanent merchant-facing record:* the LEDGER. The settle posting
  (`merchant_payable −X / psp_clearing +X`) writes its cause as
  `{kind:'payout', period, provider_payout_id}` — append-only, PII-free,
  permanent. The Money story is a ledger query. A failed payout's reversal
  posting (`kind:'payout_failed'`) is likewise permanent truth.
A new table would have been a third copy of facts two existing structures
already hold — a future migration, a truncate-list entry, a manifest row, and a
drift surface, purchased for nothing. *This is the review's largest deletion.*

**3.2 The boundary kind-registry refactor — removed (deferred).** The
retrospective's trigger was ~8 kinds. C11 adds exactly one (`payout` — the
`transfer_reversal` kind stays dormant; refunds reverse transfers via the flag,
not a separate operation). Five cases do not justify a refactor. One more `case`
line. The trigger stands for whoever reaches eight.

**3.3 Both ops payout endpoints — removed.** A stuck payout is a pending journal
op — the recovery driver already retries it; that is §7's whole point. Manual
payout *pause* per merchant is the risk-pause that already exists (automatic via
limits; a manual ops pause is Administration-domain territory, out of scope by
the plan's own §4). Acknowledgement is the existing ops note. The alarms queue
gains `payout_failed` / `payout_stuck` as two more state-derived arms in the
EXISTING endpoint's query — no new route, no new audit surface.

**3.4 The `payments.payout.initiated` event and its letter — removed.** Test-mode
payouts settle in seconds; real ones take days. One letter at `paid` ("it landed
in your bank") is street-true; an "it's on its way" letter at initiation is a
promise about banking rails DOF doesn't control. Two events (`paid`, `failed`),
two letters, consistent with the `authorization.{succeeded,failed}` naming law.

**3.5 Half of the `container.ts` split — removed (deferred).** The `payments.ts`
split stays (C11 lands code in that file; splitting first is cheaper than
after). The container extraction is pure churn with import ripples and no C11
motivation — deferred until an increment actually chokes on it.

## 4. Components that should be MERGED (into existing ones)

- **The Money API → the existing `GET /api/v1/businesses/:id/payments`** (C10
  S3's "getting paid" status endpoint). It gains a `money` block: balances
  (holding / payable / paid-to-date from ledger accounts+entries) and payout
  history (ledger postings). Same gate, same audit posture, one route where the
  merchant's banking truth already lived.
- **The `/money` page → the Settings "Getting paid" card.** The card already
  owns till status; it grows the balance line and recent payouts, in the same
  street voice ("On the bench €44 · Yours, payable €132.50 · Paid out so far
  €890"). If money later deserves its own room, promoting a card into a page is
  additive; demoting a page never is.
- **The payout sweep → a method on `PaymentsService`** (`preparePayoutSweep`,
  prepare-idiom like every other phase-1) driven by the existing cron tick's
  Promise.all — not a service, not a job, a lane.
- **Payout failure recovery → §7 native semantics.** No payout state machine:
  the op *succeeded* (Stripe accepted it); a later `payout.failed` webhook is a
  new provider FACT → reversal posting restores payable → a fresh journal op
  (`payout:{business}:{period}:r2`) re-arms the retry. Facts + journal, no third
  lifecycle store.

## 5. Components that REMAIN as planned

The webhook endpoint's connected-account context branch (irreducible — the
events genuinely carry an `account` field today's code ignores) · the two policy
knobs (`NUXT_PAYOUT_INTERVAL_DAYS`, `NUXT_PAYOUT_MIN_MINOR` — founder values
wearing configuration, the established idiom) · twin payout support (test law) ·
reconciliation paging (registered debt) · identity matching (source changed to
journal/ledger per §3.1) · the `payments.ts` split · the `AddressFields` fix ·
all gates, all demonstrations, all acceptance criteria of the plan.

## 6. Future maintenance risks (of the optimized plan)

1. **Ledger-as-record queries**: the Money block and payout history are jsonb
   cause queries (`cause->>'kind' = 'payout'`). Fine at launch volume; if the
   Money page ever needs rich filtering, THAT is the moment the `payouts` table
   earns existence — as a *projection* of ledger truth, rebuildable, not a
   source. Recorded here so the future need doesn't get solved with a second
   source of truth.
2. **Journal retention vs late reconciliation**: identity matching reads the
   journal's 90-day window. A reconciliation gap longer than 90 days would lose
   payout identities from the journal — but the ledger cause carries
   `provider_payout_id` permanently as the fallback. Documented in the runbook.
3. **Period derivation**: "period" derives from each business's last payout
   posting (ledger), not wall-clock buckets — schedule changes can't double-pay,
   but the derivation must stay in ONE function; two implementations of "what
   period are we in" would be this plan's classic drift bug.

## 7. Simplification opportunities beyond the deletions

- The `payout_stuck` alarm needs no new detection logic: it is
  `provider_operations WHERE kind='payout' AND state='pending' AND updated_at <
  now() - interval` — the same shape as every other arm.
- The failure letter and the paid letter share one consumer file section with
  the dispute letters — same recipient-resolution join, zero new plumbing.
- Demonstration 4 (dispute-freeze netting) needs no new staging tools — the C10
  dispute test cards and the existing freeze machinery compose.

## 8. Final recommended implementation strategy

**Two slices, not three** (the deletions collapsed S3's surface into S2):

- **S1 — Structure & the sweep**: `payments.ts` split (motion only, first
  commit) → twin payout support → `preparePayoutSweep` + boundary `payout` case
  + settle posting with the ledger-cause record → cron lane → hostile tests
  (threshold, paused, disabled, dispute-netted, negative, crash-between-phases,
  period idempotency across schedule change, racing drivers).
- **S2 — Lifecycle, reconciliation & the card**: connected-account webhook
  branch + `paid`/`failed` events + reversal-and-re-arm recovery + two letters +
  two alarm arms + identity matching + paging + the extended payments GET + the
  grown Settings card + `AddressFields` fix + runbook section → live test-mode
  validation of all six demonstrations → full sweep → release.

Everything else in the approved plan — objectives, scope walls, acceptance
criteria, demonstrations, rollout considerations — stands unmodified.

---

**Closing statement:** the plan as approved was *good*; it was not *minimal*.
The gap between the two was one table, three endpoints, one page, one event, and
one premature refactor — all of which existed in the plan because I reached for
the familiar shape of "a new capability" instead of trusting how much the
Foundation already carries. With these deletions, C11 is the first increment
that adds **no new persistence and no new surface** to the platform — which is
exactly what extending a mature production subsystem should look like.

*Slice 1 will not begin until the Founder approves this optimized strategy.*
