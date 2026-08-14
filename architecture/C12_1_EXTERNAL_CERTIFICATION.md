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

## 22. C12-2 Readiness

The mail substrate C12-2 expects (reporter acknowledgment letters, operator notification letters) is real and journaled. The security-port async conversions C12-2 plans (RateLimiter, ChallengeStore) touch call sites that this increment did not disturb. Readiness review: `architecture/C12_2_READINESS_REVIEW.md`. Nothing in C12-1 changed the C12-2 scope's premises except favorably (the ack-letter path now exists).
