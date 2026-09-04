# PHASE 2 CLOSURE & ROADMAP RE-ENTRY

**Status:** REVIEW + CLOSURE · 2026-09-04 · at v1.54.0. Companion to `LIVING_STREET_RETROSPECTIVE.md`.
**Scope:** reconstruct the original roadmap, map capability maturity, audit Store/Deals/Flicks, recommend the next major program. No implementation.

---

## Part 3 — the original roadmap, recovered from the corpus

Two layers exist. The **original** `IMPLEMENTATION-ROADMAP-v1.0` (six Releases: R1 Commercial Core → R2 **Store Experience** → R3 Marketplace incl. **Deals, the namesake** → R4 Community incl. Sparks → R5 Ignite/AI → R6 Analytics). The **ratified** `POST_COMMERCE_ROADMAP` (2026-08-08) supersedes the forward sequence with five Phases: **P1 Launch Foundations → P2 Living Street → P3 Merchant Evidence/Growth Intelligence → P4 Trust & Reputation → P5 AI**, public launch a milestone at the *end of P2*.

**What comes after Living Street (operative plan):** P3 Merchant Evidence → P4 Trust & Reputation → P5 AI. Notably, **LS-7 Demand Receipts already delivered the seed of P3** (the merchant hears demand). And the *original* roadmap put the **Store Experience (R2) before the Marketplace (R3)** — i.e. finishing the Store was always meant to precede/accompany discovery, and discovery ran ahead of it during Phase 2.

## Part 6 — Deals maturity & the destination decision

**A DOF "deal" today is a time-boxed promotional _announcement_, not a price mechanic** — a headline (≤90) + story (≤600) over one published product, with fire/save/follow. It carries **no discount, percentage, compare-at, or checkout effect**; the schema header states the economic half is deferred to the unbuilt **CS4 Offers** (`deals.offer_id` is a named-but-absent seam). Lifecycle is publish + manual-end only (no scheduled start, no auto-expiry). Deals are fully wired into discovery (home stream, `deals-now`/`fresh-today` lanes, search, threads, SEO, per-store detail pages) but there is **no public Deals destination** (the `/deals` page is merchant authoring; a `listDealsFeed` public endpoint exists but is orphaned/unwired), and the storefront lists sparks but not deals.

**Destination decision (from the product thesis, not convenience):** the thesis is "a street of independent shops — their **deals**, updates, and stories." Deals are the namesake, so a destination is thesis-justified — **but not yet.** A destination for price-less announcements would be thin; what makes a Deals destination worth building is the **economic mechanic (CS4 Offers — real, honest savings)**, a Commerce capability, not a discovery surface. Verdict: **C (both) eventually — a Street voice now (already true via the deals-now lane + home branch), a dedicated destination AFTER Offers gives deals teeth.** Sequence: Offers substrate → Deals destination. (Answers Part 6's A/B/C/D: today B is built; C is the goal; the blocker is the offer mechanic, not a page.)

## Part 5 — Flicks readiness

Flicks is a **reserved vocabulary word, not a spec.** The corpus defines it once (ADR-001: "Flick — short-form video content") and lists it in the Content pillar of both Bibles; there is **no Flicks spec, ADR, schema, route, or code** (the only lexical hit is an unrelated comment). The media pipeline is **image-only**: `media_assets` CHECK is `image/jpeg|png|webp`, 10 MB cap, media roles are `gallery|hero|swatch` — no video type, storage, processing, transcoding, or playback. The signature-experiences doc even lists "live making video" as an **anti-pattern**.

**ARE WE READY TO START FLICKS? → NO, BECAUSE** two real architectural dependencies are absent: (1) a video media pipeline (storage/transcoding/streaming/playback — the current image-only Media capability C9 has none of it), and (2) a Flicks product specification (intended user, relationship to Store/products/deals/Sparks/Street — none exists; it is the furthest-out, un-batched item on the original roadmap). These are genuine blockers, not mere ordering. Flicks is a future C9 Content program, not a next increment.

## Part 4 — Store v1 completion

**≈60% of the envisioned Store is meaningfully built** (denominator = merchant capability, not code). The distribution is the story:
- **Launch spine ≈ 90–95% complete:** create → identity/voice → branded storefront → publish (backend) → products-on-store → deals → sparks → images → SEO/JSON-LD/share → discovery → orders → demand receipts → workspace shell. The reason-to-exist works end to end.
- **Post-launch management ≈ 25–30%:** the gaps, each contradicting a FROZEN ADR-001 promise.

**The smallest set that blocks "Store v1 complete" (all owner-side management):**
1. **Store lifecycle beyond publish** — no `pause/archive/close/delete/unpublish` methods/commands/endpoints/UI, though the transition table exists. **A merchant can open a store but cannot take their own store down** (only an operator hold can). Violates ADR-001 §9 ("rename, re-brand, or unpublish everything") and §7 entirely. **Biggest single gap.**
2. **A workspace publish/unpublish CTA** — publishing works only inside Ignite; a post-Ignite draft or a re-publish has no button.
3. **A real Store Settings door** — carrying handle change (redirect seam exists), branding editing (palette/logo/typography — today only *voice* is editable), theme, and per-store policy (returns/terms) authoring. ADR §11's "settings split by mental model" is unbuilt.

Deferred, correctly, and NOT v1 blockers: collections, video/Flicks, customers/CRM, shipping zones, inventory UI, staff-invite RBAC UI.

## Part 7 — capability maturity map

| Capability | Maturity | Biggest missing piece | Orig. roadmap |
|---|---|---|---|
| Products | COMPLETE | bulk import | R1/R2 foundational |
| Store (launch spine) | COMPLETE | — | R2 |
| Store (management) | PARTIAL (~30%) | lifecycle + settings door | R2 |
| Cart | FUNCTIONAL-THIN | UI line management | R1 |
| Checkout | COMPLETE (real Stripe) | saved addresses/express | R1 |
| Orders (buyer) | FUNCTIONAL | tracking polish | R1 |
| Merchant Orders | COMPLETE | volume/bulk tools | R1/R2 |
| Buyer Account | FUNCTIONAL | saved addresses, profile | R1 |
| Payments/Payouts | FUNCTIONAL | payout/balance dashboard UI | R1 |
| Search | COMPLETE (LS-2) | real vocabulary tuning | R3→P2 |
| Street/Discovery | COMPLETE (LS-1/3/4) | real signal | R3→P2 |
| Threads | COMPLETE (LS-5) | validation | P2 |
| Return journey | COMPLETE (LS-6) | email (deferred) | P2 |
| Demand receipts | COMPLETE (LS-7) | real makers | R6→P3 seed |
| SEO/Findability | COMPLETE (LS-8) | scale (sitemap index) | R2→P2 |
| Deals | FUNCTIONAL-THIN (announcement only) | the offer/price mechanic (CS4) + a destination | R3 namesake |
| Sparks | COMPLETE (text+1 photo) | — | R4 |
| Flicks | NOT-STARTED (reserved term) | video pipeline + spec | R-far / C9 |
| Inventory | PARTIAL (backend done, no UI) | the merchant view | R1 |
| Shipping | PARTIAL (backend done, thin UI) | zones/rates editor | R1 |
| Returns | FUNCTIONAL in Orders / PLACEHOLDER module | dedicated queue | R1 |
| Coupons/Promotions | NOT-STARTED | everything (with CS4 Offers) | R3 |
| Marketing | NOT-STARTED | everything | far |
| Customers/CRM | PLACEHOLDER | data model + page | R4-ish |
| Notifications | PARTIAL (transactional only) | persistent in-app inbox + prefs | R4 |
| Trust/Abuse | PARTIAL | merchant hold-notice UI; scaled safety | R3/P4 |
| Admin/Operations | PARTIAL (API-only) | any ops console UI | continuous |

## Part 8 — UI/product coherence findings (mapped, not fixed)

- **Six coming-soon stubs** (`customers, coupons, marketing, inventory, shipping, returns`) — and three of them (**inventory, shipping, returns**) have **complete or working backends** with no/inline UI: the sharpest "backend outran UI" debt.
- **`enforcement_hold` is returned to the workspace but rendered nowhere** — a held merchant gets no on-screen explanation (UX gap; enforcement still applies server-side; **not** a security defect).
- **No admin/ops console UI** — `ops/*` endpoints (alarms, risk-resume, hold/release, refunds) have zero pages.
- **No public Deals destination, no Flicks surface, no public buyer profile.**
- **`/` bounces an anonymous stranger to login** — the open-web front door is `/home`; there is no brand/marketing landing at root.
- **Gating gap:** the six stub pages lack `auth` middleware (they show nothing, so low-risk, but inconsistent).
- **Personality thin** on the stubs and the auth/legal pages vs the warm "street language" of home/orders/storefront.

## Part 9 — controlled cohort start checklist (unchanged; parallel track)

- **FOUNDER:** approve the "pilot, no claims" invitation framing; invite 10–30 people.
- **DNS/INFRASTRUCTURE:** verify the sender domain in Resend (SPF + 2 DKIM) — **the only engineering-adjacent prerequisite**, a ~5-minute action.
- **ENGINEERING:** none remaining (platform, discovery, receipts all shipped; Reality Ledger separates seeded from real).
- **OPERATIONS:** an operator on the abuse alarm during cohort hours; a deployed environment (host choice — a DEPLOYMENT item).
- **LEGAL/PILOT FRAMING:** the placeholder legal pages stay bannered; the pilot framing says so.

No new cohort gates. Detail in `docs/runbooks/CONTROLLED_COHORT_RUNBOOK.md`.

## Part 10 — next major program

Scored A–E against roadmap fit · prerequisites · buyer value · merchant value · differentiation · architectural readiness · debt retired · demoability · cohort-validatability · premature-complexity risk:

- **A. Finish Store v1** — original R2 (Store precedes Marketplace); prerequisites all met; **highest merchant value**; retires the most placeholder/debt (lifecycle, settings, branding, and folds in shipping/returns/inventory UIs); repairs a **FROZEN-promise violation** (a maker can't take down their own store); fully demoable; directly cohort-relevant (a real maker hits these first); **lowest premature-complexity risk** (completing designed scope, inventing nothing). **Strongest on nearly every axis.**
- **B. Flicks** — blocked (no video pipeline, no spec); highest premature-complexity risk; furthest-out. **Not now.**
- **C. Deals destination** — thesis-aligned but its real prerequisite is the CS4 Offers price mechanic; a price-less destination is thin. **After Offers.**
- **D. Merchant operational capabilities (inventory/shipping/returns UIs)** — high debt-retirement, but Operating-tier and partly subsumed by Store v1's settings work. **Fold into A.**
- **E. P3 Merchant Evidence proper** — LS-7 already shipped its seed; deepening it needs *real* attention data (cohort), so it is validation-gated, not build-ready.

**Recommended next major program: A — STORE v1 COMPLETION** ("the maker owns and runs their store, end to end"). It is the original roadmap's own next step, the largest debt-and-placeholder retirement, and the repair of a promise the product currently breaks.

**Recommended first increment — SV-1: "The maker controls their own store."** The owner-side store lifecycle (pause/archive/close/delete/unpublish, with the paused reason and the 90-day-reversible close from ADR §7) + a workspace **publish / unpublish CTA** for any store state (not just inside Ignite). Smallest coherent step, highest value, and it closes the single biggest frozen-promise gap. SV-2 would then be the Store Settings door (handle change, branding editor, policy authoring); SV-3 folds inventory/shipping/returns module UIs onto their finished backends.

**Consistent with the original roadmap because** R2 "The Store Experience" was always the release *after* the commercial core and *before* the marketplace — discovery (P2) ran ahead of it, and SV-1…SV-3 simply complete the store the original plan always intended, now with real discovery already pulling buyers toward it.

**Explicitly do NOT build yet:** Flicks (no pipeline/spec), a Deals destination (needs Offers first), Coupons/Marketing/Customers-CRM (later tiers), the AI phase (ports stay warm; models wait for P2–P4 signals), and any further Living-Street discovery tuning (validation-gated on the cohort).
