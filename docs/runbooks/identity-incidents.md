# Runbook — Identity Incidents (WP-R1-B1)

## Credential stuffing / brute force
**Signal:** login failure-rate spike (dashboard: auth failure rate), 429 rate on `auth.login`.
**Response:** (1) confirm the IP distribution — broad = stuffing, narrow = single attacker; (2) the per-IP limiter (10/min) already throttles; tighten via config if needed; (3) affected accounts: force `logout-all` + reset via support-consent; (4) never disclose which accounts were probed (enumeration-proofing holds).

## Session revocation (compromised session / user request)
`SELECT` the user's sessions; `container.identity.sessions.revokeAll(userId, null)` (emits `identity.session.revoked_all`). For a single device, revoke by session id.

## Reset-token abuse
Reset tokens are single-use, 30-min, hashed. If a token leaks: it self-expires; issuing a new reset invalidates outstanding ones. Mass revoke: purge `user_recovery_tokens` for the user.

## Email deliverability
Sandbox provider in dev/test (in-memory outbox). Production: verify SPF/DKIM/DMARC on the provider; hard bounces suppress. If verification/reset mail fails, users can still USE DOF (verification gates only recovery) — no selling impact.

## Dev-identity-in-production guard
`server/utils/identity.ts` refuses the dev adapter when `NODE_ENV=production` (returns null → all auth 401). `check:identity` statically enforces this. If auth is universally failing in prod, confirm `NUXT_IDENTITY_MODE=session` is set.
