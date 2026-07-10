# DOF Platform — EXEC-R1-B1

# Engineering Execution Plan — Release 1 · Batch 1 · Identity & Sessions

**Status:** Accepted (internal engineering guide) · **Date:** 2026-07-07
**Author:** Lead Engineer · **Governs:** the implementation of WP-R1-B1 (frozen).
**Binding docs:** WP-R1-B1 · RELEASE-001-SPECIFICATION · IMPLEMENTATION-ROADMAP-v1.0 · Engineering Constitution · ADR-001…008 · CDC-001 · DECISIONS.md (D-04 identity port, D-22 quartet, D-38/D-39 aggregate laws).
**Nature of this plan:** the safest sequence to fill the seam that already fails closed (`server/utils/identity.ts` `'session'` → null). It is validated against the domain's proven precedents (Merchant kernel, Commerce slice, Operations Batch 1) — every ordering choice below has a working analogue in the repo, so the plan is low-novelty by design. Novelty is isolated to three spots (crypto, WebAuthn, the session middleware) and each is scheduled behind a checkpoint.

---

## 1. Dependency Graph

```
                    ┌─────────────────────────────────────────────┐
                    │ P0  deps (hash-wasm, @simplewebauthn/*)      │  ← spike first: prove argon2id runs
                    └───────────────────┬─────────────────────────┘
                                        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ P1  DB: migration 0008 · manifest(+11) · grants · shared-kernel ids     │
   └───────────────────┬────────────────────────────────────────────────────┘
                        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ P2  Domain (pg-free): value-objects · ports · events · User aggregate   │  depends on: ids only
   └───────────────────┬────────────────────────────────────────────────────┘
                        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ P3  Infrastructure: crypto(argon2id/sha256) · user-repo · session-store │  depends on: P1 schema + P2 ports
   │      · token-stores(recovery/guest/claim/passkey) · webauthn · email    │
   └───────────────────┬────────────────────────────────────────────────────┘
                        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ P4  Application services: SessionService · AuthService · GuestClaim      │  depends on: P2 + P3
   └───────────────────┬────────────────────────────────────────────────────┘
                        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ P5  Composition + edge: event payloads/lock · container block ·         │  depends on: P4
   │      public-endpoint wrapper · SESSION ADAPTER (middleware) · endpoints  │
   └───────────────────┬────────────────────────────────────────────────────┘
                        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ P6  Frontend: useSession · route guard · auth pages · step-up ·         │  depends on: P5 endpoints
   │      passkey client · user-menu · Ignite claim hand-off                 │
   └───────────────────┬────────────────────────────────────────────────────┘
                        ▼
        P7  check:identity gate · CI wiring · DECISIONS(D-40) · runbook
```

**The five ordering laws (WP §7's spine, made explicit):**
1. **Schema before repositories** — a repo cannot rehydrate a table that does not exist.
2. **Ports before implementations** — the domain declares `PasswordHasher`/`TokenHasher`; crypto binds them later (keeps the domain pg-free / boundary-clean).
3. **Domain events before endpoints** — the payload schema + registry lock must exist before any code appends an event (M-6).
4. **Session service before middleware** — the middleware is a thin cookie→`resolve()` call; `resolve()` must be real first.
5. **Middleware before UI** — the browser cannot be "logged in" until the adapter populates `event.context.auth`.

## 2. File Creation Order (first → last)

> Checkpoint column: the smallest thing that proves the file works before moving on.

| # | File | Purpose | Depends on | Completion checkpoint |
|---|---|---|---|---|
| 1 | `package.json` (+deps) | hash-wasm, @simplewebauthn/server(+browser) | — | argon2id encode/verify runs in a node one-liner |
| 2 | `db/migrations/0008_identity.sql` | quartet + 7 identity tables | citext (0001) | applies clean on embedded PG; indexes present |
| 3 | `contracts/data/manifest.json` (+11) | manifest-first law | 2 | `check:data` count assertion updated & green |
| 4 | `db/grants/immutable-tables.sql` (edit) | quartet immutability | 2 | grants cover identity events+audit |
| 5 | `domains/identity/shared-kernel/ids.ts` | branded ids | — | asUserId rejects non-uuid |
| 6 | `domains/identity/domain/value-objects.ts` | email/password/name VOs | — | unit: policy + normalization |
| 7 | `domains/identity/domain/ports.ts` | hasher/repo/email interfaces | 5 | compiles (types only) |
| 8 | `domains/identity/domain/events.ts` | 2 event constructors + scope | 5 | **watch the `*/` trap (see §7 R-4)** |
| 9 | `domains/identity/domain/user.ts` | User aggregate (register/verify) | 6,8 | unit: register emits, verify idempotent |
| 10 | `domains/identity/infrastructure/crypto.ts` | argon2id + sha256 (ports impl) | 1,7 | unit: hash/verify/salt/deny-malformed |
| 11 | `…/infrastructure/user-repository.ts` | User persistence + rehydration guard | 2,9 | integration: insert→findByEmail round-trip |
| 12 | `…/infrastructure/session-store.ts` | sessions table access | 2 | integration: create→findActiveByTokenHash |
| 13 | `…/infrastructure/token-stores.ts` | recovery/guest/claim/passkey stores | 2 | integration: single-use consume; claim conflict |
| 14 | `…/infrastructure/webauthn.ts` | ceremonies + ChallengeStore | 1 | (defer full proof to E2E; compile + option gen) |
| 15 | `…/infrastructure/email.ts` | EmailPort + sandbox provider | 7 | outbox records a sent message |
| 16 | `…/application/session-service.ts` | issue/resolve/revoke/step-up + event | 12 | integration: issue→resolve→revoke |
| 17 | `…/application/auth-service.ts` | register/login/recovery/verify | 10,11,13,15 | integration: enumeration parity |
| 18 | `…/application/guest-claim-service.ts` | guest tokens + claims | 13 | integration: round-trip + idempotency |
| 19 | `shared/errors.ts` (edit) | EMAIL_TAKEN/INVALID_CREDENTIALS/INVALID_TOKEN | — | codes map to status |
| 20 | `contracts/schemas/events/identity-payloads.ts` | 2 registered payloads + lock | 8 | registry-lock test green |
| 21 | `server/utils/config.ts` (edit) | appBaseUrl, webauthn RP config | — | typed reads |
| 22 | `server/utils/container.ts` (edit) | identity block + own quartet dispatcher | 16,17,18,20 | container builds |
| 23 | `server/utils/define-public-endpoint.ts` | pre-session wrapper | 22 | validation + rate-limit + problem render |
| 24 | `server/utils/auth-cookie.ts` | httpOnly/Secure/Lax cookie | 16 | set/clear |
| 25 | `server/middleware/auth.ts` | **THE SEAM**: cookie→context.auth | 16 | integration: cookie authenticates /session |
| 26–38 | `server/api/v1/auth/*` (13 endpoints) | the auth surface | 22–25 | per-endpoint integration assertion |
| 39 | `contracts/schemas/identity/auth.schema.ts` | request contracts | — | (write alongside 26) |
| 40 | `app/composables/useSession.ts` · `useStepUp.ts` · `usePasskey.ts` | client state | 26+ | refresh reflects /session |
| 41 | `nuxt.config.ts` (edit) | public identityMode | — | guard reads it |
| 42 | `app/middleware/auth.ts` | route guard (session mode only) | 40,41 | redirects only in session mode |
| 43 | `app/pages/{login,register,forgot,reset}.vue` + `components/auth/*` | auth UI | 40 | E2E: register→workspace |
| 44 | `app/components/workspace/WorkspaceTopBar.vue` (edit) | identity + sign-out | 40 | menu shows email; sign-out works |
| 45 | `app/pages/register.vue` (claim) + `app/pages/index.vue` (guard) | Ignite claim + workspace guard | 42 | claim attaches; guard active |
| 46 | `scripts/check-identity.mjs` + `package.json` + `ci.yml` | the gate | all | gate green |
| 47 | `DECISIONS.md` (D-40) · `docs/runbooks/identity-incidents.md` | docs | all | committed |
| — | test harness edits (`tests/helpers/{pg,app}.ts`) | truncation + cookie resolver | alongside P5 | suites can auth by cookie |

## 3. Migration Strategy

- **Order:** 0008 follows 0007 (forward-only; the house law — no down-migrations, the 0002/0007 review-fix precedent). One migration, whole domain.
- **Rollback:** there is none by design (ADR-004). Safety comes from *forward* correctness: 0008 is greenfield (no data to lose), applied first on embedded PG in the integration suite before it ever touches a shared environment. A defect is fixed by 0009, never by reverting 0008.
- **Verification:** (1) `migration.test.ts` count assertion bumps to 8; (2) `check:data` manifest-first gate (38 tables); (3) grants re-run covers the new immutable tables; (4) the integration suite's `truncateAll` lists every new table (proves they exist and are FK-consistent); (5) citext email uniqueness proven by the duplicate-registration test.

## 4. Implementation Phases

| Phase | Content | Exit condition |
|---|---|---|
| **P0 spike** | install + prove argon2id runs in-environment | a passing hash/verify one-liner (de-risks the whole batch's crypto choice) |
| **P1 database** | migration, manifest, grants, ids | `check:data` green; migration applies |
| **P2 domain** | VOs, ports, events, User | domain unit tests green; `check:boundaries` clean (no pg/crypto in domain/) |
| **P3 infrastructure** | crypto, repos, stores, webauthn, email | repo/crypto integration + unit green |
| **P4 application** | session, auth, guest-claim services | service-level integration green (issue/resolve, enumeration parity, recovery single-use) |
| **P5 composition + edge** | payloads/lock, container, wrappers, **middleware (the seam)**, endpoints | the cookie→/session round-trip passes — *the batch's definition of done* |
| **P6 frontend** | composables, guard, pages, step-up, claim, user-menu | E2E: register→workspace; sign-out; guard |
| **P7 CI + docs** | check:identity, ci wiring, D-40, runbook | full gate chain green; roadmap M2 declarable |

## 5. Test Strategy (written per-phase, never deferred)

- **P1:** migration/manifest assertions immediately (they are the schema's proof).
- **P2:** domain unit tests *with* the aggregate — password policy, email normalization, register/verify events, the D-29 no-op. (Fast, no DB.)
- **P3:** crypto unit (real argon2id round-trip, salt uniqueness, malformed-deny) + repo integration (round-trip + rehydration guard) as each store lands.
- **P4:** the security-relevant integration suite *as the services appear* — enumeration parity (the moment `login` exists), single-use recovery (the moment `performReset` exists), session lifecycle (the moment `SessionService` exists). This is the batch's highest-value test surface; it is written *with* the code, not after.
- **P5:** the endpoint/adapter integration — cookie round-trip, logout, logout-all(+event), step-up freshness, guest/claim, rate-limiting — each endpoint gets its assertion as it is wired.
- **P6:** E2E (Playwright) for J-1-with-real-auth, step-up journey, recovery, revoke-all-kills-second-context; axe on auth pages.
- **Discipline:** no phase exits with untested code (the OPS-001A precedent — an untested rehydration guard was a review finding; here the guard ships with its test).

## 6. Review Checkpoints (pause-and-verify)

- **CP-A (after P0):** does argon2id actually run here? If the WASM/native choice fails, the whole batch's crypto decision changes — verify before building on it. *(This is why P0 is a spike, not an afterthought.)*
- **CP-B (after P2):** `check:boundaries` — is the domain still pg-free and crypto-free? Crypto in `domain/` is the most likely boundary violation; catch it before infrastructure entrenches it.
- **CP-C (after P4):** run the enumeration-parity + recovery-single-use tests. These are the security spine; if they are not green here, no endpoint is worth wiring.
- **CP-D (after P5 — the gate checkpoint):** the cookie→`/session` round-trip passes AND every *existing* masking/step-up/gate test is still green (zero-regression law — dev mode untouched). This is the batch's true definition of done.
- **CP-E (before P7 freeze):** full gate chain + the WP §9 exit checklist; hand to REVIEW-IDN-001.

## 7. Risk Analysis (grounded — these are the ones that actually bite)

| Risk | Severity | Mitigation |
|---|---|---|
| **R-1 crypto library won't run in-env** (native argon2 build failure) | HIGH (blocks everything) | P0 spike with `hash-wasm` (pure WASM, no native build) — proven before any dependent code; CP-A gates it. |
| **R-2 crypto placed in `domain/`** (boundary violation) | MEDIUM (rework) | Ports in `domain/`, argon2id/sha256 in `infrastructure/` (crypto is infrastructure like pg); CP-B / `check:boundaries` catches it. |
| **R-3 the session adapter is async, `resolveAuth` was sync** | HIGH (integration) | Do not change `resolveAuth`'s signature; a Nitro middleware populates `event.context.auth` (the wrapper already reads it first). Dev-header path untouched → zero regression. |
| **R-4 `*/` inside a comment** (`kyc.*/deactivated`) closes the block early | LOW (compile break, cost minutes) | Avoid `*/` in prose; typecheck after every domain file. *(Materialized once — cheap when caught immediately.)* |
| **R-5 shared rate-limiter contaminates integration tests** (one source IP) | MEDIUM (flaky-looking failures that aren't real bugs) | Test-only `reset()` in `beforeEach`; the endpoints' real per-IP limits are correct — the fix is test-hygiene, not production. |
| **R-6 WebAuthn cross-browser + challenge persistence** | MEDIUM (US-2 only; password is the fallback) | Ship the server ceremonies real; in-memory ChallengeStore for single-instance, recorded debt for multi-instance; password path carries the batch. E2E on the Playwright browser set. |
| **R-7 enumeration timing leak** (unknown email skips the hash) | HIGH (security) | Constant-work login: verify against a dummy argon2 hash when the account is absent; byte-identical problem responses; asserted in an integration test. |
| **R-8 route guard breaks dev-mode browsing** (no session in dev) | MEDIUM (DX regression) | Guard reads public `identityMode`; redirects only in session mode; dev leaves the workspace open. |
| **Regression surface** | — | The zero-regression law at CP-D: session mode must serve the *entire existing endpoint surface* with every prior masking/gate/step-up test green. |

**Highest of each (WP §8 answered):** implementation → R-1 (crypto viability); security → R-7 (enumeration); integration → R-3 (async adapter into a sync seam); regression → CP-D (the existing suite under the real adapter).

## 8. Estimated Effort & Parallelism

| Phase | Complexity | Parallelizable? |
|---|---|---|
| P0 spike | XS | — (must be first) |
| P1 database | S | — (foundation) |
| P2 domain | S | VOs ∥ events ∥ (User needs both) |
| P3 infrastructure | M | crypto ∥ repos ∥ email ∥ webauthn (independent once ports exist) |
| P4 application | M | session ∥ guest-claim (auth needs crypto+repo+email) |
| P5 composition + edge | M–L | endpoints fan out ∥ once container+middleware land; **serialize the middleware/adapter first** |
| P6 frontend | M | pages ∥ (all need `useSession`); a second dev can own P6 against P5's contracts |
| P7 CI + docs | S | gate ∥ runbook ∥ D-40 |

**Total:** one batch-sprint (implementation + its tests), consistent with roadmap R1-B1 sizing. **Two-dev split:** Dev-A owns P0→P5 (the backend spine, critical path); Dev-B starts P6 frontend against the frozen endpoint contracts as soon as P5's schemas exist (auth pages need only the request/response shapes, not the live server — mock-free once P5 lands). WebAuthn (P3/P6 US-2) is the natural second-dev carve-out: fully isolable, off the critical path, password fallback protects the batch if it slips.

**Sequencing rule for the solo path:** never build P6 before CP-D — a guard that redirects against a half-real adapter wastes a debugging cycle.

---

*EXEC-R1-B1 in one sentence: spike the crypto, lay the schema, keep the domain pg-free, make `resolve()` real before the middleware and the middleware real before the UI — and prove enumeration-safety and zero-regression at the two checkpoints that actually matter.*
