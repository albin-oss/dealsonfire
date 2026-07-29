# DOF — LONG_TERM_MAINTAINABILITY_REVIEW

**Status:** Completed 2026-07-29 · Perspective (mandatory): the Principal Engineer who inherits DOF after the original team is gone. Ten-year horizon, dozens of engineers, thousands of migrations, millions of orders.
**Evidence base:** not opinion — this repo's own history. Where the original team stumbled repeatedly, the inheritor will stumble on day one; those incidents are cited.

---

## Executive Summary

DOF is unusually inheritable in its *laws* and unusually tribal in its *rituals*. The constitutional layer — ADRs with reasoning, contract-first schemas, the data manifest, grant-level immutability, and five executable gates — means the inheritor cannot silently violate the platform's deep rules; the machine refuses. But the working knowledge that keeps velocity — the full verification sequence, the release procedure, the one genuinely surprising platform behavior, the map of which documents are frozen versus superseded — lives nowhere but in the original team's habits and this session's git history. The corrections are all of one kind: **turn rituals into executable documentation.** No architecture changes, no ADR amendments required (nothing found contradicts a frozen decision). **Verdict: GO, with the corrections implemented in this cycle.**

**Maintainability Score: 78/100** → projected 88 post-corrections. The missing 12: hotspot refactors (container growth, cron accretion) that are correctly *deferred* until their thresholds, and the multi-team review process that cannot exist before multiple teams do.

## Critical Findings

**None.** Nothing requires pausing development. The two candidates examined and downgraded: (a) the `withTransaction` rollback law — surprising but *correct and documented in code*; the failure is discoverability, not design (→ MH-1); (b) the release ritual — error-prone but recoverable (both mistags were caught and fixed within minutes by the same discipline that caused them) (→ MH-2).

## High Findings

**MH-1 · The platform's one surprising law is discoverable only by being burned.** `PgUnitOfWork.withTransaction` rolls back any `{ok:false}`-shaped return — a deliberate, correct law ("commands that return errors leave no partial writes"). It bit the original team **three times in one campaign** (C3 decline persistence, C5 cancellation state, C5 sweep) — each time producing a mystifying "my committed write vanished" symptom. The inheritor will lose a day to it, guaranteed. **Correction:** promote it from a code comment to named law status: a "Platform Laws & Gotchas" section in CONTRIBUTING.md (new), cross-linked from the `withTransaction` JSDoc; the confirm service's `ok:true`-cancellation comment already models the correct usage.

**MH-2 · The release procedure is a tribal ritual, and it has already failed twice.** Merging + tagging runs through an inline Python heredoc rewritten from memory each time. Failure history: an apostrophe-escaping SyntaxError mistagged v1.29.0 onto the wrong commit; a chained tag after a 405 mistagged v1.25.0; both required tag surgery. A new engineer inherits *nothing* — they would invent their own ritual with their own failure modes. **Correction:** `scripts/release.mjs` — create PR, merge with retry, verify merge SUCCEEDED before tagging, tag the merge commit — plus a RELEASING section in CONTRIBUTING.md. The tag-after-verified-merge ordering is the exact guard both incidents lacked.

**MH-3 · The verification sequence exists only as muscle memory.** The full sweep (build first because e2e serves `.output`; the eleven-stage gate chain; run it in a SEPARATE command from commit; grep both "passed" AND "failed" lines because Playwright prints failures above passes — a lesson that once let a broken PR merge) is executed correctly today because its author remembers being burned. **Correction:** `npm run sweep` — one script that runs the entire sequence in the correct order and exits nonzero loudly. The discipline becomes infrastructure.

## Medium Findings

**MM-1 · The architecture directory is 40+ flat files with no reading order and one live trap.** `PAYMENT_LIFECYCLE.md` is superseded by `UPDATED_PAYMENT_LIFECYCLE.md` — nothing marks the loser; an inheritor implementing from the wrong one would rebuild capture-on-fulfillment, the exact policy a founder review killed. **Correction:** `architecture/README.md` index with per-document status (frozen / active / superseded-by) + a superseded banner on the trap file itself.

**MM-2 · Two domains skip the event-payload-validator idiom.** Commerce/Operations/Identity register zod payload validators (M-6 lock discipline); the Orders and Payments dispatchers pass `{}`. Two patterns for one law is how idioms die — the inheritor copies whichever they see first. **Correction:** `orders-payloads.ts` + `payments-payloads.ts` for the eight emitted events, wired into both dispatchers.

**MM-3 · The integration-test route registry is silent about its one failure mode.** `tests/helpers/app.ts` requires hand-registering every endpoint; forgetting produces a bare 404 that cost a debugging session in C1. The registry is CORRECT (D-12: mount the real handlers) — it just doesn't say so. **Correction:** a loud header comment naming the symptom.

**MM-4 · Composition-root reads look like a boundary violation to fresh eyes.** `server/utils/deals-feed.ts` / `momentum.ts` are deliberate cross-domain read composition at the root (documented only in their own headers). A dutiful inheritor "fixing" them into a domain would break the boundary law they think they're enforcing. **Correction:** a section in CONTRIBUTING.md naming the pattern and its rationale.

**MM-5 · Magic constants travel by convention.** The sandbox decline amount (66600) exists independently in the twin, the C3 adapter, and tests; the demo persona ids (Rosa = `1111…`) exist in scripts and probes. **Correction:** export the decline constant from one place; document personas in CONTRIBUTING.

## Low Findings

Env-var feature flags are ad-hoc (`NUXT_COMMERCE_CHECKOUT`) — fine below ~5 flags; registry when exceeded · timeline ordering lacks a same-ms tiebreaker (cosmetic, noted in PRR) · `UPDATED_` filename prefix as a versioning pattern should not repeat (the README index is the better mechanism) · build ~2min / sweep ~6min is healthy now; CI parallelization is a >20-min problem for a future team.

## Architectural Strengths (the inheritance that works)

The gates are executable constitution — five `check:*` commands plus grant-level immutability mean the deepest laws are *enforced*, not requested · every table is manifested with owner/PII/retention (schema discoverability is a solved problem here) · one idiom per problem, each with a canonical example (event store, quartet, endpoint definitions, DS primitives) · tests are named as specifications ("THE STORM", "P4", "V6") and read as law citations · ADRs record *why*, and the review documents (PRR, ORR, this one) form an unusual asset: the platform's mistakes are written down with their mechanisms · forward-only migrations with checksum enforcement already refused an in-place edit during this very campaign — the law works.

## Maintenance Hotspots (years 3–10)

1. **`server/utils/container.ts`** (~700 lines, every domain wires here) — will pass 2,000 lines by the time Payments extracts. Threshold: split into per-domain factory modules when the next domain lands. Not now (a premature split hides the composition).
2. **The cron endpoint** — five clocks and counting accrete in one handler; at >10 jobs it becomes a task registry with per-job observability. The seam is obvious when needed.
3. **`deals-feed.ts`'s five-voice UNION** — the column-alias bug bit twice already; every new voice is careful SQL surgery. When voice #7 arrives, decompose per-voice queries merged in code.
4. **`theme.css` + scope files** — the token gate protects correctness, but at hundreds of tokens the generation pipeline needs grouping conventions.
5. **Payments extraction** (ADR-003 §9 says it extracts second) — the contract purity is maintained today; the hotspot is *keeping* it pure under feature pressure until extraction day. The boundary gate is the sentinel.

## Knowledge Risks → made executable in this cycle

| Trapped knowledge | Where it goes |
|---|---|
| The sweep sequence + its ordering reasons | `npm run sweep` (executable) |
| The release ritual + its two failure modes | `scripts/release.mjs` (executable) |
| The `withTransaction` rollback law | CONTRIBUTING.md Platform Laws + JSDoc cross-link |
| Frozen vs superseded document map | `architecture/README.md` index |
| Composition-root read rationale | CONTRIBUTING.md |
| Test-app registry failure mode | loud header in the helper |
| Demo personas / dev identity idiom | CONTRIBUTING.md |

## Onboarding Answer

A senior engineer joining tomorrow, post-corrections: **~2 weeks to confident production code** (day 1–2: CONTRIBUTING golden path, `dev:demo`, one guided read of an increment PR; week 1: ship a Stream-B item through `npm run sweep` + `release.mjs`; week 2: a commerce change under the gates). Pre-corrections the honest estimate was 4–6 weeks, most of it rediscovering rituals by being burned in the same order the original team was.

## Refactoring Readiness

High where it matters: append-only data + events mean projections rebuild; contract tests + storm tests mean behavior is pinned before touching internals; the gates catch boundary/token/data regressions mechanically. The one refactor class requiring ceremony is SQL inside the composition reads (no query-level tests beyond integration surfaces) — acceptable, noted for the voice-#7 decomposition.

## Ten-Year Sustainability Assessment

The platform's bet — laws in machines, reasons in documents, one idiom per problem — is the correct bet for a ten-year codebase, and it is already mostly paid for. The failure mode that kills such codebases is not architecture decay but *ritual decay*: the moment verification, release, and gotcha knowledge stop transferring, quality becomes generational. This cycle converts every identified ritual into a script or a document. With that done, DOF's ten-year risk concentrates where it should: in the five named hotspots, each with a stated threshold and seam — which is precisely what an inheriting engineer needs: not a perfect codebase, but a codebase that *tells you where it will hurt and when*.

## GO / NO-GO

**GO.** Corrections MH-1..3, MM-1..5 implemented in this cycle; no ADR amendments required (none contradicted — recorded here as the ADR-consistency verdict); gates re-run; then C6 continues under its ORR-corrected definition of done.
