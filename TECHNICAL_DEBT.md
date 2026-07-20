# DOF — Technical Debt Register

Intentionally-deferred items from the Module 1 review (PROMPT-004) and hardening pass (PROMPT-005). Each references a real file with a rationale and a milestone. **No Critical or High code defects exist** — these are hardening, deployment gates, and future-module boundaries.

| ID | Sev | Title | Owner | Milestone |
|----|-----|-------|-------|-----------|
| TD-001 | High (ops) | Append-only immutability is grant/role-dependent | platform/infra | Before production launch |
| TD-002 | Medium | No trigger-level defense-in-depth for immutable tables | platform | Module 3 |
| TD-003 | Low | Optimistic-concurrency conflicts surface without auto-retry | platform | Module 2 |
| TD-004 | Low | Last-owner protection needs app enforcement once staff endpoints exist | merchant | Module 2 |
| TD-005 | Info | Migration 0001 predates `seq`/`correlation_id`/`causation_id` (added in 0003) | platform | n/a |
| TD-006 | ~~Medium~~ CLOSED (Release 1.5) | Production CSP ships in security-headers middleware | platform/web | done |
| TD-007 | Low | Production env vars fall back to localhost/dev defaults instead of failing fast | platform | Before production launch |

---

## TD-001 — Append-only immutability is grant/role-dependent (High, ops)
`audit_logs` / `*_domain_events` are immutable only for the restricted `{{APP_ROLE}}` ([db/grants/immutable-tables.sql](db/grants/immutable-tables.sql)); an owner connection bypasses it. No app code path issues UPDATE/DELETE on these tables (verified), so exposure is defense-in-depth. **Fix (deploy gate):** provision `dof_app`, run `db/apply-grants.ts`, point prod `NUXT_DATABASE_URL` at it. **Acceptance:** staging proves the app role gets `42501` on `UPDATE audit_logs`.

## TD-002 — Trigger-level immutability defense-in-depth (Medium)
A `BEFORE UPDATE OR DELETE … RAISE` trigger on the append-only tables would enforce immutability regardless of role. Deferred: cross-domain migration touching every events/audit table; must be proven not to break partition maintenance. **Milestone:** Module 3.

## TD-003 — Optimistic-concurrency without auto-retry (Low)
[platform/event-store.ts](platform/event-store.ts) relies on `UNIQUE(aggregate_type, aggregate_id, sequence)` to reject a racing writer (safe — loser rolls back), but the loser surfaces as a 500 with no retry. A bounded retry-on-serialization wrapper in the command endpoint would smooth true simultaneity. **Milestone:** Module 2.

## TD-004 — Last-owner protection (Low, future boundary)
`idx_one_owner_per_business` enforces *at most one* owner, not *at least one*. No staff-demotion endpoint ships in Module 1, so "remove the last owner" is unreachable. When staff management lands, demotion/transfer must run under `SELECT … FOR UPDATE` and refuse to leave zero owners. **Milestone:** Module 2.

## TD-005 — Migration 0001 predates trace/seq columns (Info)
`correlation_id`/`causation_id`/`seq` are added in `0003_event_traceability.sql`; the running system applies all migrations. Correct forward-only evolution. No action.

## TD-006 — No Content-Security-Policy (CLOSED, Release 1.5)

Production-only CSP now ships in `server/middleware/03.security-headers.ts`
('unsafe-inline' script/style is the stated cost of Nuxt hydration today; a
nonce-based tightening remains possible later). Original entry kept below for history.
`03.security-headers.ts` sets the safe baseline (nosniff, frame-options, referrer-policy, HSTS) but **no CSP** — a correct policy for the SSR app + inline styles + Storybook needs its own pass (nonce strategy, `style-src`, connect-src for the API). Deferred rather than shipped wrong (a broken CSP breaks the app). **Milestone:** Module 2.

## TD-007 — Production env vars default to localhost/dev (Low)
[server/utils/config.ts](server/utils/config.ts) falls back `appBaseUrl`→localhost, `webauthnRpId`→localhost, `identityMode`→dev even when `NODE_ENV=production`. `identityMode` is already backstopped (the dev adapter refuses prod); the others surface as obviously-broken email/WebAuthn links. Hard fail-fast validation is **not** added because the production-build E2E harness boots without these set — validation would break it. **Fix:** a production-only `assertProductionConfig()` invoked from the deploy healthcheck (not module load), plus documenting the required env in the runbook. **Milestone:** before production launch.
