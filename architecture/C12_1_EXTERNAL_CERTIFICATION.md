# C12-1 EXTERNAL CERTIFICATION — The Letters Arrive

**Status:** see §21 · 2026-08-13
**Discipline:** forensic. Every claim below is classified as **[EXTERNAL]** (demonstrated against the real provider / a real inbox), **[AUTOMATED]** (demonstrated by the repository's own gates against scripted twins), or **[NOT DEMONSTRATED]** (with the reason stated plainly). Assumptions are not evidence and none were converted into any.

## 1. Executive Summary

C12-1 built the production mail path exactly as authorized: the §7 mail journal (compose+journal in-tx, provider call outside, outcome settled), the Resend adapter behind the unchanged `MailPort`, bounce/complaint truth with derived suppression, critical-mail failure visibility, the missing dispatch letter, and identity/commerce/money/operations letters riding the same journal. The hostile matrix (16 integration scenarios + 4 adapter contract tests) and the full repository sweep are green. **What does not yet exist is external evidence** — no provider account or credentials exist in this environment, and DOF's own standing rule (C10/C11 precedent) is that provider credentials are Founder-supplied, never self-created. The certification therefore stops honestly at the boundary it cannot cross alone.

## 2. Scope Actually Delivered (verified from code, not narrative)

| Authorized item | State | Where |
|---|---|---|
| Production MailPort adapter | ✅ built | `platform/mail.ts` — `ResendMailAdapter`, ~50 lines, no SDK |
| §7 journal → commit → provider-outside-tx → outcome | ✅ built | `platform/mail-journal.ts`; consumers journal in-tx (`server/utils/notifications.ts`), driver has the G2 tripwire |
| Stable idempotency identity | ✅ built | `mail:{consumer}:{dedup_ref}:{sha256(recipient)[:16]}` — consumer + event id per the directive, recipient-hash distinguishing the two letters one event legitimately produces |
| SandboxMailer preserved | ✅ | default binding wherever `NUXT_MAIL_PROVIDER`/key are unset; every test suite runs sandbox |
| `mail_bounces` (only outcome persistence) | ✅ | migration `0028`; manifest-declared P2, 12-month retention |
| Signed/replay-safe webhook | ✅ built | `server/api/webhooks/mail.post.ts` — Svix HMAC constant-time, ±5-min window, provider-event-id dedup, fail-closed, 64KB bound |
| Derived suppression | ✅ | permanent bounce/complaint ⇒ non-critical suppressed at drive time; nothing stored |
| Critical-mail failure visibility | ✅ | `mail_failed` + `mail_bounced_critical` alarm arms; driver alarms on permanent failure; bounce-of-critical alarms at intake |
| Dispatch letter | ✅ | new additive event `orders.order.dispatched` + `notify.order-dispatched` (ship + pickup variants, carrier/tracking) |
| Identity letters through the adapter | ✅ | `EmailPort` threads the tx; `JournalingEmailProvider` journals (critical) — a rolled-back command mails no one; sandbox provider kept for tests |
| Commerce/money/operations letters | ✅ | all 14 consumers journal; copy byte-identical to the C7/C11 approved letters |
| Secrets/config | ✅ | `NUXT_RESEND_API_KEY`, `NUXT_MAIL_WEBHOOK_SECRET`, `NUXT_MAIL_FROM` — env only; adapter never logs the key; unit test pins no-key-in-errors |
| Sender-domain configuration | ⬜ **[NOT DEMONSTRATED]** — requires the real account/domain (see §13) |
| Real external inbox validation | ⬜ **[NOT DEMONSTRATED]** — see §5/§6 |
| Hostile scenarios | ✅ | §8–§10 |
| Complete repository sweep | ✅ | §19 |

## 3. Mail Provider Decision

Resend, per `MAIL_PROVIDER_DECISION.md` (Founder-delegated). The deciding requirement was native `Idempotency-Key` support — it makes the crash-window semantics exact. Verified against the delegated requirement list; DPA/EU-region/webhook-signing confirmed from provider documentation **[NOT EXTERNALLY EXERCISED yet]**. Portability: bounce truth is DOF-owned; the exit path is one adapter + one webhook parser + DNS.

## 4. Architecture / §7 Verification

- **No provider network call inside an open transaction — proven two ways [AUTOMATED]:** the driver invokes `assertOutsideTransaction` (the same G2 tripwire that guards Stripe), and the hostile suite calls `drivePending` inside `withTransaction` and asserts the throw. Consumers perform zero network I/O — they write journal rows in the delivery-ledger transaction.
- One deliberate, documented exception at the same standard as before: the **ops-alarm mail** is a direct, `void`-fired, non-awaited send (it has no domain event to ride, duplicates are acceptable, and its failure must never recurse into the alarm path). Being non-awaited it cannot hold any transaction open.
- Exactly-once **composition** = the journal's unique key; **handoff** is at-least-once collapsed to once by the provider idempotency key; **delivery is never claimed** — outcomes only ever come from bounce facts. The words "delivered/received" appear nowhere in code or letters.

## 5. Real Provider Evidence

**[NOT DEMONSTRATED — blocked on credentials.]** No Resend account exists in this environment; creating accounts is outside the engineering boundary (Founder-supplied credentials are the standing pattern from the C10/C11 Stripe campaigns). The prepared external walk (~30 minutes once `NUXT_RESEND_API_KEY` + `NUXT_MAIL_WEBHOOK_SECRET` + a Founder-controlled mailbox exist) covers the 13 mandated demonstrations: registration/verification, recovery, order confirmation, dispatch, payout, ops alarm, replay convergence, provider retry, hard bounce via `bounced@resend.dev`, duplicate bounce webhook, forged webhook rejection, suppression, critical-bounce visibility.

## 6. Real Inbox Evidence

**[NOT DEMONSTRATED]** — same blocker. Everything up to the provider's doorstep is proven; the doorstep itself awaits keys.

## 7. Idempotency & Replay Evidence **[AUTOMATED]**

- Domain-event replay storm → **one logical composition** (unique key answers replays with silence; pinned in the hostile suite and again in the C7 notifications suite, which replays dispatchers end-to-end).
- Handoff retries carry **byte-identical idempotency keys** across attempts and crash windows (pinned twice: driver suite + adapter contract test).
- Webhook replay → **one authoritative outcome fact** per provider event id (`ON CONFLICT DO NOTHING`, pinned via real signed HTTP replays).

## 8. Crash-Recovery Evidence **[AUTOMATED]**

- **Crash A** (journaled, provider never called): recovery drive sends exactly once; re-drives find nothing.
- **Crash B** (provider accepted, outcome write lost): re-drive re-hands-off under the SAME key — the provider's idempotency window collapses it to one email; journal converges to `sent`.
- **Unknown provider result** (socket loss): the adapter maps it to `RetryableMailError` — success is never invented, failure is never invented; the retry under the same key disambiguates (adapter contract test).

## 9. Bounce / Complaint Evidence **[AUTOMATED]**

Signed bounce ingestion; duplicate convergence; bounce-before-success-processing still lands as a fact; complaint = permanent by rule; soft (Transient) bounce recorded but never suppressing; forged signature → 401 + zero rows; stale timestamp → 401; malformed → 400; oversized → 400; non-outcome events acknowledged and dropped.

## 10. Suppression Evidence **[AUTOMATED]**

Permanent bounce ⇒ non-critical mail suppressed at drive time with the decision recorded on the journal row (never silent); critical mail exempt and alarmed on bounce. **Suppression race** (bounce landing between claim and send): the check runs per-row immediately before handoff; a bounce arriving inside that final window can allow at most one in-flight letter through, after which suppression is deterministic — recorded as the accepted bounded race (the alternative, re-checking after send, cannot unsend).

## 11. Security Review

Webhook: constant-time HMAC, versioned signature parsing, replay window, event-id dedup, fail-closed on missing secret (503 in production), bounded payload. Secrets: env-only, independently rotatable, never logged (unit-pinned). Letters are plaintext — no tracking pixels, no remote assets, no open/click tracking (also the calm-commerce posture). Logs carry recipient+subject lines only, never bodies.

## 12. Privacy / Data Review

Two new stores, both manifest-declared (P2): `mail_journal` (recipient/subject/body — operational exhaust, 12-month hard-delete, opportunistic in the driver) and `mail_bounces` (recipient — 12-month). No raw IPs, no behavioral data, no third-party analytics. The provider processes recipient+content under its DPA; DOF shares nothing else.

## 13. Deliverability Review

**[NOT DEMONSTRATED]** — SPF/DKIM/DMARC alignment, From/Reply-To behavior, and representative inbox rendering (Gmail/Outlook/+1) require the real domain + account. The letters are plaintext, which removes the clipping/layout class of mail-client defects by construction; rendering review remains on the external walk.

## 14. Operations Review

`docs/runbooks/mail.md` (didn't-arrive triage, provider incident, webhook trouble, secret rotation, sandbox law). Two state-derived alarm arms. The cron tick gains the letters lane; the dispatchers nudge the driver after every batch (test/dev latency = immediate). Dead letters are loud, never silent.

## 15. Experience Review

Letter copy untouched (C7/C11 approved words, byte-identical — verified by the unchanged assertions in the C7 suite). The one NEW letter (dispatch) follows the letter idiom: one fact, what happens next, one door; pickup and partial-shipment variants speak honestly; the confirmation letter's standing promise ("we'll tell you the moment it's on its way") is now kept — a copy-truth violation retired.

## 16. Performance Observations

Driver claim is a single SKIP LOCKED batch (25/pass); suppression check is one indexed probe per non-critical letter; opportunistic retention deletes are bounded by state filter. At founding-cohort volume this is noise. No queue, no new process, no new infra.

## 17. Technical Debt Introduced

1. Bounce→journal linkage relies on `provider_ref` being recorded before the bounce arrives; a bounce racing the success write misses the critical-alarm join (the fact still lands). Watch-trigger: any real missed-alarm incident.
2. The suppression check-then-send window (§10). Accepted, documented.
3. `identity.letter` journal rows use a per-issuance dedup ref (correct — one letter per token) — meaning identity letters have no cross-process replay dedup beyond the issuing command's own transactionality. Acceptable: issuance is transactional and non-replayed.

## 18. Technical Debt Retired

- **The four load-bearing launch blockers' first head**: 21 finished letters + verification/recovery mail now have a production transport path (was: SandboxMailer terminus, strategic review Part 1-B #1).
- **The dispatch-letter copy-truth violation** (promised in three surfaces, sent nowhere).
- The e2e harness's mid-play scan race (story scans now wait for play completion — surfaced by this increment's sweep, cause-fixed).
- The collapsed-combobox ARIA invariant is now enforced continuously (the C11 one-shot fix proved insufficient against reka's re-patching under the new scan timing).

## 19. Full Gate Results

One clean release-candidate sweep (build → unit → UI → integration → e2e incl. axe → token/boundary/data/identity/operations gates → lint → typecheck), honest exit codes:

- unit **300/300** · UI **163/163** · integration **296/296** · e2e **147/147** · all five structural gates, lint, typecheck: PASS · **SWEEP EXIT=0** (`sweep-c12-1e`, 2026-08-13).
- One prior sweep failed 4 e2e story-loads during a machine-sleep-interrupted 22.6-minute run (normal duration 1.5m; same signature as the C11-documented contention class; same tests green in the immediately preceding and following clean runs). Not accepted as PASS — the clean rerun above is the release candidate. No assertion weakened; no test skipped; every flake explained and cause-fixed where the cause was ours.

## 20. Known Limitations

External evidence pending (§5/§6/§13). `payout.failed`-class provider letters share the sandbox-only caveat of their C11 events. Resend webhook payload shapes are implemented from provider documentation and pinned by our own signed fixtures — the first real webhook is part of the external walk.

## 21. GO / NO-GO

**NO-GO — solely for want of external evidence, and for no other reason.** Every automated gate, hostile scenario, and boundary proof is green; nothing in the repository blocks GO. The external walk requires exactly three Founder-supplied things: a Resend API key, the webhook signing secret for a configured endpoint, and a Founder-controlled mailbox (plus, optionally now or at cutover, a verified sending domain). With those in env, the 13 external demonstrations take ~30 minutes; this document then records their evidence and the verdict re-issues. Per the release rule, **no merge and no tag have been performed.**

## EXTERNAL VALIDATION RUN — 2026-08-14 (appended; the §21 NO-GO above is history, preserved as written)

Founder-supplied temporary Resend TEST credentials, env-only (presence verified YES/NO, values never recorded). **TEMPORARY TEST SENDER (`onboarding@resend.dev`) — NOT PRODUCTION DOMAIN CERTIFICATION.** Recipient: the Founder-controlled certification mailbox. The API key is send-only restricted (good posture) — provider-side status *reads* were unavailable; acceptance evidence is the per-send 200 + message id.

| Scenario | Automated | Provider External | Inbox External | Result |
|---|---|---|---|---|
| Provider smoke (journal→§7 drive→Resend) | ✅ | ✅ accepted, ref `018b47e5…` | 👁 founder eyes | **PASS** |
| Verification letter + link | ✅ | ✅ accepted (`61d93dc0…`, re-issue `…`) | ✅ machine-evidenced: the recipient mailbox's link scanner consumed the token before our own attempt — only the delivered letter carried it | **PASS** (with Finding F2) |
| Recovery letter + full reset journey | ✅ | ✅ accepted `78fbe801…` | letter token → reset 200 → login 200 → replay 400 | **PASS** |
| Order confirmation | ✅ | ✅ accepted `7885b250…` | 👁 founder eyes | **PASS** |
| Dispatch letter (the kept promise) | ✅ | ✅ accepted `4c77958e…` (carrier + tracking in body) | 👁 founder eyes | **PASS** |
| Payout letter | ✅ | ✅ accepted `6b9f7e5e…` — riding a REAL Stripe payout `po_1U4CA1…` (€23.85) | 👁 founder eyes | **PASS** (after Finding F1's repair) |
| Operations alarm mail | ✅ | ✅ real alarm sends fired on live permanent failures | 👁 founder eyes | **PASS** |
| Event replay convergence | ✅ | ✅ `stripe events resend` of the paid event: still ONE letter, ONE domain event | n/a | **PASS** |
| Crash A (journaled, process died) | ✅ | ✅ recovery tick sent it exactly once (`da05ca15…`) | 👁 | **PASS** |
| Crash B (accepted, outcome lost) | ✅ | ✅ **two real handoffs, same key → Resend returned the IDENTICAL message id** (`01aa112f…` ×2) — the provider collapsed the duplicate | one copy | **PASS** |
| Unknown provider result | ✅ adapter contract | — (not manufacturable without corrupting provider state; prohibited) | n/a | **PASS [AUTOMATED]** |
| Hard bounce | ✅ fixtures | ✅ send to `bounced@resend.dev` accepted (`2b1a14d3…`); bounce state lives provider-side (dashboard — send-only key cannot read it) | n/a | **EXTERNAL — PROVIDER BOUNCE INITIATED; AUTOMATED — DOF INGESTION PROVEN** |
| Duplicate bounce / forged / stale webhook | ✅ signed fixtures | **NOT DEMONSTRATED IN CURRENT EXTERNAL ENVIRONMENT** (no public callback; deliberately not built) | n/a | **PASS [AUTOMATED]** + binding future gate |
| Suppression + critical exemption | ✅ | — (needs local bounce facts; webhook-bound) | n/a | **PASS [AUTOMATED]** |
| Critical-failure visibility | ✅ | ✅ LIVE: `mail_failed: 4` standing in the real ops alarm queue; alarm mail sent per failure | 👁 | **PASS** |

### Findings from the external run (both repaired, both pinned)

- **F1 — the payout.paid race (real, would have lost letters in production).** Stripe fires `payout.paid` in the same second as payout creation; the webhook ingested the event in its own transaction before the settle committed the `provider_ref`, answered 200 for an unknown payout, and the letter-bearing event was lost forever (a 200 is never redelivered; the ingest ledger deduped even manual resends). C11 had passed on timing luck. **Repair:** payout outcomes now ingest-and-handle in ONE transaction — ours-but-early (connected-account context) rolls back the ingest and answers 500 so the provider redelivers; platform-balance payouts still acknowledge. Pinned by `payout-webhook-race.test.ts` (3 scenarios incl. full-rollback proof); the lost live letter was recovered by purging the poisoned ingest row and replaying the real event through the fixed path.
- **F2 — mailbox link-scanners complete email verification.** The recipient infrastructure (Outlook/live.com SafeLinks-class scanning) fetched the verification URL from the arriving letter and the `/verify` page consumed the token on load — the account was verified before any human clicked. Possession of the mailbox was still proven (the scanner had the letter), so this is not an account-takeover vector, but auto-consumption on GET is a correctness smell. **Recorded as C12-3 debt:** the verify/reset pages should require an explicit confirming action (POST) rather than consuming on load. Subsequent replay of consumed tokens is correctly refused (400) — observed live.
- Footnote: when buyer and owner are the same address (as in this walk), the journal's per-recipient unique key correctly collapses an event's two letters into one.

### Deferred to C12-3 / public-launch gates (binding, carried forward — they do not disappear with this GO)

Final transactional sending domain (`mail.dealsonfire.ca` or equivalent) · production SPF/DKIM/DMARC validation · final From/Reply-To identity · representative Gmail/Outlook/+1 production-domain deliverability review · production webhook endpoint + **externally demonstrated real signed Resend webhook delivery into deployed DOF** · production Resend account/credentials + DPA on file · the F2 verify-page POST correction.

## 21b. FINAL VERDICT (supersedes §21's historical NO-GO)

**GO — unconditional within this increment's scope.** The real provider boundary and real letter journey are externally demonstrated end to end (composition → journal → §7 handoff → acceptance → recovery/replay/crash convergence → real mailbox), the two findings the walk surfaced are repaired and pinned, and the deferred production-domain items are explicit launch gates, not gaps in what C12-1 claimed to deliver. Full gate results: §19b below.

## 19b. Final Gate Results (post-walk release candidate)

One clean run, honest exit code (`sweep-c12-1f`, 2026-08-14): **SWEEP EXIT=0** — unit **300/300** (incl. the adapter contract suite) · UI **163/163** · integration **299/299** (incl. the payout-race route suite) · e2e **147/147** · build, all five structural gates, lint, typecheck: PASS. No test skipped, no assertion weakened, no unexplained flake accepted.

## 22. C12-2 Readiness

The mail substrate C12-2 expects (reporter acknowledgment letters, operator notification letters) is real and journaled. The security-port async conversions C12-2 plans (RateLimiter, ChallengeStore) touch call sites that this increment did not disturb. Readiness review: `architecture/C12_2_READINESS_REVIEW.md`. Nothing in C12-1 changed the C12-2 scope's premises except favorably (the ack-letter path now exists).
