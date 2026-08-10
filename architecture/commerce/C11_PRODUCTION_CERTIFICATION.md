# C11 PRODUCTION CERTIFICATION — Payouts & Money Operations

**Status:** CERTIFIED — GO · 2026-08-08
**Campaign:** Live Stripe test-mode payout validation (Founder directive: "treat this exactly like the C10 external certification")
**Environment:** temporary Founder-authorized Stripe test-mode account (Connect enabled), env-configured keys only, dev world reset to zero before the certified river. The temp account is discarded after this campaign.
**Method:** every claim below was observed against the REAL Stripe API and cross-checked across four views — Stripe, the §7 provider journal, the DOF ledger, and the merchant-facing money story. Where the harness (not the platform) failed, the run was stopped, repaired, and restarted from a clean world, per the directive.

---

## 1. Executive Summary

The complete payout river was validated against real Stripe: fulfillment evidence → hold release (maker's NET) → eligibility gates → period-idempotent sweep → §7 journal → **two real Stripe payouts on a BE/EUR connected account** → `payout.paid` webhooks → letters → four-view equality → replay protection → crash recovery → live dispute freeze and won-resolution → reconciliation matching payouts **by identity** with zero unmatched items and a recompute-clean ledger.

The certification did exactly what external certification exists to do: it found **five real defects that no sandbox suite had caught** — three of them money-truth defects — forced stop-repair-restart, and re-proved the river from a clean world after each repair. Final state: **GO.**

## 2. Business Certification

- A maker (Rosa, BE) onboarded through DOF's own flow received an account born **manual-schedule** and **in the shop's settlement country (BE/EUR)** — payout timing belongs to DOF's fulfillment-evidence law, and the account can physically pay out the shop's currency.
- Real buyer purchases (cards `pm_card_visa`, `pm_card_bypassPending`) produced honest ledger truth: capture split into maker's holding (net of the 10% platform fee) and platform fees.
- The maker was paid **twice, for real**: €43.65 (period 1) and €43.65 (period 2), each landing `paid` at Stripe against the test bank, each producing exactly one letter ("€43.65 is on its way to your bank"), each visible in the money story as "arrived" with its real `po_` id.
- A live chargeback froze exactly the disputed €22.50 out of the maker's waiting money and returned it in full on the won resolution; the story's buckets stayed truthful throughout.

## 3. Engineering Certification

- **§7 boundary held under live conditions**: journal (pending) → provider call outside any transaction → settle behind the pending→succeeded flip. The G2 tripwire never fired.
- **Period idempotency**: period = count of prior payout postings + 1 (ledger-derived). Repeated sweeps prepared nothing new while a period was in flight or the interval not due (`skipped:1` observed live with payable > 0).
- **Crash recovery**: a payout journaled in one process which then died before driving (staged crash) was recovered by the sweep's `driveAll` after the grace window — driven exactly once, settling payout 2. Ledger-derived period sequencing survived the crash.
- **Key rotation law (new)**: a definitive decline consumes the Stripe idempotency key (Stripe caches the refusal for 24h — proven by probe); the journal rotates `…:w{attempts}` and the retry is a fresh request. Ambiguous failures keep the stable key so replay can discover a crashed-after-create success. Observed live end-to-end: cached `idempotency_error` → rotation to `:w1` → success on retry.

## 4. Stripe Validation Results

| Scenario | Result |
|---|---|
| Connected account creation (DOF path) | `acct_…zioN` born BE / EUR / `interval: manual` / tagged with the business id |
| Hosted onboarding | Completed by Founder with Stripe test persona only; platform correctly **refused** API writes to identity on a hosted-onboarded account |
| Destination charges | €49.50 / €48.50 / €48.50 / €22.50 captured with fee split; settlement-pending vs available balance behavior observed live (7-day `available_on` on standard cards; bypass-pending card for available funds) |
| Payout 1 | `po_1U1dMbC65p5yzioN4LxQciLm` — €43.65, `paid`, after live key rotation |
| Payout 2 | `po_1U1uQXC65p5yzioNXuxNifEG` — €43.65, `paid`, driven by crash recovery |
| `payout.paid` webhooks | Both processed → `payments.payout.paid` events (periods 1, 2), letters dispatched once each |
| Duplicate webhook | `payout.paid` resent via Stripe CLI → **still exactly one event, one letter** (idempotent per provider payout id) |
| Lost webhooks | Listener session expiry (harness) drilled the §8 convergence path: provider truth read + `completePaymentAuthorization` converged `placed` orders without their webhooks |
| Dispute | `du_1U1uLpC65pB4hGbbcLfa62UG` (€22.50) — live freeze on `charge.dispute.created`; `winning_evidence` submitted; `charge.dispute.closed` → won → full unfreeze |
| Reconciliation | Forced runs over the certification window: **18/18 matched, 0 unmatched** — charges/fees/transfers by rule, **both payouts by identity** (`payout ↔ journal po_…`), both chargeback withdrawal legs matched to the dispute record |

## 5. Financial Certification

Four-view equality held after every payout and at close:

- **Stripe**: two payouts `paid`, €43.65 each, to bank `…7061` (BE/EUR test IBAN).
- **Journal**: two succeeded payout ops, amounts 4365, provider_refs equal to the Stripe ids, keys `payout:{biz}:1:w1` and `payout:{biz}:2`.
- **Ledger**: payout postings `merchant_payable −4365 / psp_clearing +4365` with cause `{kind: payout, period, provider_payout_id}` (the permanent record); dispute freeze/won postings exactly mirrored; **final recompute: `{clean: true, drift: []}`** (L1 zero-sum, L2 balances = entry sums, L3 append-only).
- **Money story**: waiting €64.80 (orders A + E net, funds still settling at Stripe), ready €0, set-aside €0, paid €87.30, history = both payouts "arrived" with real ids. Every euro in the story maps to a Stripe fact.
- Alarm queue at close: **empty**.

## 6. Merchant Experience Certification

The validated copy (C11_MERCHANT_EXPERIENCE_VALIDATION) behaved as approved: the Getting Paid card spoke in waiting/ready/paid (never "payable"), payout letters led with the money and the bank timing ("a day or two… nothing to do"), and the dispute's set-aside line never lied — set-aside showed only *uncovered* exposure (fully-frozen dispute → €0 set aside, waiting reduced by the frozen amount, restored on the win).

## 7. Operational Certification

- `payout_stuck` and `payout_failed` alarm derivations verified in the sandbox suites; live queue empty at close because nothing was stuck — the one live near-stuck state (pending op under a consumed key) self-healed via rotation.
- Runbook `docs/runbooks/reconciliation.md` §C11 matches observed reality (identity matching, WAIT semantics, lost-webhook recovery).
- The recovery sweep (`driveAll`) proved itself twice live: key-rotation retry and crash recovery.

## 8. Security Certification

- Keys lived only in the git-ignored `.env` (verified untracked); no secret was ever committed or printed in full; the temp account is Founder-discarded after this campaign.
- No real personal identity was placed on the certification account: Stripe's refusal of platform identity writes was respected, and the Founder completed hosted steps with Stripe's published test persona and test affordances only.
- Stale test authorizations left by the harness-latency incident were explicitly cancelled at Stripe (buyer-hold hygiene).

## 9. Performance Certification

Launch-volume posture only: the sweep, boundary driver, and reconciliation pager (20 pages × 100) ran well within a single cron tick against the certification volume. No load testing was performed or claimed — deferred to the public-launch gates by design.

## 10. Launch Readiness (payout scope)

Ready: the payout river end-to-end, its alarms, its runbook, its letters. Remaining **production-account configuration** (not code) before real money:
1. Founder-owned production Stripe account (live keys never touch this repo until then), production webhook endpoint + secret.
2. Ratify settlement posture: shop currency EUR, maker accounts born `be` (certified law; multi-market = maker country becomes data — registered debt).
3. Payout knobs (`NUXT_PAYOUT_INTERVAL_DAYS=7`, `NUXT_PAYOUT_MIN_MINOR=1000`) as production policy.
4. Production cron + `NUXT_CRON_SECRET` (fails closed — verified).

## 11. Remaining Technical Debt / Known Limitations

- **`payout.failed` was not producible live** — hosted-onboarded test accounts accept only the succeeding test bank, and platform bank-account writes are refused. The failure path (money home, `:r{n}` re-arm, honest letter, no double-pay while in flight) is pinned by the sandbox lifecycle suite; the twin's failure semantics mirror the adapter's contract. First real `payout.failed` will be watched via the `payout_failed` alarm + runbook.
- Partial-uncovered dispute netting (`payoutable = payable − uncovered`) is sandbox-pinned; live dispute was fully covered by holding (uncovered 0), which is the common case.
- Interval knob `Number(env) || default` cannot express 0 (test staging nuisance only — production never wants 0).
- Certification-window scoping: reconciliation watermark was seeded at world-reset (documented staging); pre-reset provider history on the discardable account is outside the certified window by construction.
- Registered pre-existing debt unchanged: reconciliation paging cap, container.ts size, EUR copy assumptions (see C10_REPOSITORY_READINESS_REVIEW §6, COMMERCE_FOUNDATION_RETROSPECTIVE §10).

### The five certification repairs (all committed on `increment/c11-payouts`)

1. **`385ce66`** — connected accounts born manual-schedule **and in the shop's settlement country (BE)**: v2 creation silently defaulted to DAILY payouts and the C10-artifact `country: 'ca'` produced accounts that could never pay the EUR payable.
2. **`e9c3e09`** — **hold release moves the maker's NET, never the gross capture**: gross release overdrew the order's holding by the platform fee and silently ate sibling orders' waiting money; Stripe refused the inflated payout. New fee-present hostile suite (`payout-fee.test.ts`) pins release, payout amount, and partial-refund proportionality.
3. **`6fe93ad`** — **a definitive payout decline rotates the idempotency key**: Stripe caches refusals against the key for 24h; the stable-key WAIT would replay the cached refusal after funds arrived. Rotation only on proven-nothing-created declines; §7 replay semantics preserved for ambiguous failures.
4. **`f246a84`** — **a cancelled-at-confirm order releases the buyer's card hold**: the all-lines-fallen path cancelled honestly but left the authorization riding the buyer's card for up to 7 days; the cancellation now journals the void.
5. **`2105938`** — **reconciliation reads the makers' connected accounts**: payout balance transactions live on the connected account; the twin's conflated ledger had given payout identity matching sandbox coverage but zero live coverage. Verified live: both payouts matched by identity.

## 11b. Closure-unblock findings (appended 2026-08-09 — what actually happened)

The first closure attempt STOPPED at the "full sweep green" gate, per the Founder's rule, after four full-suite runs failed on shifting e2e tests. Two distinct causes were separated by investigation:

1. **A real accessibility defect (fixed).** reka v2's Combobox leaves `aria-activedescendant` on the collapsed input still naming the last-highlighted item — an id that stops existing when the list unmounts (axe `aria-valid-attr-value`, impact critical; intermittent because it depends on highlight timing). Pre-existing, unrelated to C11's changes, surfaced by the closure sweep. Corrected at the DOF wrapper boundary in `DofCombobox` and `DofMultiSelect` (collapsed ⇒ the attribute is removed; reka repopulates a fresh valid id on open) — no library fork, no assertion weakened, no story excluded. Regression suite `tests/ui/combobox-aria.test.ts` proves the invariant across select/escape/close/repeated cycles, and was verified to FAIL 4/4 against the unfixed component (catching the exact ghost id) before passing 4/4 with the fix.
2. **Test-runner resource contention (cause fixed, not papered over).** Random storybook stories exceeded the 30s load timeout only in full parallel runs — a different set each run, each loading in 335ms–1.6s alone; `--workers=1` eliminated every timeout AND was faster end-to-end (1.3m vs 3.0m) on the 8-core release machine, which also hosts both test webServers. Classified as contention (not leaks — serial is clean; not app performance — sub-second loads; not async nondeterminism — serial is deterministic). Correction: `workers: 1` in `playwright.config.ts` with the evidence documented; the 30s timeout stands unchanged.
3. **Scan-vs-animation race (cause fixed).** With the first two corrected, one further intermittent surfaced: axe read a toast MID-FADE (the story's auto-settle fires at 6s with a 200ms leave transition) and reported the blended frame as a contrast violation (1.39:1 — colors that exist nowhere at rest). Not a product defect — WCAG contrast does not apply to a dismissal animation frame; a scan racing one-shot animations is a harness-determinism defect. Correction in `tests/e2e-ui/helpers.ts`: story loads now wait until every FINITE animation has finished before any scan or snapshot (infinite animations — skeleton pulse, spinners — are the stable state and are ignored; bounded at 10s). No assertion weakened, no story excluded, no rule disabled.

## 12. Final Verdict

**GO.** The payout system behaves correctly against the real Stripe platform under real provider behavior — including the provider behaviors nobody designs for on purpose (cached idempotent refusals, settlement-pending balances, late and lost webhooks, crash windows). Merge `increment/c11-payouts`, tag **v1.43.0**, record C11 as externally proven, and mark the Commerce Program C1–C11 complete.

*Full verification sweep results are recorded in the release; the sweep is a merge gate, run with the dev server stopped, per the release law.*
