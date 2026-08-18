# LAUNCH FOUNDATIONS RETROSPECTIVE — closing C12 (Phase 1)

**Status:** CLOSURE · 2026-08-18 · covers C12-1 (v1.44.0), C12-2 (v1.45.0), C12-3 (v1.46.0)
**Method:** every answer below is judged from code, tests, and recorded evidence — not from what the plans intended.

---

## 1. Which of the original seven stranger statements are now actually true?

| # | Statement | Verdict |
|---|---|---|
| 1 | "When DOF says it will tell you, it tells you." | **TRUE** for real inboxes via the temporary test sender: exactly-once composition, idempotent handoff, bounce-fact outcomes, [EXTERNAL] inbox evidence (C12-1). |
| 2 | "The locks work when more than one door exists." | **TRUE**: Postgres-backed HMAC rate limits and one-shot WebAuthn ceremonies, proven under restart and concurrency (C12-2). |
| 3 | "A buyer is a person, not a cookie." | **TRUE**: account create/verify/recover/inspect; the order link is a durable key, not a cookie accident; the email-change law defends the takeover surface with a proven 72-hour way back (C12-3). |
| 4 | "If something is wrong, someone can say so — and someone can act." | **TRUE**: quiet public report door → durable deduped fact → operator alarm → step-up-gated audited hold/lift, with payouts settling to the cent under a hold (C12-2). |
| 5 | "The platform states its terms." | **PARTIAL** — see §2. |
| 6 | "We can recover what we hold." | **TRUE at dev scale, by an actual drill** — restore executed, invariants recomputed on the copy, 0.7 s measured; production-scale and different-host restores remain open (recorded). |
| 7 | "Production is configured as production." | **TRUE as a refusal**: boot gates name every problem and refuse a dev posture; the production instance itself has never booted (no host), so the gate's PASS side is exercised only in test shape. |

## 2. Which are only partially true?

- **#5 (terms):** the SURFACES exist and consent is recorded as append-only facts, but every document is a bannered placeholder. The gap is counsel wording — a Founder gate, not an engineering gap. The statement becomes true the day approved text lands and versions bump.
- **#6/#7 edges:** drill not yet run on a separate host or at production volume; boot gate never armed on a real production host. Both are DEPLOYMENT-class, listed in PRODUCTION_CUTOVER.

## 3. What did external reality contradict during C12?

1. **Mailbox link-scanners complete GET actions.** live.com SafeLinks consumed a verification token by prefetching the letter's link — turned into the binding scanner-safety law (GET never consumes; explicit POST). 
2. **A webhook observed is not a webhook processed.** The payout.paid race (event ingested in its own tx before settle committed) lost a real letter forever; generalized into the invariant "observed is never consumed" with the 6-scenario suite.
3. **Provider acceptance ≠ delivery.** Resend 200s say "accepted"; only bounce facts say anything further. Copy and evidence classes now refuse to claim delivery.
4. **Resend restricts unverified senders to the owner's inbox** — surfaced as live PermanentMailError + alarms; became the failure-visibility demo and a cutover gate (verified domain).
5. **The dev world drifts from the code.** The restore drill's first run failed on missing migration 0030 — the drill caught it, which is exactly why drills exist.

## 4. What security assumptions were wrong?

- "The session cookie is the credential" was too narrow: the EMAIL is the root credential (it recovers the password, which holds the sessions). C12-3 therefore treats email change as the takeover surface: step-up + possession + notice + a 72-hour revert that beats a subsequent password change.
- "Rate limiting exists" (it was per-instance memory — decorative under horizontal scale).
- "Uniform errors are enough for enumeration-proofing" — uniform ANSWERS are also required; truth must go to the address, not the requester.
- "A consumed token means a human acted" — false under scanners; consumption now requires a POST no scanner sends.

## 5. What complexity was deleted rather than added?

- Guest order access reused **dormant `guest_tokens`** — a table that existed since guest-claim work — instead of a new keys mechanism.
- Email-change tokens ride the EXISTING `user_recovery_tokens` (two new purposes), not a new table; the only new state is the one authoritative `email_changes` machine.
- Reporter/operator letters ride the C12-1 journal; no second mail path.
- Sync shims deleted in C12-2's async port conversion (no dual code paths left).
- Legal documents are code constants — no CMS, no admin UI.
- Across C12: zero new services, zero queues, zero dashboards; 2 migrations, 5 tables.

## 6. What launch gates remain external/legal/operational?

PRODUCTION_CUTOVER §6, condensed: live-mode Stripe river re-walk · real Resend webhook into the deployed endpoint · verified sender domain · counsel-approved legal text · CSP/proxy re-verify on the real domain · restore drill against the production backup mechanism on a different host. Plus the Phase-2-end formal gates (pen test, load, accessibility audit) that attach to the public-launch decision.

## 7. What must the Living Street inherit and NEVER duplicate?

- **The mail journal** — any new letter class is a consumer + dedup_ref, never a new sender.
- **The webhook invariant envelope** — new event classes plug into ingest-and-handle/compensating patterns, never fresh webhook plumbing.
- **`guest_tokens`** for any link-that-grants-a-read; **`user_recovery_tokens` purposes** for any token-that-proves-possession.
- **The boot gate** — new required env goes into `productionGateProblems()`, not a README.
- **Consent facts** — any new agreement is a document id + fact rows, never a boolean column.
- **The masked-404 buyer gate and enforcement_hold read set** — new street surfaces reuse the existing reads so holds stay total.

## 8. Load-bearing walls vs replaceable furniture?

**Walls** (change = program-level decision): the §7 two-phase boundary and G2 tripwire · the rollback law · mail exactly-once composition · the webhook invariant · the email-change state machine and its 72-hour rule · append-only consent · the scanner-safety law · boot-gate refusals.
**Furniture** (swap freely behind ports): Resend adapter · fixed-window limiter algorithm · pg_dump as the backup transport · placeholder page copy · the account page's layout · the dev-session script.

## 9. What technical debt has a concrete watch-trigger?

| Debt | Watch-trigger |
|---|---|
| Fixed-window rate limiting (burst at window edges) | first real abuse wave that exploits the boundary; switch to sliding window in the SAME table |
| `rate_limit_buckets` opportunistic cleanup | table > ~1 M rows or cleanup latency visible in p95 |
| Full-dump-only recovery (no PITR) | first real merchant money at stake → WAL archiving before public launch |
| Media files outside pg_dump | first restore that must include images (cutover lists it) |
| Single-instance mail dispatch post-hook drive | first multi-instance deploy → dedicated driver (journal semantics already safe) |
| Buyer lands on merchant workspace | Living Street's buyer-first landing (deliberate today, wrong the day the street is the product) |

## 10. Controlled-stranger-cohort readiness — GO/NO-GO

**GO** — a controlled cohort (tens of invited strangers, real email addresses, test-mode money, an operator watching, the Founder aware this is not authorization to launch) is safe today:

- Everything a cohort stranger touches is proven at the class of evidence that matters: letters arrive in real inboxes; accounts create/verify/recover through scanner-safe doors; the takeover surface is defended and was beaten in a live browser walk; order links survive device changes; abuse has an intake and an enforcement path an operator has actually driven; locks are durable; a restore has actually been run.
- The known-open gates are exactly the ones a controlled cohort does NOT cross: no real money (test mode; the live-mode river re-walk is a public-launch gate), no public scale (rate limits sized for it anyway), legal placeholders are honestly bannered and the cohort is invited under explicit "pilot, no claims" framing (Founder to confirm that framing — it is the one cohort precondition outside engineering).
- Conditions attached: temporary sender stays owner-verified or the domain gets verified first (letters to arbitrary cohort inboxes need the verified domain — this is the ONE engineering-adjacent step to do before invites go out); an operator on the abuse alarm; the drill re-run on the day-one production-shaped host.

**This is a readiness judgment, not authorization to launch.** Public launch remains NO-GO until PRODUCTION_CUTOVER §6 clears.
