# Changelog

## Ignite — Vertical Slice 001 (PROMPT-008)
Ignite's create→store→publish vertical already existed (tasks #19–22, ADR-005): journey UI, `LaunchService` over the Merchant Kernel, `IgniteIntelligence` AI extension port + rule-based stub, live `StorefrontPreview`. This slice closed the one backend gap and documented the architecture.

### Added
- Real-time handle availability: `GET /api/v1/handles/:handle/availability`, `handleAvailabilityQuery`, `PgHandleLedger.lookup()` (advisory read; the atomic `ON CONFLICT` claim remains authoritative). Contract `handleAvailabilityResponse`.
- `IGNITE_ARCHITECTURE.md` — flow, AI extension seams, DoD status, and the public-storefront plan.
- +4 handle-availability integration tests; handle-service race unit tests updated for the new port method.

### Deferred
- Public storefront route (DoD step 5) — the R1-B5 buyer surface per DPS-001; plan captured in IGNITE_ARCHITECTURE.md (no schema change needed).

## Shared Kernel (PROMPT-006)
### Added
- `Result` combinators (`map`, `mapErr`, `andThen`/`flatMap`, `mapAsync`, `andThenAsync`, `combine`, `unwrapOr`, `fromPromise`, guards) — purely additive over the existing union; +10 tests.
- `SHARED_KERNEL.md` — inventory, boundaries, dependency rules, and consolidation recommendations (R1–R4).

## Platform Specification (PROMPT-007)
### Added
- `architecture/DPS-001-platform-specification.md` — master platform spec (IA, screen inventory, journeys, navigation, component inventory, state machines, cross-domain matrix, experience principles, expansion strategy).

## Module 1 Hardening Pass (PROMPT-005)

### Added
- `server/middleware/03.security-headers.ts` — baseline security response headers on every response (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`; `Strict-Transport-Security` in production only). Verified live; no CSP (tracked as TD-006).
- `HARDENING_REPORT.md`, `PERFORMANCE_NOTES.md`, `SECURITY_NOTES.md`, `ARCHITECTURE_NOTES.md`, `CHANGELOG.md` — engineering-decision documentation.

### Changed
- `TECHNICAL-DEBT.md` → `TECHNICAL_DEBT.md` (renamed to the requested name) and extended with TD-006 (CSP) and TD-007 (production env fail-fast).

### Unchanged (deliberate)
- No merchant-kernel domain, application, infrastructure, migration, endpoint, or contract file was modified. The PROMPT-004 review found no Critical/High code defects; the foundation is not rewritten for cosmetic reasons.

### Behavior impact
- None to business logic. The only observable change is additional security headers on HTTP responses.

### Verification
- typecheck ✅ · lint ✅ · unit 255 ✅ · integration 135 ✅ · app E2E 21 ✅ · check:boundaries/:data/:identity/:operations/:tokens ✅
