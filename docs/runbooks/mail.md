# Runbook — Mail (C12-1 "The Letters Arrive")

## The shape (know this before touching anything)

Letters follow §7: consumers **compose + journal** (`mail_journal`) inside their
transaction → the **driver** sends OUTSIDE any transaction under a stable
idempotency key (`mail:{consumer}:{dedup_ref}:{recipient-hash}`) → the outcome
settles on the row (`sent` / `suppressed` / `failed`). Bounces and complaints
arrive on `POST /api/webhooks/mail` (Svix-signed) and land in `mail_bounces`.
Suppression is DERIVED: a permanent bounce silences future NON-critical mail;
**critical letters (identity + money) always send and ALARM when they bounce.**

Honest semantics: exactly-once composition (ours) · idempotent handoff (the
provider collapses retries) · delivery itself is the recipient server's world —
never claim "received", only what `mail_bounces` proves.

## The letter didn't arrive

1. `SELECT state, attempts, last_error, provider_ref FROM mail_journal WHERE recipient = '<email>' ORDER BY created_at DESC LIMIT 5`
2. `pending` with attempts climbing → provider trouble; the driver retries on
   backoff (cron tick each minute). 5+ attempts surfaces as `mail_failed` in
   `/api/v1/ops/alarms`. Check provider status before anything else.
3. `failed` → the provider refused definitively (`last_error` says why —
   usually a malformed recipient). Fix the cause; there is no auto-resend of a
   failed row (re-issuing the letter is the owning flow's decision, not SQL's).
4. `sent` but not in the inbox → check `mail_bounces` for the recipient; then
   spam folder; then the provider dashboard with `provider_ref`.
5. `suppressed` → a permanent bounce exists for that address. Correct address →
   the person updates it; wrong suppression → investigate the bounce fact
   before deleting anything (facts are truth; deletion is a documented act).

## The alarms

- **`mail_failed`** — a letter failed permanently or is stuck at ≥5 attempts.
- **`mail_bounced_critical`** — a CRITICAL letter bounced/complained: the
  person may be missing identity/money truth. Reach them another way (the
  order page still shows everything; ops notes record the attempt).

## Provider incident (5xx storm / outage)

Nothing to do: journaled letters retry on backoff and nothing is lost. After
recovery, one cron tick drains the backlog. Verify with:
`SELECT state, count(*) FROM mail_journal GROUP BY state`.

## Webhook trouble

Signature failures (401 in logs) → the `NUXT_MAIL_WEBHOOK_SECRET` doesn't match
the provider's endpoint secret — rotate BOTH together. The intake fails closed:
misconfiguration refuses events rather than accepting unsigned ones; Resend
retries webhooks, so nothing is lost while you fix it.

## Secrets

`NUXT_RESEND_API_KEY` (send) and `NUXT_MAIL_WEBHOOK_SECRET` (intake) — env
only, independently rotatable: add the new key at the provider, update env,
redeploy, revoke the old. Never in logs, never in git.

## Sandbox law

No configured provider (`NUXT_MAIL_PROVIDER` unset) → `SandboxMailer`: letters
journal and "send" to a log line; nothing leaves the machine. Tests run
sandbox-only. Production configuration is the cutover document's row, not code.

## Production cutover gates (BINDING — set at the C12-1 external certification)

Before PUBLIC PRODUCTION LAUNCH, these must be externally demonstrated (they
were deliberately deferred from the temporary-sender certification and must
not disappear): final transactional sending domain with SPF/DKIM/DMARC
validated · final From/Reply-To identity · Gmail/Outlook/+1 deliverability
review on the production domain · production webhook endpoint receiving a
REAL signed Resend webhook into deployed DOF · production credentials + DPA
on file · the verify/reset pages consume tokens on explicit POST, never on
page load (mailbox link-scanners were observed completing verification).
