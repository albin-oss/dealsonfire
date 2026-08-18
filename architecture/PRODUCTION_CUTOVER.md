# PRODUCTION CUTOVER — what is proven, what is merely configured, and what only the Founder can supply

**Status:** BINDING checklist · consolidated at C12-3 (Launch Foundations close) · 2026-08-17
**Law:** nothing on this list may move to a stronger class without the evidence the class demands. Writing "done" here without the evidence is the one unforgivable document crime.

Every line carries exactly one classification:

- **PROVEN** — demonstrated with evidence (automated, browser, external, or drill), already true today.
- **CONFIGURED-NOT-PROVEN** — the code path exists and is tested in sandbox/test mode, but the production instance of the fact has never been observed. The distinction C12-1 made binding: *provider acceptance ≠ inbox delivery; a webhook tested by fixture ≠ a webhook received in production.*
- **FOUNDER-COUNSEL** — requires a human decision or professional advice no engineer may invent (legal wording, entity, tax posture).
- **DEPLOYMENT** — becomes checkable only once a deployed environment exists; blocked on hosting, not on code.
- **PUBLIC-LAUNCH-GATE** — a hard NO-GO for public launch until satisfied; the subset of the above that blocks strangers-at-scale, restated so nobody has to re-derive it.

---

## 1. Money (C10/C11)

| Fact | Class | Evidence / what's missing |
|---|---|---|
| Two-phase provider boundary, G2 tripwire, rollback law | **PROVEN** | C10 gates G1–G9; hostile suites; v1.42.0 |
| Live payout river: Stripe ≡ journal ≡ ledger ≡ money story, to the cent | **PROVEN** | C11 external certification (live test-mode Connect account), v1.43.0 |
| Webhook invariant — observed is never consumed; failed processing redelivers | **PROVEN** | C12-2 6-scenario route suite + the live lost-letter recovery in C11 |
| Live-mode Stripe keys, live webhook endpoint secret | **CONFIGURED-NOT-PROVEN** | all live evidence is test-mode; live-mode signature + first real charge never observed |
| Live Stripe webhook received by the DEPLOYED endpoint | **DEPLOYMENT** | requires public URL; `stripe listen` was the test-mode transport |
| Real merchant onboarding with real bank account, first real payout arrives | **PUBLIC-LAUNCH-GATE** | the C11 river must be re-walked once in live mode before strangers' money is taken |

## 2. Mail (C12-1)

| Fact | Class | Evidence / what's missing |
|---|---|---|
| Exactly-once composition, idempotent handoff, bounce-fact outcomes | **PROVEN** | C12-1 external cert: two real handoffs → one Resend message id (01aa112f…) |
| Real inbox delivery of every identity/commerce letter class | **PROVEN** | [EXTERNAL] inbox evidence, temporary test sender |
| Production sender domain (DKIM/SPF/DMARC verified in Resend) | **FOUNDER-COUNSEL** + **CONFIGURED-NOT-PROVEN** | domain choice is the Founder's; verification then needs DNS evidence |
| Real signed Resend bounce webhook into the DEPLOYED endpoint | **PUBLIC-LAUNCH-GATE** (binding, recorded in C12-1) | fixtures proved the handler; the public callback has never fired |

## 3. Security posture (C12-2)

| Fact | Class | Evidence / what's missing |
|---|---|---|
| Durable rate limits (HMAC digests, no raw IPs), durable one-shot WebAuthn challenges | **PROVEN** | 13-scenario locks matrix, restart + concurrency evidence |
| Production boot gate refuses dev posture with named problems | **PROVEN** | unit-pinned `productionGateProblems()` + plugin |
| CSP nonce + strict-dynamic on every HTML render | **PROVEN** (dev-shape) | header observed in browser; **DEPLOYMENT**: re-verify on the real domain behind the real proxy |
| `NUXT_TRUST_PROXY=platform` matches the actual platform's proxy chain | **DEPLOYMENT** | declared, but the real hop count is a property of the host |
| Secrets present as env on the production host (session, HMAC, cron, Stripe, Resend) | **DEPLOYMENT** | the gate will name any absentee at boot |

## 4. The person (C12-3)

| Fact | Class | Evidence / what's missing |
|---|---|---|
| Scanner-safe tokens — GET never consumes; explicit POST, one winner under race | **PROVEN** | [BROWSER] zero requests on GET; [AUTOMATED] hostile matrix |
| Email-change law — step-up, possession proof, enumeration-proof, 72h revert, full lockdown | **PROVEN** | takeover-defense scenario end-to-end in the matrix |
| Guest order keys — one order, masked 404 otherwise, replay-by-design | **PROVEN** | matrix D |
| Consent facts — append-only, derivation latest-per-document | **PROVEN** | matrix E |
| Legal documents (terms, privacy, returns, impressum) | **FOUNDER-COUNSEL** — **PUBLIC-LAUNCH-GATE** | placeholders are marked NOT APPROVED FOR PUBLIC LAUNCH; no engineer invents legal wording; counsel must supply text, then versions bump and consent re-ask policy is a Founder decision |
| Merchant/platform legal entity, tax, jurisdiction | **FOUNDER-COUNSEL** | outside engineering entirely |

## 5. Recovery (C12-3)

| Fact | Class | Evidence / what's missing |
|---|---|---|
| Backup restores; restored copy holds L1/L3, row parity, identity integrity | **PROVEN [DRILL]** | `scripts/restore-drill.mjs`: 0.7 s wall clock at current volume; first run honestly FAILED on real schema drift (dev world missing 0030), which is the drill working |
| Drill guardrails as code (loopback-only, `_drill` name gate, explicit aiming) | **PROVEN** | in the script, not in prose |
| Scheduled production backups (cron + retention) | **DEPLOYMENT** | no production host yet; the drill is the acceptance test for whatever schedule exists |
| Restore onto a DIFFERENT host; media files (not in pg_dump); PITR/WAL | **CONFIGURED-NOT-PROVEN** | recorded in the drill's own not-proven list |
| One drill against a production-sized copy before launch | **PUBLIC-LAUNCH-GATE** | duration was measured at 1,155 rows; the number is honest but not predictive |

## 6. The public-launch gate, in one place

No strangers at scale until ALL of:

1. Live-mode Stripe river re-walked once (real charge → real payout → four-view equality).
2. Real signed Resend webhook received by the deployed endpoint (C12-1 binding gate).
3. Production sender domain verified; letters arrive from it, not the test sender.
4. Counsel-approved legal documents replace every placeholder; versions bumped.
5. CSP + proxy-trust re-verified on the real domain.
6. Restore drill re-run against the production backup mechanism, on a different host than the one that took the backup.
7. The controlled-stranger-cohort GO from LAUNCH_FOUNDATIONS_RETROSPECTIVE.md (a smaller, earlier bar) does NOT satisfy this list — cohort ≠ public.
