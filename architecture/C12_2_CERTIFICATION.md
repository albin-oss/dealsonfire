# C12-2 CERTIFICATION — Locks for Strangers

**Status:** see GO/NO-GO · 2026-08-17
**Scope:** exactly the Founder-approved amended Principal Engineer scope (`C12_2_READINESS_REVIEW.md`). Evidence discipline unchanged: demonstrated, not assumed; every claim is test- or state-backed.

## EXECUTIVE SUMMARY

DOF's security and enforcement state is now real under restarts, multiple instances, anonymous strangers, malicious traffic, and actual operator hands. Rate limits live in Postgres as HMAC digests and are shared across instances; WebAuthn ceremonies survive restarts and consume exactly once; production refuses to boot in a development posture with every problem named; the abuse loop runs end to end (quiet public door → durable deduped fact → operator alarm → step-up-gated audited hold/lift → honest maker letters through the C12-1 journal) while preserving `enforcement_hold` semantics to the letter — including the binding proof that a payout in flight settles to the cent under a hold. Stranger-test statements #2, #4, and #7's security half are now true. Additionally, the C12-1 webhook race was closed to its GENERAL invariant: observed is never consumed — any event class whose processing fails becomes deliverable again.

## BUSINESS VALUE

These are the locks on the door strangers walk through. Before this increment, one bad actor met budgets that reset on deploy, ceremonies that died with a process, an unreachable enforcement mechanism, and a platform that could silently run dev identity in production. Now the first flood is bounded, the first counterfeit report has a human path to a decision inside an hour, and the deployment itself refuses dishonesty.

## ENGINEERING SUMMARY

Complexity delta, exactly: **1 migration (0029) · 3 tables** (`rate_limit_buckets`, `webauthn_challenges`, `abuse_reports` — manifest-declared, 87-table ritual) · **1 public endpoint** (report) · **2 operator commands** (hold/lift) · **1 alarms arm** · **2 durable adapters behind EXISTING ports** (PgRateLimiter, PgChallengeStore — both ports async-converted with the complete call-site sweep, no sync shims left) · **2 boot plugins** (production gate, CSP nonce) + 1 pure gate function · **1 quiet UI component** (ReportDoor) · **2 env values** (HMAC secret, proxy-trust declaration). Zero new services, domains, queues, jobs, or dashboards. Reporter/operator letters ride the C12-1 mail journal — no second mail mechanism.

## DURABLE RATE-LIMIT PROOF

Hostile suite (`locks-for-strangers.test.ts`), all green:
- **Two instances, one budget, concurrent racing:** 14 simultaneous checks across two adapter instances against limit 10 → exactly 10 allowed, 4 refused — the atomic upsert cannot undercount.
- **Restart persistence:** a fresh instance sees the spent budget immediately.
- **IPv6 /64:** two addresses inside one /64 normalize to one key and spend one budget; different /64s and different scopes stay independent; IPv4 exact; malformed/absent addresses stay stable opaque keys (never a bypass, never a crash).
- **No raw addresses on disk:** every persisted key is an HMAC digest; the table contains no fragment of any IP or scope string. Secret is one rotatable env value.
- Expiry: fixed windows die opportunistically on write (bounded growth; loss of the table costs one open window). Fail-safe: without the secret configured, the in-memory limiter binds (dev/test); production REQUIRES the secret at boot.

## PROXY-TRUST RESULTS

`x-forwarded-for` trust is now an executable posture, not a comment: production boot requires `NUXT_TRUST_PROXY=platform` (the declaration that the deployment platform owns the header) and refuses otherwise, by name. Client addresses are /64-normalized before any key derivation. Direct client spoofing of forwarding headers is thereby confined to the declared-platform topology where the platform overwrites them; the unsupported direct-exposure posture cannot boot.

## WEBAUTHN RESTART / REPLAY / RACE RESULTS

- Options issued in one "process", verified in another: the ceremony is durable, then `DELETE … RETURNING` consumes it exactly once — replay from ANY instance finds nothing.
- Expired ceremonies find nothing; parallel ceremonies are independent rows; wrong ceremony ids find nothing.
- **Double-submit race:** two concurrent consumers, exactly one winner.
- **Hashed at rest:** the table holds only sha-256 digests; verification moved to simplewebauthn's predicate form (digest comparison) so the plaintext challenge never persists anywhere. Anonymous authentication ceremonies carry NULL user binding by design. Recorded debt D-40e is retired; `MemoryChallengeStore` survives as the explicit test binding only.

## PRODUCTION BOOT-GATE PROOF

`productionGateProblems()` (pure, unit-tested) + a thin nitro plugin that throws on boot in production: a fully production-shaped configuration passes cleanly; dev identity mode, undeclared proxy trust, sandbox mail, and each missing secret produce NAMED refusals (single-missing-value case pinned exactly). Dev and tests are untouched — the gate arms only under NODE_ENV=production. Production can no longer silently start in a development identity/security posture.

## ABUSE LOOP PROOF

Report → durable fact → operator review → hold → audit → lift, all demonstrated over real HTTP:
- The public door answers **identically** for duplicates, unknown subjects, and first reports — nothing probes the street's shape. Per-reporter+subject dedup held (two humans = two rows; one human twice = one row); SQL-shaped notes stored inert; oversized notes and open-vocabulary reasons refused at the schema (422). The endpoint shelters behind the durable limiter (10/hour per normalized address).
- The open report surfaced as the `abuse_report` arm in the existing alarms queue; holding the store auto-resolved its open reports with the operator's reason.
- The quiet **ReportDoor** renders at the foot of storefront and product pages (verified in the running app): a dotted underline, a disclosure, no theater, no contact solicitation, an info-free thank-you.

## ENFORCEMENT SEMANTICS PROOF

Binding and demonstrated: hold ⇒ `enforcement_hold = under_review` ⇒ the storefront answers the EXISTING masked 404 and the till refuses through the EXISTING reads — no new buyer-facing copy anywhere. Lift ⇒ the shop simply returns. Hold-twice and lift-twice refuse honestly (409); a `suspended` (standing-policy) hold is NOT liftable through this door and says whose it is. **The money proof:** with a payout op journaled and in flight, the store was held — the drive settled the payout to the cent and the ledger recomputed clean. `enforcement_hold` did not become `risk_paused`, silently or otherwise.

## SECURITY REVIEW

Operator commands: masked 404 for non-operators; step-up REQUIRED and proven against an aged window (a fresh login is legitimately step-up-fresh — the refusal was demonstrated by aging the session past the 5-minute law); every decision audited sensitive with reason. CSP: rendered pages gain a per-request nonce + `strict-dynamic` (production), replacing `script-src 'unsafe-inline'`; style stays the documented Tailwind cost; the baseline policy's missing Stripe sources (a latent production defect — the Payment Element would have been blocked) are corrected in the page policy. The webhook invariant (below) also belongs here.

**The webhook invariant, generalized (closing the C12-1 finding to its root):** the C12-1 race was payout-shaped; the general defect class was "ingest commits, processing fails, the 200 + dedup make the event permanently lost". Now: payouts ingest-and-handle atomically (no window at all); every other branch runs in a compensating envelope — a processing failure un-ingests the event and answers 500, so redelivery arrives fresh and reprocesses; successes stay consumed forever. Pinned by six route-level scenarios: early-rollback, redelivery-after-settle, sequential duplicate, CONCURRENT duplicate (serialized by the unique ingest — one domain event ever), forged signature (400, nothing recorded), and forced downstream failure → un-ingest → same-id redelivery processes fresh → replay dedups. The crash window (process death between ingest-commit and branch) exists only for non-payout events and is covered by their §8 convergence lanes — documented, not hidden.

## OPERATIONS REVIEW

One new alarms arm; zero new dashboards or queues. `docs/runbooks/abuse.md`: triage, hold/lift with step-up, the escalation line (legal-shaped things go to the Founder before action), the flooding posture. Dismissal is honest SQL-with-reason until the Administration domain arrives (recorded, mirroring the pre-C9 posture).

## EXPERIENCE REVIEW

The report door is quiet and findable — a caption-weight dotted link at the page's foot, a disclosure form with plain words, "please don't include personal details" where people would type them anyway, and a thank-you that promises only what happens ("a human will look"). Nothing else in the product grew suspicious chrome; no operator/security vocabulary reaches buyer surfaces; held shops follow the established masked semantics with no new copy.

## PERFORMANCE OBSERVATIONS

One indexed upsert per rate-limited request (row-lock per key-window — trivial at launch budgets; revisit trigger recorded at >50/s on one key); one DELETE-RETURNING per ceremony verification; opportunistic cleanups amortized on writes. Nothing measurable at founding-cohort scale.

## DATA / PRIVACY REVIEW

Three tables, manifest-declared: `rate_limit_buckets` P0 (HMAC digests only — the safest address is the one never persisted), `webauthn_challenges` P1 (hashed challenge, nullable user, 5-min TTL), `abuse_reports` P2 (pseudonymous reporter id; note bounded and classified sensitive because humans paste PII into free text; 24-month retention then review). No raw IPs anywhere; no new PII classes introduced.

## TECHNICAL DEBT

**Introduced:** report dismissal lacks a command (SQL-with-reason interim — Administration domain's first customer); the CSP nonce path is production-only and gains external verification at the C12-3 cutover; fixed-window (vs sliding) limiter accepts one boundary burst as the durable trade.
**Retired:** D-40e (in-memory WebAuthn challenges); TD-007 (production env fallbacks — boot now fails closed, named); the TD-006 follow-up (nonce CSP); the decorative-rate-limiting launch blocker (strategic review Part 1-B); the unreachable-enforcement finding (the machinery has reachable, audited emitters); the webhook observed≠consumed class, generalized.

## FULL GATE RESULTS

*(recorded from the release-candidate sweep — see the release record; filled only from the actual run)*

## GO / NO-GO

*(issued with the gate results)*

## C12-3 READINESS

C12-3 ("A Person, and a Proven Recovery") inherits: delivered mail (C12-1), durable locks + boot gates (this increment), the `guest_tokens` reuse decision, the 72h email-change/recovery rule, consent-as-mechanism, drill guardrails-as-code, and the accumulated production-cutover checklist (mail domain gates + real-webhook-into-deployed-DOF + the verify-POST correction from F2 + CSP external check). Its plan stands as approved; no re-planning required.
