# DOF Module 1 — Engineering Hardening Report (PROMPT-005)

## Scope & method
A file-by-file hardening pass over the Merchant Kernel, immediately after the PROMPT-004 production-readiness review. The review found **no Critical/High code defects**, so this pass is deliberately conservative: the foundation is meant never to be rewritten, and churning mature, tested code is a risk, not a virtue. Improvements were admitted only when they raise engineering quality **without changing business behavior** and **without breaking the test/deploy harness**.

## What changed
### 1. Baseline security response headers — `server/middleware/03.security-headers.ts` (NEW)
The one material gap the review surfaced: the app set **no** security headers. Added, applied to every response:
- `X-Content-Type-Options: nosniff` — kills MIME-sniffing.
- `X-Frame-Options: SAMEORIGIN` — clickjacking defense.
- `Referrer-Policy: strict-origin-when-cross-origin` — referrer minimization.
- `X-DNS-Prefetch-Control: off`.
- `Strict-Transport-Security` (2y, includeSubDomains, preload) — **production only** (never in dev, where TLS is absent).

Verified live: the four baseline headers are present on API + page responses; HSTS correctly absent in dev. No CSP shipped — a wrong CSP breaks the app, so it is tracked as TD-006 with a proper plan, not bolted on blindly.

### 2. Documentation deliverables (NEW)
`HARDENING_REPORT.md`, `PERFORMANCE_NOTES.md`, `SECURITY_NOTES.md`, `ARCHITECTURE_NOTES.md`, `CHANGELOG.md`, and a consolidated `TECHNICAL_DEBT.md`. These capture the load-bearing engineering decisions so future modules build on shared understanding — the review noted onboarding/architecture docs as the real gap, not the code.

## What was reviewed and deliberately left unchanged (with evidence)
| Area | Finding | Why unchanged |
|---|---|---|
| Domain purity | `check:boundaries`: 103 domain files, zero framework imports | Already conformant |
| Type safety | **1** `any` in the whole merchant domain | Already excellent |
| Transactional outbox | event + outbox row in one caller tx ([event-store.ts](platform/event-store.ts)) | Correct |
| Concurrency | `SKIP LOCKED` partition-serial claim; `UNIQUE(agg,seq)` optimistic guard; atomic handle `ON CONFLICT` | Race-safe |
| Delete behavior | every FK `ON DELETE RESTRICT` | Correct (no cascade) |
| Idempotency | D-01 store + 24h purge; handle claim; consumer `event_deliveries` | Complete |
| Audit/event immutability | grant-based (TD-001) | Documented deviation; deploy gate, not code |
| Env validation | localhost/dev prod fallbacks (TD-007) | Hard validation would break the prod-build E2E harness |
| Magic strings | statuses are text+CHECK mirrored by typed unions | Single source, not magic |

## Honest conclusion
Module 1 was already enterprise-grade. This pass added the missing security-header baseline (a real, expected hardening) and the decision documentation. Everything else that "could be changed" either was already right or would have traded working, tested behavior for cosmetic churn — which this foundation cannot afford. Remaining items are deployment gates (TD-001, TD-007) and future-module boundaries (TD-002/003/004/006), all tracked.
