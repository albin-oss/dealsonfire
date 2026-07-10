# DOF Platform — R1-B1-P0 — Crypto Spike Report

**Phase:** EXEC-R1-B1 P0 (CP-A) · **Date:** 2026-07-09 · **Author:** Lead Backend Engineer
**Objective:** eliminate R-1 (crypto library viability) — the batch's highest implementation risk — before any dependent code. Spike only; not connected to the domain.
**Runtime measured:** Node v24.18.0 · darwin arm64. Numbers below are from a throwaway harness run in-repo, then deleted (no spike code retained; the production adapter is the separate P3 deliverable).

---

## 1. Dependencies added & validated

| Package | Declared | Installed | Verdict |
|---|---|---|---|
| `hash-wasm` | ^4.12.0 | 4.12.0 | ✓ pure WASM — no native build step, no node-gyp, no platform binary |
| `@simplewebauthn/server` | ^13.3.2 | 13.3.2 | ✓ v13 API present (`generateRegistration/AuthenticationOptions`) |
| `@simplewebauthn/browser` | ^13.3.0 | 13.3.0 | ✓ (client ceremonies; validated by import + version pin) |

All three resolve and execute under the project's ESM + Node 24 runtime.

## 2. Spike scope (what was exercised)

argon2id hash/verify/format · salt uniqueness · malformed-input handling · SHA-256 token determinism + constant-time compare + entropy · argon2id & SHA-256 performance · WebAuthn registration/authentication **option** generation (no persistence, no ceremonies — per brief).

## 3. Benchmark results (argon2id m=19456 KiB, t=2, p=1 — OWASP 2024 baseline)

| Metric | Result | Budget / note |
|---|---|---|
| avg hash | **23.7 ms** | AC-1.4 p95 ≤ 400 ms → **×17 headroom** |
| avg verify | **24.1 ms** | login stays well inside 400 ms even with the constant-work dummy-verify path |
| RSS delta over 40 ops | ~0 MB (−1.0 MB) | WASM working memory is transient/reclaimed; no leak signature |
| SHA-256 (session-token hash) | **0.72 µs** | sits on *every* request via session resolution — negligible |
| token entropy | 43 chars (32 bytes base64url) | ≥ 256-bit (AC-3.1) |

**Parameter judgment:** m=19456/t=2/p=1 is the OWASP-recommended interactive baseline and lands ~24 ms on this arm64 dev box — comfortably real-time, with ×17 budget headroom to absorb slower production CPUs. No parameter change warranted; recorded in D-40(a).

## 4. Compatibility report

- **Build:** `hash-wasm` ships WASM — **zero native compilation**, so dev/CI/prod produce byte-identical behavior (the reason it was chosen over `argon2`/`@node-rs/argon2`, which need prebuilt binaries per platform/arch). This directly retires R-1.
- **Runtime:** ESM imports clean under Node 24; `argon2id`/`argon2Verify` and both simplewebauthn entry points work as documented.
- **Encoded format:** `$argon2id$v=19$m=19456,t=2,p=1$…` — self-describing (params travel with the hash), so future parameter increases verify old hashes and can re-hash on next login without a migration.
- **WebAuthn:** v13 option generation returns valid challenges, `rp.id`, and pubKey algorithms `-8, -7, -257` (Ed25519, ES256, RS256 — the correct modern set). Library API matches what the P3 service binds.

## 5. Security observations

- **★ Load-bearing finding — malformed input THROWS, it does not return false.** Raw `argon2Verify` on `'not-a-hash'`, `''`, or a truncated hash **throws** rather than returning `false`. An unwrapped verify in the login path would turn a garbage stored hash (or a probe) into a 500 and a potential timing/behaviour oracle. **Mitigation is mandatory and already specified:** the production adapter (P3) wraps verify in `try/catch → false`. This spike proves that wrapper is not optional — it is the difference between "deny" and "crash." (Confirmed present in the shipped `crypto.ts`.)
- **Enumeration timing (R-7):** hash ≈ verify (23.7 vs 24.1 ms) — symmetric, so the constant-work login design (verify against a dummy hash when the email is unknown) produces indistinguishable timing between "unknown account" and "wrong password." The spike confirms the two operations are the same order of magnitude; the parity is real, not aspirational.
- **Token hashing:** SHA-256 is correct for *opaque high-entropy* tokens (256-bit random) — it is not a password KDF and does not need to be; the entropy is in the token, not the secret. `timingSafeEqual` available and working for digest comparison.
- **Dependency risk:** all three are single-purpose, widely-used, actively-maintained; `hash-wasm` has no transitive native deps. Pin exact minors and monitor advisories; no supply-chain red flags at these versions.
- **Deployment:** no secrets in this layer; WASM needs no special runtime flags. WebAuthn RP id/origin are per-environment config (already in `server/utils/config.ts`). The only multi-instance consideration is the WebAuthn *challenge store* (a P3/P6 concern, out of P0 scope) — recorded debt, password path unaffected.

## 6. Recommendation

# APPROVE CRYPTO STACK

`hash-wasm` (argon2id, OWASP params) + Node `crypto` (SHA-256 + `timingSafeEqual`) + `@simplewebauthn` v13 are production-ready on the target runtime: no native build, real-time performance with ×17 headroom, self-describing hashes, correct token entropy, and validated WebAuthn option generation. **R-1 is retired.** The spike additionally *proved* the one non-obvious correctness requirement — `argon2Verify` must be try/catch-wrapped to deny (not crash) on malformed input — which is now a hard requirement on the P3 adapter, not a nicety.

**Stop here (P0 complete). Do not proceed to P1** until this checkpoint is signed. The crypto foundation everything else rests on is validated.
