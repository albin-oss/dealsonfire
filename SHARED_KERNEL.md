# DOF Shared Kernel

The framework-independent foundation every DOF domain depends on. This document is the map: what exists, where it lives, the boundary rules, and the recommended path to consolidation.

## Guiding principle
DOF already **has** a Shared Kernel — it was built with Module 1 and has carried five hardened modules (merchant, identity, operations, commerce, onboarding). This pass documents it, adds the one missing primitive (Result combinators), and **recommends** (does not force) the consolidation moves — the foundation is explicitly "never rewritten," so a 100-file import churn is proposed as a deliberate, alias-based migration, not done blind.

## Where it lives (today)
| Layer | Path | Contents |
|---|---|---|
| Pure shared | `shared/` | `result.ts`, `errors.ts` (DomainError hierarchy), `validation.ts` |
| Platform primitives | `platform/` | `clock`, `uuid`, `config`, `events` (envelope/actor/correlation/causation), `pagination`, `logger`, `metrics`, `trace`, `health`, `audit-log`, `security`, `repository`, `event-store`, `outbox-dispatcher`, `consumer-registry`, `replay`, `projection-registry`, `idempotency-store`, `types`, `db` |
| Per-domain kernels | `domains/*/shared-kernel/` | branded `ids.ts`; merchant additionally holds `price` (Money), `handle`, `media-ref`, `brand-kit`, `ai-provenance`, `actor`, `command-gate`, `permissions`, `trust` |

`check:boundaries` mechanically enforces that `domains/**` and `platform/**` import no Nuxt/Vue/Nitro/server/DS code — the framework-independence guarantee is a CI gate, not a convention.

## Requested package → existing implementation
| PROMPT-006 package | Status | Where |
|---|---|---|
| Identity types (branded IDs) | ✅ present (per-domain) | `domains/*/shared-kernel/ids.ts` |
| Result pattern | ✅ + **combinators added this pass** | `shared/result.ts` |
| Domain errors (→ RFC 9457) | ✅ | `shared/errors.ts` + `server/utils/problem.ts` |
| Value objects (Money, Handle, MediaRef, BrandKit, AIProvenance, Actor) | ✅ present | `domains/merchant/shared-kernel/*` |
| Domain events (envelope, actor, correlation/causation, schema version) | ✅ | `platform/events.ts`, `platform/event-store.ts` |
| Commands/Queries base (auth/capability/trust hooks) | ✅ | `shared-kernel/command-gate.ts`, `server/utils/define-command-endpoint.ts` |
| Pagination (offset + keyset) | ✅ | `platform/pagination.ts` |
| Validation (schema-first) | ✅ | `shared/validation.ts` + `contracts/schemas/**` (zod) |
| Clock / UUID / Hashing / Random | ✅ | `platform/clock.ts`, `platform/uuid.ts`, `platform/security.ts` |
| Retry / Backoff | ✅ (in dispatcher) | `platform/outbox-dispatcher.ts` (`RetryStrategy`, `DEFAULT_RETRY`) |
| Config / Env validation | ✅ | `platform/config.ts`, `server/utils/config.ts` |
| Audit abstraction | ✅ | `platform/audit-log.ts`, `platform/types.ts` (`AuditLog`) |
| Observability (log/metrics/trace/health) | ✅ | `platform/logger.ts`, `metrics.ts`, `trace.ts`, `health.ts` |
| Repository base | ✅ | `platform/repository.ts` |
| Idempotency | ✅ | `platform/idempotency-store.ts` |

### Added this pass
- **`shared/result.ts` combinators** — `isOk`/`isErr`, `map`, `mapErr`, `andThen`/`flatMap`, `mapAsync`, `andThenAsync`, `combine`, `unwrapOr`, `fromPromise`. Purely additive over the existing `{ ok, value } | { ok, error }` union, so all `if (!r.ok)` code is unaffected. 10 unit/negative/async/serialization tests.

## Boundary & dependency rules (permanent)
1. The Shared Kernel depends on **nothing** in `domains/**`, `server/**`, `app/**`, or any framework. Enforced by `check:boundaries`.
2. Domains depend on the Shared Kernel, never the reverse.
3. No business logic here — only universal primitives and interfaces. Infrastructure *interfaces* (ports) may live here; *implementations* live in a domain's `infrastructure/`.
4. Nothing domain-specific: no Merchant/Commerce/Sparks/Products/Deals/Coupons concepts. (This is why `Weight`/`Dimensions`/`Address` were **not** added — they are shipping/commerce concepts, not universal.)

## Recommendations (require a decision — not executed here)
These are real improvements the prompt asked me to surface; each is an outward-facing refactor of the frozen foundation, so I recommend rather than execute.

- **R1 — Extract platform-shared value objects out of `domains/merchant/shared-kernel/`.** `Money` (`price.ts`), `MediaRef`, `AIProvenance`, and `Actor` are consumed platform-wide (identity, operations, commerce all import `actor`), yet physically live under the *merchant* domain. They belong in a top-level `shared/kernel/` (or `platform/value-objects/`). *Why:* a future domain importing `@domains/merchant/shared-kernel/actor` creates a false dependency edge on merchant. *How safely:* move files, keep a re-export shim + a `@kernel/*` path alias, migrate imports domain-by-domain; `check:boundaries` proves each step. Zero behavior change.
- **R2 — De-duplicate `UserId`.** It is defined in **both** `domains/identity/shared-kernel/ids.ts` and `domains/merchant/shared-kernel/ids.ts`. Identity owns the user concept; merchant should import it. *Why:* two `UserId` brands are structurally incompatible and invite subtle bugs at the seam.
- **R3 — A shared `Branded<T,B>` + `mint()` primitive.** Every domain re-implements the brand mechanism in its own `ids.ts`. Promote the primitive (not the IDs) to the Shared Kernel so all domains share one implementation while still owning their own ID *types*. *Why:* one place to evolve validation (e.g., UUIDv7 assertion) for all branded IDs.
- **R4 — Speculative value objects (`Slug`, `Percentage`, `DateRange`, `Color`, `Locale`, `Url`, `Phone`, `SeoMetadata`) on first use, not now.** The platform's standing law is *no unused public surface* (the emitted-only events law is its sibling). Adding 15 VOs with no consumer would be placeholder surface. *Recommendation:* add each when its first real consumer lands, in `shared/kernel/`, with tests — the kernel grows with demand, staying stable.

## Anti-patterns (do not)
- Importing a domain from the Shared Kernel (breaks extraction; `check:boundaries` fails).
- Putting a domain concept here to "share" it — that couples all domains to one domain's model.
- Primitive `string`/`number` IDs across a boundary — use branded IDs; primitives only at serialization edges.
- Throwing for business-rule failures — return `Result`; exceptions are for infrastructure faults only.
- Adding speculative primitives "because it's a foundation" — YAGNI still applies; the kernel earns stability by not churning.

## Extension rules
Add to the Shared Kernel only when a concept is (a) genuinely universal across ≥2 unrelated domains, (b) free of business logic, (c) framework-independent, and (d) has a real consumer. Otherwise it belongs in a domain's `shared-kernel/`.

## Future evolution / extraction
The layout is already extraction-ready: `shared/` + `platform/` have zero framework imports, so they can become an npm workspace package (`@dof/kernel`) with a `package.json` and the existing `@platform`/`@shared` aliases repointed. R1–R3 above make that package coherent (all truly-shared concepts inside it, no merchant edge). No redesign required for Merchant, Commerce, Products, Deals, Coupons, Sparks, Media, AI, Notifications, Search, Analytics, or Administration to depend on it.
