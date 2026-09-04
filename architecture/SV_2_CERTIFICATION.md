# SV-2 CERTIFICATION — The Maker Shapes Their Store

**Program:** Store v1 Completion · **Increment:** SV-2 (Store Settings) · **Branch:** `increment/sv-2-store-settings` · **Date:** 2026-09-04
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## Inherited SV-1 browser gap — root cause & resolution
SV-1 certified its `/store` UI as `[NOT DEMONSTRATED]`. Diagnosed here to two independent causes, both **dev/harness**, neither a product defect:
1. **`devUserId()` mints a random per-browser id** (`app/composables/ignite/launch.ts:33`) — a fresh pane was an anonymous user with an empty workspace. Fixed with a **dev-only** `?dev-user=<uuid>` plugin (`app/plugins/dev-user.client.ts`) that writes the same `dof.dev-user-id` localStorage the dev adapter reads; inert unless `identityMode==='dev'`, and the dev adapter itself refuses production. It is not authentication and cannot weaken the session path.
2. **Corrupt persistent dev data.** The persistent embedded PG (`.data/dev-pg`) had accumulated cross-session cruft: Rosa's owner membership on her real business was `suspended`, a second empty business had been created for her, and stray principals/businesses from prior browser/test runs remained — so `workspace-overview` (correctly returning only *active* memberships) resolved Rosa to an empty business (`stores: 0`). The query logic is right; the fixture was corrupt. Resolved by resetting `.data/dev-pg` and re-seeding clean. The seed's skip-if-business-exists idempotency could not self-heal this — recorded as a watch-trigger.

**Result: the `/store` experience (SV-1 lifecycle header + SV-2 settings) is now `[BROWSER]`-demonstrated on desktop and mobile.**

## Pre-SV-2 Store-settings audit
Identity/brand (name, palette, typography, voice tagline/story/promise, `logo_media_id`) lives in `brand_kits`, editable via the whole-value `PUT /stores/:id/brand-kit` (`storefront.brand.write`, owner+manager). Story/tagline/promise already shipped on `/store`. `stores.policies` is a **dormant** blob (never edited, never shown; its default "14 days" even contradicts enforcement) — deliberately left untouched. Returns is a fixed platform constant (`RETURN_WINDOW_DAYS=30`); shipping is a structured per-store profile, editable and already public. The `store_handles` ledger + redirect-aware public read exist; only the rename **write** path was missing. Logo id round-tripped but was **never resolved to a URL or rendered** anywhere.

## Identity contract (ADR §11)
- **Identity:** store name, handle.
- **Expression:** tagline, story, promise, palette accent, logo.
- **Customer promises:** shipping (merchant-controlled), returns (platform truth).
- **Platform truth (never merchant-editable):** lifecycle, enforcement, verification, payments, legal.
SV-2 lets the maker edit the first three groups where authorized; the fourth is inaccessible to any settings payload.

## KEEP / REUSE / MERGE / REMOVE / DEFER
- **KEEP (new):** handle change (aggregate method + command + endpoint); logo rendering (URL resolution + public payload + `StoreShell`/preview); the media-ownership guard.
- **REUSE:** brand-kit PUT (name/palette/logo), shipping PUT, `POST /media` + `DofMediaSlot`, `useBrandKit` preview, handle-availability endpoint, the redirect-aware DAO.
- **MERGE:** display-name edit = `brand_kits.name` **synced to `stores.name`** (new `store.rename()`); a derived truthful Policies line (returns + shipping) instead of freeform policy text.
- **REMOVE from scope:** the dormant `store.policies` blob; any freeform returns field.
- **DEFER (seams recorded):** hero/cover image (new schema), custom domain (`storefront.domain.write` reserved), typography editor, SEO fields (derived from voice), the literal three-way Settings-tab split (`DofSettingsLayout`).

## Schema & complexity delta
- **Schema: ZERO migrations.** Handle redirect reuses existing `store_handles` columns (`status='redirect'`, `redirect_to_handle`); logo reuses `brand_kits.logo_media_id`.
- **Events: +1 additive** (`STORE_HANDLE_CHANGED`) with payload schema.
- **API/commands:** +1 command (`changeHandle`) + 1 endpoint (`POST /stores/:id/handle`); +1 media-ownership port. Name/palette/logo reuse the brand-kit PUT; returns rides the existing shipping endpoint (one derived field).
- **UI:** `/store` extended with Identity / Appearance / Story / Policies sections + the handle-change disclosure. No new route.
- Zero new tables, services, cron, or projections.

## IA decision (ADR §11)
ADR §11 places *Store settings (branding, storefront/theme, domains, SEO, policies, handle)* under a three-way Settings split. The as-built app already deviated from the §11 skeleton with a top-level **Store** module (`/store`) that is the store's home. SV-2 extends `/store` as the ONE coherent Store Settings destination (honoring §11's **content** list) rather than introducing a second home — no duplicate fields, nothing to migrate. The literal Settings-tab split (`DofSettingsLayout`, unused) is recorded as a future seam. This refines an IA sketch, not a frozen *semantic* decision (unlike the §7.2 lifecycle freezes), so no gate fired — the same class of interpretation SV-1 made for §7.1.

## Handle-change law (ADR §11 "immutable-with-redirect-on-change")
Owner-only (`storefront.domain.write`) **and** fresh step-up (`sensitivity:'sensitive'`); audited before/after; rate-limited 5/hr and endpoint-declared sensitive so denied attempts are audited too (§11 §591 takeover signature). Transaction order: validate/normalize via the `Handle` VO → aggregate gate (hold / status / same-handle) → claim the new handle (409 on collision) → flip the old handle to `redirect`→new **and flatten any existing redirect chain** → persist + event + audit. Refused under any enforcement hold (423) and from a closed/archived/deleted store (only draft/live/paused may change). The old handle becomes a permanent redirect owned by the store — **never released, never hijackable**. Display name is separate from the URL and needs no handle change. Proven `[BROWSER]` (new serves + old redirects to the same store) and `[AUTOMATED]` (collision, reserved word, no-op, A→B→C coherence, hijack refusal, step-up, hold, closed/paused, convergence, audit).

## Existing links / stale references
Every public surface live-joins `stores.handle` (storefront, search, lanes, threads, return, sitemap, SEO, orders, cart, checkout) — no denormalized handle strings anywhere. The only durable copies are the `store_handles` ledger (converted to a redirect, not deleted) and append-only `domain_events`/audit (immutable historical facts, correctly left as-is). So a change propagates everywhere with no projection rebuild.

## Media
Reuses `MediaPort`/`media_assets`/`DofMediaSlot`; jpeg/png/webp only (SVG blocked at upload — stored-XSS vector closed), 10MB, business-scoped, masked cross-tenant refusal. **New guard:** a logo must belong to the store's own business (`deps.media.belongsToBusiness`), enforced in the brand-kit command — a store can never adopt or render another business's media by id (`[AUTOMATED]`). Replace overwrites the reference (old asset orphaned — consistent with existing behavior; the sweeper remains unbuilt, recorded). No hero/cover (deferred, new schema). No video.

## Policy truth (never a lie)
Returns is DOF's authoritative constant surfaced with shipping (`return_window_days` on the public shipping endpoint) — there is no per-store returns field to contradict it, and the strict brand-kit schema rejects one (`[AUTOMATED]`). Shipping copy is the structured profile the checkout actually charges. The freeform `voice.promise` remains the merchant's own words (not an enforceable guarantee); recorded as a watch-trigger.

## Authorization / step-up / audit
Presentation edits (name/palette/logo/voice) → `storefront.brand.write` (owner+manager). Handle change → `storefront.domain.write` (**owner-only**) + step-up. Non-member → masked NOT_FOUND. Consequential actions audited to `audit_logs` with before/after digests.

## Lifecycle / enforcement interaction
A held store may still edit branding/story (it stays publicly masked — status unchanged) but **cannot change its handle** (423, hold untouched) — proven. No settings command mutates lifecycle or enforcement state; strict schemas reject smuggled `status`/`enforcement_hold` keys (422). Paused stays paused after edits; closed refuses handle change.

## Public propagation
Name/palette/story/logo edits reach storefront, cards, street, search, lanes, threads, return, SEO, and the workspace preview live (no projection carries presentation; `rm_street_pulse` holds only ids + counts). Only CDN/browser cache TTL (≤60s storefront/shops) delays visibility.

## Store card improvement (Section 20)
Now that a logo has a resolvable URL, the public store chrome (`StoreShell`) renders it beside the name — closing the Phase-2 "text-only store card feels database-ish" note with existing data, without touching Living Street ranking.

## Concurrency / idempotency
A repeated handle change converges — the second (same-handle) request is a clean CONFLICT no-op, leaving exactly one `merchant.store.handle_changed` event (`[AUTOMATED]`). The store row is `SELECT … FOR UPDATE`.

## Hostile matrix — 15/15 `[AUTOMATED]`
Identity edit → public reflection · display-name/`stores.name` sync · logo cross-tenant guard (own ok, other refused) · non-member masked · settings payload cannot smuggle lifecycle/enforcement · handle change serves + old redirects · old handle un-hijackable · A→B→C coherence · collision/reserved/no-op refused · step-up required · hold blocks + untouched · closed refuses / paused allows & stays paused · repeated change converges to one event · handle change audited before/after · returns is the derived 30-day constant.

## Browser demonstration — honest classification
`[BROWSER]` desktop + mobile: `/store` renders as Rosa (inherited gap fixed); name/appearance/story/preview/shipping+derived-returns/handle sections; live handle-availability check; handle change executed → new handle serves + old handle redirects to the same store; public storefront at the new handle renders the identity. SV-1 lifecycle controls render in the same environment. Logo upload’s end-to-end path is `[AUTOMATED]` (the browser file-picker was not driven); everything else is `[BROWSER]`.

## A11y / mobile / security / performance / privacy
A11y: labelled sections, real headings, the accent uses a native color input with a text label (not color-only), the logo dropzone carries alt, the destructive handle change is keyboard-reachable behind disclosure with an explicit confirm and a live availability status. Mobile (375px): single column, comfortable controls, real dropzone — not a squeezed desktop form. Security: owner-only + step-up + audit on handle; masked NOT_FOUND; SVG blocked; media ownership enforced; strict schemas. Performance: each command is a single `FOR UPDATE` read + update + event; no new scans; propagation is live-join (no rebuild). Privacy: no new PII, columns, or retention.

## Revised Store v1 completion & remaining gaps
Store v1 moves from **≈68% → ≈82%** (capability, not files): the maker now owns identity, address, appearance, and truthful promises after launch. Remaining Store-v1 gap is **SV-3 — Running the Store**: surfacing the already-built Inventory / Shipping(detail) / Returns operational backends through finished merchant UI. Recorded seams: hero image, custom domain, typography, the literal Settings-tab split.

**STOP after SV-2 release for Founder review — SV-3 not begun.**
