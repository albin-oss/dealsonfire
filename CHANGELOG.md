# Changelog

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
