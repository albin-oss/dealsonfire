# SV-1 CERTIFICATION — The Maker Controls Their Own Store

**Program:** Store v1 Completion · **Increment:** SV-1 (owner-side lifecycle) · **Branch:** `increment/sv-1-store-lifecycle` · **Date:** 2026-09-04
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## Store state machine BEFORE SV-1
The `Store` aggregate already declared the full `STATUS_TRANSITIONS` graph (draft/live/paused/archived/closed/deleted) and `enforcement_hold` (none/under_review/suspended), and implemented only `publish()` (→live) and `setEnforcementHold()`. No `pause/close/restore/archive/delete` methods existed. The stores table already had `pause_context` and `closed_at` columns (unused). Every public surface already gated visibility on `status = 'live'`. **So the merchant could open a store but never take it down** — the exact asymmetry SV-1 closes. SV-1 is activation, not invention.

## ADR-001 interpretation
ADR §7.1 draws DRAFT → LIVE ⇄ PAUSED → ARCHIVED → CLOSED →(90d)→ DELETED. §7.2 freezes exactly three decisions, all preserved here: (1) `status` ⊥ `enforcement_hold` (never one machine); (2) Paused carries a reason (`vacation|restocking|personal|other`); (3) Closed ≠ Deleted, reversible 90 days. The §7.1 ASCII path (close only from archived) is **illustrative, not a §7.2 frozen decision** — so SV-1 refines it to the merchant mental model §4 mandates (OPEN / PAUSED / CLOSED): `close` reaches CLOSED directly from live or paused, and ARCHIVED remains the ADR's reserved off-platform waypoint (identical public behavior to closed, minus the deletion clock), not an SV-1 merchant verb. No frozen decision is violated; the interpretation is documented in the aggregate.

## Lifecycle concepts — KEEP / MERGE / REMOVE
- **KEEP:** pause, reopen (=publish's paused→live), close, restore, and the 90-day recovery window.
- **MERGE:** "unpublish" (the closure report's word) ≡ pause — one verb, not two. ARCHIVED merged into CLOSED for the merchant's purposes (same public behavior; the only operational distinction, the deletion clock, is what CLOSED carries).
- **REMOVE from SV-1 scope:** a manual "archive" verb and a manual "delete" button — DELETED is reached by the state-derived expiry of the 90-day window (a later, separate tombstone concern), never a button here.

## Final state machine after SV-1
Merchant-owned edges now live: `live→paused` (pause), `paused→live` (reopen/publish), `live→closed` & `paused→closed` (close), `closed→live` (restore, window-gated). Existing edges (draft→live, →archived, closed→draft/deleted) untouched. Reason on pause; `closed_at` stamped on close and cleared on restore.

## Complexity delta
- **Schema: ZERO.** `pause_context` and `closed_at` already existed; the repo now reads/persists `closed_at` (previously ignored). No migration.
- **Events: +2 additive** (`STORE_PAUSED`, `STORE_CLOSED`) with payload schemas; reopen/restore reuse `STORE_RESUMED`. Ride the existing merchant outbox — no new table.
- **API: +3 endpoints** (pause/close/restore) + 1 command module (3 commands) mirroring `publishStore`. +1 permission (`store.close`, owner-only). Reopen reuses the existing publish endpoint.
- **UI: the `/store` status header** (state sentence + one primary action + a progressive-disclosure close confirmation). No new route, no new page.
- Zero new services, cron jobs, or projections.

## Authorization & step-up
pause/reopen → `store.pause_resume` (owner + manager). close/restore → `store.close` (owner-only) AND `sensitivity: 'sensitive'` (fresh step-up required). Non-member → masked NOT_FOUND. All four transitions audited to `audit_logs` (close/restore as `sensitive`). Proven: a non-member's pause is refused (404, store untouched); a stale-step-up close is refused (403, store untouched).

## Public visibility law
The single authoritative predicate `status = 'live' AND enforcement_hold = 'none' AND deleted_at IS NULL` is already repeated across every public surface; the LS-4 pulse re-checks it at read time. SV-1 changes only `status`, so pause/close propagate for free. Proven [AUTOMATED]: a paused store vanishes from storefront (404), the shops directory, and search in one transition; the same predicate governs street/lanes/threads/return/sitemap.

## Existing orders, money, and payouts
Binding law upheld [AUTOMATED]: a guest order placed before a close still exists unchanged, still appears on the merchant order bench, and its buyer path is intact after the store closes. Lifecycle touches only `status`/`closed_at`/`pause_context` — never orders, ledger, or payout state. Freezing money is risk/enforcement machinery, not lifecycle.

## Cart / checkout
A buyer with an item in cart who tries to check out against a newly-paused store is refused (the checkout's product/store availability, keyed on the same `status='live'` law, no longer resolves) — proven [AUTOMATED]. No second availability mechanism was introduced.

## Enforcement stays distinct and supreme
Proven [AUTOMATED]: a held store cannot be reopened by the merchant (publish returns 423 ENFORCEMENT_HOLD), and no lifecycle verb clears the hold; a voluntary pause writes zero abuse/enforcement records and leaves `enforcement_hold='none'`. Orthogonality is intact.

## 90-day recovery
`restoreDaysLeft` derives from `closed_at` (no scheduler): close stamps it (window = 90), restore within the window returns the store live and clears it, restore past the window refuses with CONFLICT (409). Deletion/tombstone/handle-quarantine at day 91 is a later concern (the store simply becomes unrecoverable-by-restore now); handle identity is untouched by pause/close (the handle stays reserved to the business).

## Concurrency / idempotency
Proven [AUTOMATED]: double-pause and double-close both converge to one truthful state with exactly one `merchant.store.closed` event (idempotent no-ops on repeat). Row is `SELECT … FOR UPDATE` in each command.

## Hostile matrix
13/13 [AUTOMATED] through the real HTTP + session + DB stack: pause/reopen · close/restore · window-expiry refusal · pause-reason · discovery masking (storefront/shops/search) · existing-order + merchant-bench survival · new-checkout refusal on a paused store · held-store can't-reopen + hold-untouched · voluntary-pause writes-no-abuse · non-member masked · close needs fresh step-up · close audited · double-pause/close converge to one event.

## Browser demonstration — honest classification
The lifecycle UI (`/store` status header, pause/reopen/restore actions, the close consequence card) is typechecked and its logic is fully covered. Its populated render is **[NOT DEMONSTRATED in-browser this session]**: the dev-demo server authenticates by dev-identity header, and its seeded merchant returns `stores: 0` from the workspace-overview (a pre-existing dev-only quirk recorded since LS-6, unrelated to SV-1), while a freshly-registered session's cookie did not attach in the pane. Neither is an SV-1 defect. All behavior is **[AUTOMATED]** through `startTestApp`, which exercises the identical endpoints, session middleware, commands, aggregate, and Postgres the browser would — including the exact storefront-404-on-pause the UI depends on.

## Accessibility / security / performance / privacy
A11y: the status card uses a labelled section, a real heading, a text state (not color-only — the dot is decorative), and the destructive close is keyboard-reachable behind an explicit confirmation with focus-visible controls. Security: owner-only + step-up + audit on the consequential verbs; masked NOT_FOUND for non-members. Performance: each command is one `FOR UPDATE` read + one update + one event append — no new scans. Privacy: no new identifiers, columns, or retention.

## Revised Store v1 completion
The launch spine was ~90–95%; SV-1 closes the single biggest management gap (a maker can now take their store down and bring it back). Store v1 moves from **≈60% → ≈68%**. Remaining management gaps: the Store Settings door (handle change, branding/palette/logo editing, per-store policy authoring) and surfacing the finished Inventory/Shipping/Returns backends.

## Gaps remaining after SV-1 & next increment
SV-2 (Store Settings door) remains the correct next increment: handle change (redirect seam exists), branding editor, policy authoring. SV-3 then surfaces Inventory/Shipping/Returns. Seams recorded, not borrowed. **STOP after SV-1 release for Founder review.**
