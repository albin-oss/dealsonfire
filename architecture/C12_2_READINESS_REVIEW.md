# C12-2 PRINCIPAL ENGINEER READINESS REVIEW — Locks for Strangers

**Status:** For Founder authorization · 2026-08-13 · no C12-2 implementation performed
**Question:** is the previously approved C12-2 scope still the minimum correct next increment, attacked against the repository AS IT EXISTS after C12-1?

## Verdict per component

| Candidate component | Verdict | Reasoning against the current repository |
|---|---|---|
| Postgres-backed durable rate limiting | **KEEP** | `MemoryRateLimiter` remains the only implementation; production-decorative. Six call-site groups, all behind the `RateLimiter` seam (`define-public-endpoint`, `define-command-endpoint` ×3, step-up, media upload) — the async conversion is a bounded, type-checked sweep. |
| IPv6 /64 normalization | **KEEP** | No normalization exists anywhere; raw v6 keys = budget rotation for free. |
| HMAC-derived rate-limit keys, no raw-IP persistence | **KEEP** | Nothing persists IPs today (memory only) — durability without HMAC would CREATE an unregistered PII store. The HMAC secret is one new env value (justified; rotatable). |
| Production proxy/header trust enforcement | **KEEP** | `xForwardedFor: true` is trusted unconditionally today (`step-up.post.ts` and the public-endpoint key path); safe only because the platform sets it — that assumption must become a boot-time posture check, not a comment. |
| Postgres WebAuthn challenge store + atomic one-time consumption | **KEEP** | `MemoryChallengeStore` still bound at `container.ts:593` (recorded debt D-40e). `user_recovery_tokens` reuse re-examined and re-rejected: challenges are legitimately anonymous (auth ceremonies), recovery tokens are user-NOT-NULL. `DELETE … RETURNING` = take-is-consume; parallel ceremonies are distinct rows. |
| Async security-port conversion + complete call-site sweep | **KEEP** | Both ports are sync (`allow(): boolean`, `put/take` sync). Bounded: 6 limiter sites + 1 store binding + passkey-service internals. Must be one commit with typecheck as the net. |
| Retirement of production in-memory security state | **KEEP** | Memory implementations remain as explicit TEST bindings only. This is also where **dev-identity retirement and production env boot-gates (TD-007)** belong — they were in the approved program plan's C12-2 and are absent from the candidate list; **re-add them** (stranger statements #2 and #7 are unmet without them). CSP nonce tightening (TD-006 follow-up) rides here too, per the approved plan. |
| Abuse reporting (report → record → operator → decision → enforcement → audit) | **KEEP** | Still zero abuse tables/endpoints in the repo; the enforcement machinery (`enforcement_hold` in 20+ public reads, standing cascade) still has no reachable emitter. **New since the plan:** the reporter acknowledgment letter is now a one-line `journalLetter` call (non-critical — derived suppression applies correctly). No new mail machinery. |
| Closed subject/reason vocabulary + dedup | **KEEP** | `subject_type` closed enum (store/product/deal/spark/order) + `UNIQUE (subject_type, subject_ref, reporter_id)`; free text bounded and flagged sensitive in the manifest. Not an untyped dumping ground by schema. |
| `enforcement_hold` semantics preserved exactly | **KEEP (binding)** | Re-verified: held ⇒ masked-404 invisibility + till closed via existing gates; payouts untouched (that is `risk_paused`). The two operator commands are the machinery's first reachable emitters — they must not add a buyer-facing "closed for review" surface (Phase-4 decision, recorded). |
| Two minimum operator commands (hold / lift) | **KEEP** | Step-up-gated, audited, alarms-queue-surfaced; ops remains API + runbook — no dashboard. |
| State-derived abuse alarm | **KEEP** | One arm in the existing alarms derivation; follows the `mail_failed` pattern C12-1 just established. |
| Complete operator audit trail | **KEEP** | Existing per-domain audit primitives; every decision audited; `recordDenied` on refused gates. |

**REMOVE / not found in scope:** nothing in the candidate list is removable — each item maps to a currently-false stranger statement. **MERGE:** reporter/operator letters merge into the C12-1 journal (no new mail anything). **DEFER (explicitly out, unchanged):** moderation queues/UI, content scanning, reputation, appeals, blocklists, buyer-facing enforcement copy, any telemetry.

## The attack list, answered

- **Duplicated persistence** — none proposed: three tables (`rate_limit_buckets`, `webauthn_challenges`, `abuse_reports`), each owning irreducible state re-verified against existing primitives (idempotency store, recovery tokens, timeline, audit logs — all wrong-shaped for these truths).
- **Unnecessary endpoints** — one public report endpoint + two operator commands; nothing else.
- **Premature moderation / Trust & Reputation leakage** — reports are facts, not reputation events; no scores, no queues, no UI.
- **Living Street telemetry leakage** — none; the report subject reference stays generic (the recorded seam), nothing measures attention.
- **Silent `enforcement_hold` changes** — prohibited above, binding.
- **Raw PII** — no raw IPs anywhere (HMAC keys); reporter identity is the pseudonymous visitor/user id; free text bounded + manifest-flagged.
- **Rate-limit bypasses** — the global authed budget stays; public keys by HMAC(scope, normalized addr); the report endpoint additionally deduped per (subject, reporter) so shared-IP crowds can neither flood nor be collectively silenced.
- **IPv6 bypass** — /64 normalization before HMAC, v4 exact.
- **Proxy-header spoofing** — trust the platform-set header only; boot posture check refuses direct-exposure deployment.
- **WebAuthn replay/race** — hashed challenge at rest, TTL, `DELETE … RETURNING` consumption (a consumed or expired ceremony finds nothing); parallel ceremonies are independent rows; counter advance stays in the existing verify-tx.
- **Abuse-report flooding** — durable rate limits (built FIRST within the increment) + per-subject dedup + bounded payloads.
- **Operator actions without audit** — impossible by construction: the commands go through the audited command-endpoint pattern with step-up.

## Sequencing note (the one ordering constraint)

Build order within C12-2: durable limiter → challenge store → port sweep → env/identity/CSP gates → abuse intake (which depends on the durable limiter guarding its endpoint). Letters for acknowledgment/operator notice consume C12-1 as-is.

## Irreducible scope statement

Three tables, one public endpoint, two operator commands, one alarms arm, two async port conversions with their call-site sweep, one HMAC env secret, boot-time posture gates (env, identity mode, proxy trust), CSP nonce follow-up. Nothing else. Estimated as one increment, releasable and demonstrable on its own (hold/lift journey + cross-instance limit + passkey-across-restart).

## Founder decisions required before C12-2

**None blocking.** All prior Founder items (market/legal identity, growth-values boundary, brand) remain pre-public-launch per the roadmap and are untouched by this increment.
