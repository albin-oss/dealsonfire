# DOF Module 1 — Security Notes

The Merchant Kernel's security posture and the decisions behind it. Every claim maps to a real file.

## Authorization — the triple command gate
Every mutating command passes RBAC → Entitlement → Trust/Standing, centralized in `domains/merchant/shared-kernel/command-gate.ts` and enforced in the **application layer**, never API-validation-only. Proven by the `endpoints.test.ts` rejection battery: `403 PERMISSION_DENIED` (staff role can't publish), `403 CAPABILITY_MISSING` (second store needs `stores.multiple`), `403 STANDING_BLOCKED` (suspended can't write, restricted can't publish), `423 ENFORCEMENT_HOLD` (hold blocks publish independent of status). Capability requirements are **data-driven** (`capabilities` table), not hardcoded branches.

## Tenant isolation & IDOR
Cross-tenant reads/writes return a **masked `404`** (not `403`) so existence isn't leaked — tested ("404 masks other tenants' businesses and stores"). Repositories are always scoped by the resolved actor's business membership; no endpoint takes a caller-supplied `business_id` as authority.

## Replay & idempotency
- **Idempotency-Key** (D-01): stored request→response by `(key, endpoint, actor)`; replay returns the stored response and creates exactly one resource; a failed request releases the key. 24h purge.
- **Handle claims** are atomic (`INSERT … ON CONFLICT (handle) DO UPDATE … WHERE reserved expired`) on a `citext` PK — concurrent claims can't both win, no hijacking.

## Input handling
- All request bodies are `zod .strict()` → **mass assignment** is structurally impossible (unknown keys rejected).
- All SQL is parameterized; dynamic table names in the parameterized event-store/dispatcher pass through `assertSqlIdentifier` → no injection surface.
- JSONB columns hold bounded config/VO payloads, validated by domain value objects before persistence.

## Authentication boundary & CSRF
- Session cookie is `httpOnly; Secure; SameSite=Lax`; `01.session.ts` resolves it, `02.csrf.ts` adds an Origin/Referer same-site assertion on mutating API calls in session mode (dev-header mode is exempt — it carries no ambient credential).
- Public auth endpoints (register/login/recovery) are IP-rate-limited; authed commands are per-user rate-limited.

## Audit integrity
- `audit_logs` is append-only and month-partitioned; `PgAuditLog` is insert-only (no update/delete path in code).
- **Immutability is currently grant-enforced** (`db/grants/immutable-tables.sql` REVOKEs UPDATE/DELETE for the app role) — this is a **deployment gate (TD-001)**: production must connect as the restricted role. Trigger-level defense-in-depth is TD-002.

## Enumeration resistance
Registration/login/recovery answer uniformly regardless of account existence, with constant work (dummy hash) so timing doesn't leak — identity-domain battery, reused by the merchant surface's auth boundary.

## Transport headers (added this pass)
`03.security-headers.ts`: `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`, and HSTS in production. **CSP is deferred (TD-006)** — shipping a wrong one breaks the app; it gets a dedicated nonce-based pass.

## Secrets & logging
No secrets/PII in logs — structured logs carry correlation IDs and command names, not bodies or tokens. `NUXT_CRON_SECRET` gates the dispatch endpoint (Bearer; fails closed in production). Tokens/passwords are hashed at rest (sha-256 / argon2id) in the identity domain that fronts this kernel.

## Residual risks (tracked)
TD-001 (role deployment), TD-006 (CSP), TD-007 (prod env fail-fast). SSRF is not applicable in Module 1 (no outbound media/domain fetches yet) — to be threat-modeled when media/custom-domain integrations land.
