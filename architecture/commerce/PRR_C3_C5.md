# DOF — Production Readiness Review: C3–C5

**Status:** Completed 2026-07-28 · Reviewers: Principal Engineer / Principal Architect / Staff Security / Staff SRE / Product Architect (one adversarial pen)
**Scope:** checkout saga, order lifecycle, reservations, payments domain, ledger, webhooks, buyer/merchant surfaces (v1.31.0–v1.34.0). Assumption: millions of orders, billions of ledger entries, eventually.
**Method:** code-level attack, not defense. Every finding cites the mechanism, not a vibe.

---

## Executive Summary

The C3–C5 foundation is architecturally sound — the idempotency spine, the honest race resolution, the double-entry ledger, and the constitutional immutability all held under adversarial reading and storm testing. The review found **one CRITICAL defect** (a connection-pool deadlock in the authorize path that the single-buyer storm test structurally could not catch), **two HIGH** operational gaps (an unbounded `payment_pending` retry loop with committed stock, and silently swallowed confirmation errors), and a set of MEDIUM privacy/observability debts (declared-but-unimplemented PII purges). All required fixes are small, local, and within frozen ADRs. **Recommendation: GO, conditional on the required fixes below — implemented in this same review cycle.**

**Production Readiness Score: 74/100** (pre-fix) → target 85 post-fix. The remaining 15 points are deliberately deferred, gated work (real-Stripe client flow, Radar, partitioning, managed-PG DR drill) that belongs to the C12 GA gate, not to C6.

## CRITICAL findings

**PRR-C1 · Connection-pool deadlock: `PaymentsService.authorize` opens a second DB connection inside the checkout transaction.**
Mechanism: `checkout()` runs in one pooled connection (holding `checkout_attempts` and `stock_items` row locks); the C4 port adapter calls `paymentsService.authorize`, which wraps its work in **its own** `withTx` → `pool.connect()` (pool max = 10). N ≥ 10 concurrent *distinct-buyer* checkouts hold all 10 connections and each waits for an 11th: the entire application (every endpoint) starves. The existing storm test (8 submits, ONE buyer) could not catch this — the shared attempt-row lock serialized the herd to ~2 concurrent connections. This is the exact class of defect that appears for the first time on launch day.
**Smallest correction:** thread the caller's transaction into `authorize` (the port gains a `tx` first argument — an in-process infra concern; the ADR-frozen semantic signature `authorize(attemptKey, totals, method)` is unchanged). Provider idempotency-by-attempt-key remains the crash-recovery mechanism, exactly as already documented. `void()` keeps own-tx (called on paths where the outer tx dies; a no-op row update after rollback is harmless, and provider void is idempotent).
**Regression guard:** a second storm test — 12 concurrent checkouts by 12 DISTINCT buyers — which deadlocks (test timeout) before the fix and passes after.

## HIGH findings

**PRR-H1 · `payment_pending` retries forever, with stock already committed.**
`confirmOrder` commits reservations (stock SOLD in the ledger) *then* captures; a capture failure leaves the order in `payment_pending`, and `sweepUnconfirmed` retries it eternally. A permanently failing capture = sold stock, no money, a buyer reading "payment settling" forever, and no human ever alerted. **Smallest correction:** the sweep gives up after 24h — order → `payment_failed`, surviving lines → cancelled, an honest timeline entry, and a LOUD log line (the A8-8 posture: discrepancies are records humans resolve; the stock correction is a reason-coded manual adjustment, which Operations already supports). Capture-before-commit was considered and rejected: it inverts ADR-007 A7-5 (the race must resolve pre-capture) and trades this failure mode for a worse one (captured money for uncommittable stock).

**PRR-H2 · Confirmation errors are swallowed silently.**
`index.post.ts` runs the inline confirm with `.catch(() => {})` — a crashing confirm (bug, not business failure) is invisible until a buyer complains. **Smallest correction:** log at error level with the order id; the sweep remains the retry.

**PRR-H3 (gated, not fixed now) · Real-Stripe activation must not inherit the in-transaction provider call.**
Post-fix, `authorize` runs on the checkout tx — correct for the deterministic twin, but a real network call inside a lock-holding transaction (seconds of held locks) is unacceptable. This is already the documented C4→GA restructure (client-side Payment Element confirm + per-step transactions). **Binding note added: real keys must not be configured before that restructure. Recorded here so it cannot be forgotten.**

## MEDIUM findings

**PRR-M1 · Declared PII retention is not implemented.** The manifest promises `checkout_attempts` purge at terminal+30d and cart purge at 90d; no job exists — a GDPR/data-constitution drift (the manifest is a contract). **Fix now:** both purges join the cron sweep (bounded DELETEs).
**PRR-M2 · Buyer order pages expose contact + address behind the 1-year visitor cookie** — acceptable for the sandbox street (same trust as the cart), but a shared-device privacy surface once real orders exist. GA-gate item: session-scoped or per-order-token hardening (ADR-007 §10's single-order guest tokens). Documented, not fixed (would expand scope).
**PRR-M3 · Card-testing fraud surface at real-key time.** Rate limit (20/min) exists; Stripe Radar + per-card velocity belong to the GA gate. Documented.
**PRR-M4 · Observability floor.** No metrics on the checkout funnel or capture failures; correlation ids exist end-to-end but dashboards don't. The loud-log corrections (H1/H2) are the minimum; a funnel metric pass is queued as Stream-B work, not blocking.
**PRR-M5 · `orders`/`ledger_entries` are unpartitioned.** The ADR's month-partitioning is deliberately deferred; at millions of rows the indexes stay healthy (append-only, keyset reads), and partitioning is an online migration later. Documented threshold: revisit at ~1M orders.

## LOW findings

`order_counters` serializes checkouts per store for the tail of the placement tx (µs-scale; the flash-sale profile's contention lives in reservations by design — acceptable, documented) · timeline entries order by `occurred_at` without a tiebreaker sequence (same-ms entries could render swapped; cosmetic) · sweep batches (`LIMIT 20`) mean a backlog drains at 20/cron-tick (self-correcting; alarm via H1's loud logging) · the sandbox decline magic number (66600) is shared between C3 tests and the twin by convention, not constant (cosmetic duplication).

## Architectural strengths (verified under attack)

The one-attempt-key spine survives every interleaving tried, including cross-tab convergence via `ON CONFLICT` + row-lock blocking · the last-unit race resolves pre-capture into educating answers (storm-tested: 1 winner, 11 honest declines, ledger ≡ cache) · double-entry law enforced at the only write path with the L3 recompute identity test-proven · grant-level immutability means even a compromised app role cannot rewrite history · V6 masking and the buyer/merchant gates held against cross-tenant probes in tests · every money quantity is integer minor units end-to-end · forward-only migrations + feature-flagged checkout give clean deploy/rollback.

## Scalability assessment

| Load | Verdict | Reasoning |
|---|---|---|
| 100/day | trivial | nothing warm |
| 1,000/day | comfortable | hot paths are short transactions + keyset reads |
| 10,000/day | fine (~0.4 qps sustained, ~10 qps peak) | reservation row-locks are per-item; pool 10 suffices post-PRR-C1 |
| 100,000/day | **first real bottleneck band** | (a) single-instance cron sweeps (move to SKIP LOCKED multi-worker), (b) inline confirm latency in the checkout request (move confirm to outbox-driven consumer — the seam exists), (c) pool sizing/pgbouncer |
| 1,000,000/day | needs the planned evolutions, no redesign | month-partitioning (M5), queue-driven confirmation, regional read replicas — all named in ADR-007 §9/ADR-008 §10 already |

The first bottleneck is **operational (sweep/confirm topology), not architectural** — the data model carries 1M/day untouched because every hot object is write-once-plus-appends.

## Operational risks
Single cron tick drives all clocks (TTL, abandonment, confirm retry) — a stuck cron silently stalls confirmations (mitigated: inline confirm is primary; sweep is fallback; H1's loud logs surface stalls) · embedded-PG dev parity vs managed-PG production behavior (connection limits, failover) — DR drill is a GA-gate item · no chaos testing of provider timeouts yet (twin is instant) — belongs to the pre-real-key restructure (H3).

## GDPR / PCI posture
PCI: SAQ-A structurally intact — no PAN field exists anywhere; server-side adapter handles tokens only. GDPR: PII inventory accurate in the manifest (contact/delivery snapshots, P2); purges now implemented (M1); order-record retention is the lawful-basis "permanent promise record" with masking rules — a formal DPIA belongs to the GA legal gate (already on C12's list).

## Go / No-Go

**GO — conditional on the Required Fixes below, implemented immediately, gates green, before C6 begins.**

## Required fixes before C6 (all implemented in this cycle)
1. **PRR-C1**: authorize runs on the caller's transaction; distinct-buyer storm test added (deadlock guard).
2. **PRR-H1**: 24h cap on `payment_pending` → `payment_failed` + honest timeline + loud log; test added.
3. **PRR-H2**: confirm errors logged, never swallowed.
4. **PRR-M1**: attempt (30d) + cart (90d) purge jobs in the cron sweep; test added.
5. **PRR-H3 recorded as a binding activation gate** (no real Stripe keys before the per-step/client-confirm restructure) — documented here and in UPDATED_PAYMENT_LIFECYCLE §6 terms.
