# STORE V1 — CLOSURE ASSESSMENT

**Program:** Store v1 Completion (SV-1 · SV-2 · SV-3) · **Date:** 2026-09-04 · **Judgment: Store v1 is COMPLETE (GO)** — with a candid register of important non-blockers below.

This document is deliberately critical. Shipping SV-1/2/3 is not proof of a finished product; the product is judged against the whole merchant journey.

## The journey, walked
| Step | State | Where |
|---|---|---|
| Idea → Ignite → store created → product created → published | **DONE** (launch spine, pre-existing) | `/ignite`, product authoring, publish |
| Identity editable after launch (name, handle, story, promise, accent, logo, truthful policy) | **DONE** | SV-2 `/store` |
| Lifecycle controlled (pause/reopen/close/restore, 90-day recovery) | **DONE** | SV-1 `/store` |
| Inventory manageable (see availability, turn tracking on, set/adjust) | **DONE** | SV-3 `/inventory` |
| Shipping configurable (one truth, buyer-consistent) | **DONE** | SV-3 `/shipping` (+ `/store` door) |
| Order fulfillable (pack/dispatch/tracking/partial/pickup) | **DONE** (pre-existing) | `/orders` |
| Return actionable (authorize/decline/resolve + queue) | **DONE** | `/orders` bench + SV-3 `/returns` |
| Demand understandable | **DONE** (LS-7) | `/analytics` demand receipts |

A non-technical maker can now **launch and run** a DOF store end to end without engineering or admin intervention. That is the bar for Store v1, and it is met.

## Why GO (not NO-GO)
No remaining item *blocks* a small maker from running their store safely: money is correct to the cent (C10/C11), stock cannot oversell, returns cannot double-refund or double-restock, identity and address changes are safe, and enforcement is honest and supreme. Every gap below is a *quality* or *reach* gap, not a correctness or capability blocker.

## Remaining items — classified
**IMPORTANT NON-BLOCKER (worth a fast follow, none block launch):**
- **No proactive low-stock signal.** Inventory ranks low/out first, but nothing nudges the merchant who isn't looking (no threshold, no Home alert wired to real counts).
- **No buyer "delivered" signal for shipped parcels.** Buyers see `dispatched` + tracking text; there is no delivery event/letter for ship (pickup has handover). Honest but incomplete.
- **Refunds have no step-up / per-role gate.** Any active staff member can resolve a return and issue a refund; deliberately left unchanged (money-law discipline), but a hardening candidate.
- **Settled-payout refund clawback is by-alarm, not automatic.** A refund after payout drives `merchant_payable` negative → `negative_payable` ops alarm (RM-H5), resolved by a human. Correct, but manual.
- **Inventory/returns lists are bounded** (200/100) with keyset paging deferred — fine for a small maker, a scale seam otherwise.
- **PRR-H1 orphan:** a payment_pending >24h force-fail leaves committed stock needing manual correction — and the manual inventory tool SV-3 adds could now service it, but that wiring was out of scope.

**DEFERRED-V2 (Store, later):** hero/cover image (new schema), custom domain (`storefront.domain.write` reserved), typography editor, named shipping methods / zones / carrier config / delivery estimates, low-stock thresholds, multi-location inventory, media orphan sweeper, the literal three-way Settings-tab split (`DofSettingsLayout` still unused).

**FUTURE DOMAIN (not Store):** Customers CRM, Coupons, Marketing, Offers, Deals landing, Flicks.

## Debt / watch-triggers accumulated across SV-1→SV-3
1. The public-visibility predicate is a **24-site convention**, not one helper (SV-1) — a new surface added without the full triad would leak an offline store.
2. `voice.promise` is freeform and rendered with a check — it can overclaim vs enforced policy (SV-2).
3. Two divergent inventory reason vocabularies (`0018` CHECK vs `reason-codes.ts`) — SV-3 uses the migration's; reconcile before a richer adjustment feature.
4. Media orphan sweeper unbuilt (replace leaves orphaned assets) — since SV-2's logo work made media user-replaceable.
5. Seed idempotency (skip-if-business-exists) cannot self-heal corrupt persistent dev data — twice now the demo needed a `.data/dev-pg` reset.
6. Refund authorization has no step-up/role gate (SV-3).

## Verdict
**Store v1 is complete.** DOF is no longer "a beautiful launch funnel attached to unfinished operations" — the operational loop closes. The next program should re-enter the original roadmap (Offers → Deals landing → Flicks); see the SV-3 Founder report for the full re-entry analysis. **No next program is authorized or begun.**
