# DOF Platform — WP-R1-B1

# Engineering Work Package — Release 1 · Batch 1 · Identity & Sessions

**Status:** Accepted (the implementation contract for R1-B1) · **Version:** 1.0 · **Date:** 2026-07-07
**Authors:** VP Eng / Principal Architect / Staff Engineer / TPM / QA Lead / Product Owner (one pen)
**Binding docs:** ADR-001 (Identity is its own domain; One Identity; the claim pattern; sensitive-op protocol) · ADR-007 §6/§10 (buyer gate class, guest tokens) · ADR-003 §7 (frozen `identity.*` event names) · CDC-001 · RELEASE-001 **F-ID-1…5** · ROADMAP R1-B1 · DECISIONS D-04 (the identity port), D-22 (per-domain quartet), M-6, D-29.
**Grounding fact:** the integration seam already exists and fails closed — `server/utils/identity.ts` `'session'` mode returns `null` until this batch lands; the dev adapter refuses production. **This batch's definition of done is: that function returns real sessions.**

---

## 1. Executive Summary & Business Context

Nothing in Release 1 can reach production without real people signing in: the dev-header identity is structurally forbidden in production, so **every** downstream batch (checkout, payments, payouts) queues behind this one — it is critical-path position #1 (ROADMAP §4). The batch delivers the Identity domain: registration and login (password + passkey), server-side sessions behind the existing `resolveAuth` seam, real step-up for the frozen sensitive-operation protocol, account recovery, the **guest-token and claim machinery** ADR-007 requires (issued here, consumed by Orders in R1-B5), and the thin transactional-email transport that recovery requires (and which order emails will reuse — F-XC-1's first slice). Product-visibly: the Ignite journey's **Claim step (frozen ADR-001 §9 Step 4)** becomes real — "Your store is ready. Claim it." creates an account at the moment of maximum sunk value, one-tap where the platform allows (passkey), and the merchant's draft, business, and store attach to a real identity. The Five-Minute law is preserved: registration never blocks selling — no email-verification wall, no forms beyond the constitutional minimum.

## 2. User Stories (US-x) with Acceptance Criteria (AC)

> Every AC is testable; §8 maps them to suites. Copy follows Errors-Educate; all auth failures are enumeration-proof (identical answer + timing for unknown-email vs wrong-password).

**US-1 Merchant registration (email+password).** AC-1.1: email + password (≥ 10 chars, no composition rules; deny top-10k breach list) creates a user and an authenticated session in one step — no verification wall (verification email sent async; unverified accounts function fully except recovery-sensitive changes). AC-1.2: duplicate email answers exactly like success ("check your inbox" pattern) — enumeration-proof. AC-1.3: emits `identity.user.registered`. AC-1.4: p95 ≤ 400ms server-side.
**US-2 Passkey registration & login.** AC-2.1: WebAuthn platform-authenticator flow offered first where available; password remains the fallback (Grandma law: never passkey-only). AC-2.2: a user may hold ≥ 1 passkey + optional password; either authenticates. AC-2.3: passkey login is one interaction, p95 ≤ 1.5s end-to-end.
**US-3 Login/logout (session lifecycle).** AC-3.1: login sets an opaque, httpOnly, Secure, SameSite=Lax session cookie; token random ≥ 256-bit, **hashed at rest**. AC-3.2: rolling expiry 30 days, absolute cap 90 days; expiry answers 401 `AUTH_REQUIRED` with educating copy. AC-3.3: logout invalidates server-side immediately. AC-3.4: session fixation impossible (token rotates at login and at privilege elevation).
**US-4 Sign out everywhere.** AC-4.1: revokes all sessions except (optionally) the current one, ≤ 2s propagation. AC-4.2: emits `identity.session.revoked_all`. AC-4.3: reachable from the workspace user menu.
**US-5 Step-up authentication.** AC-5.1: sensitive commands (the frozen list — e.g., CloseLocation) require a re-auth ≤ **5 minutes** old (the D-04 window); the UI challenges inline (password or passkey) without losing the pending action. AC-5.2: `resolveAuth().stepUpVerified` is true only within the window; replays outside it answer `STEP_UP_REQUIRED` (existing tests keep passing with the real adapter). AC-5.3: step-up never issues a new session (assertion, not login).
**US-6 Account recovery.** AC-6.1: "forgot password" sends a single-use, 30-minute, hashed-at-rest reset token via the transactional-email transport; the request answer is uniform (enumeration-proof). AC-6.2: reset revokes all sessions (forced re-login) and invalidates other outstanding reset tokens. AC-6.3: recovery to an unverified email requires the async verification first (the one thing verification gates).
**US-7 Guest buyer token (infrastructure — consumed by Orders in R1-B5).** AC-7.1: `issueGuestToken(scopeRef)` returns an opaque, hashed-at-rest token bound to a scope (order ref in R1-B5; the API is scope-generic), TTL 30 days. AC-7.2: verification is constant-time and rate-limited (10/min/IP); misses are indistinguishable from expiries. AC-7.3: port + contract tests ship now with a synthetic scope; no buyer UI in this batch.
**US-8 Guest→account claim.** AC-8.1: registering (or logging in) with a guest context attaches the guest's claimable artifacts to the user (Ignite drafts now; orders in R1-B5 via the same claim table). AC-8.2: **Ignite Step 4 goes real**: the journey's dev-identity localStorage id is replaced by session auth; an unauthenticated founder reaching Claim registers inline (passkey-first) and the launch proceeds under the new session; an authenticated user skips the step (frozen behavior). AC-8.3: claim is idempotent and audited.
**US-9 Session-aware app shell.** AC-9.1: workspace routes require a session (redirect to login preserving destination); the user menu shows the real identity; sign-out works. AC-9.2: dev mode remains fully functional for local/tests (`identityMode=dev` unchanged outside production).

## 3. Technical Scope

**In:** `domains/identity/` (new domain, house layout) with the D-22 quartet (`identity_domain_events/_outbox/_deliveries/_audit`) · User aggregate + credentials (argon2id), passkeys (WebAuthn), sessions, recovery tokens, guest tokens, claims · the `'session'` adapter inside `server/utils/identity.ts` (the seam, filled) · auth HTTP surface (register/login/logout/logout-all/recovery/step-up/WebAuthn ceremonies) under `/api/v1/auth/*` · thin transactional-email transport (provider port + one adapter + templates: verify, reset; calm rules as API) · frontend: login/register/recovery pages, inline step-up challenge component (DS-composed), Ignite Claim wiring, workspace session guard + user menu · events: `identity.user.registered`, `identity.session.revoked_all` (only these two registered — M-6 emitted-only law) · migration 0008 + manifest entries + grants for the quartet.
**Out (explicit):** social login/OAuth · TOTP/2FA beyond passkeys · KYC flows (F-ME-3 is a later batch; `identity.kyc.*` events not registered) · account self-deactivation (`identity.user.deactivated` not registered) · org SSO · buyer-facing order UI (R1-B5) · profile management beyond display name · email-change flow (deferred; recorded debt) · admin user tooling.

## 4. Deliverables

| Area | Deliverable |
|---|---|
| Database | Migration 0008: identity quartet + `users`, `user_credentials`, `user_passkeys`, `user_sessions`, `user_recovery_tokens`, `guest_tokens`, `identity_claims` — manifest-first (P2/P3 PII declared: email, names, credential hashes), grants extended, all secrets/tokens hashed at rest |
| Backend | Identity domain (aggregate/repos/commands/queries per kernel idioms incl. D-39 laws), session service, WebAuthn service (library selection task T-2), guest-token port, claim service |
| API | `/api/v1/auth/*` endpoints, RFC 9457, rate-limited (login 10/min/IP+account backoff; registration 5/hr/IP; recovery 3/hr/account), contracts-first schemas + `identity.v1.yaml` |
| Events | 2 registered payloads + registry lock; ordering scope: user-scoped |
| Frontend | Auth pages (DS components only), step-up challenge (returns to pending action), session middleware/`useSession`, Ignite Claim step, user-menu identity |
| Email | `EmailPort` + provider adapter + sandbox twin (test law); 2 templates; suppression on hard bounce |
| Testing | §8 suites incl. the security battery |
| Docs | DECISIONS entry (library + parameter choices, session policy) · runbook: credential-stuffing response, session-revocation ops · debt register update |
| Ops/Infra | Secrets for email + WebAuthn RP config per environment · dashboards: login success/failure rates, active sessions, recovery volume · alert on failure-rate spikes (stuffing signal) |

## 5. Dependencies

**Requires:** everything frozen (kernel, UI Foundation, workspace shell, Ignite journey) — all present. Email provider account provisioned (procurement task, lead time — start immediately). **Blocks:** R1-B5 (buyer gate + guest tokens + claim consumption), F-ME-3 KYC (needs real users), every production gate (G-3's "dev-identity unreachable" test). **Parallel-safe:** R1-B2 (Stock Ledger — dev identity in non-prod is untouched), R1-B4 (BLUEPRINT-004 authoring), R2 frontend batches.

## 6. Engineering Tasks (implementation order)

**T-1** Migration 0008 + manifest + grants (quartet + 7 tables). **T-2** Decision task: WebAuthn library + argon2id parameters (memory/iterations vs p95 budget) — recorded in DECISIONS before use. **T-3** Domain core: User aggregate (registration invariants, credential attach, D-29 events), Session aggregate/service (rotate/expire/revoke), repos with rehydration guards. **T-4** Recovery + email transport (port, adapter, sandbox, templates). **T-5** Passkey ceremonies (register/authenticate) server-side. **T-6** Auth endpoints + schemas + OpenAPI + rate limits. **T-7** The seam: `'session'` adapter in `resolveAuth` (cookie → session lookup → `{userId, stepUpVerified}`) + step-up assertion endpoint. **T-8** Guest tokens + claims (port + tables + service). **T-9** Frontend: pages, middleware, user menu, step-up component. **T-10** Ignite Claim wiring (replace dev-id path; inline registration; claim attach). **T-11** Test suites (§8) incl. security battery + E2E updates (app Playwright project gains an authenticated fixture; dev-header fixtures retained for non-auth suites). **T-12** CI: `check:identity` structural gate (event registration, contract lock, endpoint census — the check:operations pattern) + dashboards/alerts. **T-13** Docs + DECISIONS + runbooks.

## 7. Test Strategy

**Unit:** aggregate invariants, password/passkey/credential state machines, token hashing, session rotation, step-up window math, VO guards. **Integration (embedded PG, no mocks):** every US against real HTTP — the five-template classes from D-39 apply (jsonb equality where relevant, rehydration guards, sequence-guard race, idempotency replay, consumer negative) plus: session expiry/rotation/revoke-all propagation, recovery single-use, claim idempotency, quartet facts landing (events/outbox/audit). **Contract:** `resolveAuth` behavioral contract (dev vs session parity — the same AuthContext semantics both modes; existing step-up tests re-run against the real adapter unchanged). **Security battery:** enumeration timing (statistical), brute-force lockout/backoff, session fixation, cookie flags, CSRF posture on state-changing endpoints, token-at-rest hashing verification, rate-limit sweeps, dev-mode-refuses-production test. **Load:** login 100 rps sustained p95 ≤ 400ms; session resolution overhead ≤ 5ms p99 (it sits on *every* request). **Accessibility:** auth pages + step-up challenge axe-clean, keyboard-only, SR pass (forms are the classic failure zone). **E2E:** J-1 with real registration (genesis end-to-end under a session, ceremony intact) · step-up close-location journey · recovery journey · revoke-all kills a second browser context.

## 8. Risks

**Technical:** WebAuthn cross-browser/platform variance — mitigations: password always available, library selection task with a compatibility matrix, E2E on the Playwright browser set. Session-resolution latency on every request — budget + cache strategy decided in T-7 review. **Product:** any friction added to genesis Step 4 violates the frozen five-minute law — the Claim step's p75 impact is measured in E2E and gates acceptance. **Security:** this batch *is* the attack surface — the battery in §7 is non-negotiable; external pen test (G-3) explicitly targets it later; credential-stuffing runbook ships with the batch, not after. **Operational:** email deliverability (SPF/DKIM/DMARC setup is an infra task with provider lead time — start at T-0); secrets rotation procedure documented before production.

## 9. Exit Criteria (objective, per RELEASE-001 §5 discipline)

Batch R1-B1 is complete when: ☐ US-1…US-9 all ACs demonstrably pass (suite-mapped) ☐ the five-stage discipline is complete (implementation → REVIEW-IDN-001 adversarial review → hardening with review-evidence regressions → business acceptance: the J-1-with-real-auth journey script signed by Product → freeze) ☐ full CI chain green including the new `check:identity` gate and the security battery ☐ `resolveAuth('session')` serves the entire existing endpoint surface with zero behavioral regressions (every existing masking/step-up/gate test green under session mode) ☐ dev mode still green for local/test ☐ migration 0008 + manifest + locks + DECISIONS + runbooks landed ☐ dashboards live, alerts tested ☐ roadmap M2 declared ("real identity live; dev-mode retired from every production path").

---

*WP-R1-B1 in one sentence: fill the seam that already fails closed — real people, real sessions, real step-up, and a Claim step that finally keeps its promise, without adding one second to the five minutes.*
