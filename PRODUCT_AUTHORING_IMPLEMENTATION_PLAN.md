# PRODUCT_AUTHORING_IMPLEMENTATION_PLAN.md

**Status & honest premise:** PROMPT-024 instructed "proceed directly into Phase 3" and the slice was **implemented, verified, and committed** (`db8a94b` on PR #1) before this plan was requested. Re-generating "PR-1" would duplicate shipped, tested code. This document therefore serves two real purposes:
1. **A retrospective decomposition** — the shipped work mapped onto the logical PR sequence it *would* have been, as the review map for PR #1 (which is genuinely large and needs exactly this).
2. **The go-forward plan** — the remaining Product Authoring work as true future PRs, under the reviewability discipline this prompt institutionalizes for every slice after this one.

---

## A. The example split, challenged

| Prompt's example | Verdict | Why |
|---|---|---|
| PR-1 Media Port | ✅ keep | Perfectly cohesive: seam + adapter + registry + endpoint; independently valuable |
| PR-2 Product Composer / PR-4 Adaptive Form / PR-5 Product Preview | 🔀 **merge into one** | These are one cohesive unit of business value — a composer without its adaptive fields or preview is not reviewable *as a product*, and splitting them creates artificial cross-PR churn on one file (`products.vue`) |
| PR-3 Readiness Engine | ✅ keep (with its DS component) | Pure engine + `DofReadinessSummary`: independently testable, reused by Store/Listing readiness later |
| PR-6 Accessibility & Motion | ❌ **reject as a PR** | A11y/motion are *properties of every PR* (axe gates, tempo bands), not a bolt-on phase — deferring them violates "no future rewrites" |
| PR-7 Hardening | ❌ **reject as a PR** | Same law: every PR must be production-deployable when merged; "hardening later" is a placeholder by another name |

**Corrected sequence: 4 PRs**, split by cohesive business value.

## B. The four PRs (retrospective map of `db8a94b` + the two prior commits' authoring pieces)

### PR-A — Media Port (seam + adapter + registry)
- **Objective:** any capability can store and reference media today, with the C9 Media capability swappable in later without consumer changes.
- **Files:** `platform/media.ts` (port, `VercelBlobStorage`, sandbox twin) · `db/migrations/0011_media_assets.sql` + manifest · `server/api/v1/media/index.post.ts` · container wiring · `tests/integration/platform/media.test.ts` · harness route + FormData support.
- **Components:** none (backend). **APIs:** `POST /api/v1/media`. **DB:** +1 table (registry, permanent).
- **Tests:** 4 integration (store→registry+URL, tenant-mask 404, type rejection, attach-to-product through the frozen Catalog API).
- **Docs:** UX-AUTHOR-002 §D. **Risk: Medium** (new public-ish surface; mitigated by membership gate + limits + audit). **Rollback:** endpoint removal; forward-only migration stays (inert). **Review size:** ~450 lines.
- **Independently reviewable:** yes — zero UI. **Usable capability:** media storage. **Eases:** brand-kit logos, Sparks images, C9.

### PR-B — Readiness & Authoring Engines (+ `DofReadinessSummary`)
- **Objective:** the confidence voice and the conversational parser as pure, tested logic.
- **Files:** `app/composables/authoring-intelligence.ts`, `app/composables/product-readiness.ts`, `app/design-system/primitives/dof-readiness-summary.vue` + export, `tests/ui/product-authoring.test.ts`, icon addition (`circle`).
- **APIs/DB:** none. **Tests:** 11 unit (parser phrasings, kind/category/description proposals, publish-bar law, invitation cap, digital honesty note, no-urgency language).
- **Risk: Low** (pure + one presentational component). **Rollback:** revert-safe, no consumers outside PR-C. **Review size:** ~350 lines.
- **Independently reviewable:** yes — the persona rules are readable as tests. **Eases:** Store/Listing readiness reuse the component + idiom.

### PR-C — The Product Composer (page + `DofMediaSlot` + wiring)
- **Objective:** the two-field authoring experience — a merchant publishes a professional product in under two minutes.
- **Files:** `app/pages/products.vue` (stub → composer + grid), `app/design-system/primitives/dof-media-slot.vue` + export + i18n, `product-read-dao` (no change needed — grid uses the existing list).
- **APIs touched (read-only reuse):** `GET /workspace`, `GET/POST /products`, `POST /media`. **DB:** none.
- **Tests:** covered by PR-B engines + the app e2e/axe suite; publish path over the frozen Catalog API proven in PR-A's attach test.
- **Risk: Medium** (the flagship UX; mitigated: zero business logic in the page, local autosave, graceful no-business state). **Rollback:** restore the stub page — nothing else depends on it. **Review size:** ~650 lines (the largest, unavoidably — it *is* the product).
- **Usable capability:** Product Authoring end-to-end. **Eases:** edit-mode (same engines), Ignite first-thing convergence.

### PR-D — Verification & docs
- **Objective:** the evidence: persona validation notes, UX packages, CHANGELOG, this plan.
- **Files:** `architecture/UX-AUTHOR-001/002.md`, CHANGELOG, DECISIONS. **Risk: none.** **Review size:** docs.

**Dependency graph:** `PR-A ──► PR-C ◄── PR-B` (A and B are independent of each other; C consumes both; D floats).
**Optimal order & why:** **A → B → C → D.** A first because it's the only migration (schema review isolated, merge-safety highest); B second because its tests *are* the product spec reviewers should read before C; C last so its review is pure composition ("does the page use the approved pieces correctly?") rather than logic archaeology.

## C. Merge & release strategy

- **Now (the real decision):** PR #1 currently carries this slice *plus* four earlier arcs. Recommendation: **merge PR #1 as the R1 foundation release** (every commit on it was gate-green when pushed; the branch is fast-forward-clean), tag it, and **adopt this plan's discipline from the next slice onward** — one branch/PR per cohesive PR-A/B/C-sized unit, stacked when dependent. Splitting `db8a94b` retroactively into stacked PRs is possible (interactive-history surgery) but buys review granularity at real risk to a verified, pushed history — **not recommended**; this document is the compensating review map.
- **Release:** merging PR #1 = deployable (Vercel): migrations forward-only, `BLOB_READ_WRITE_TOKEN` optional (sandbox fallback keeps non-prod honest), no feature flags needed — the composer replaces a coming-soon stub, and TD-001 (restricted DB role) remains the standing pre-launch gate.
- **Engineering rules going forward (adopted as law for every future PR):** compiles · full gates green · production-deployable · no placeholders · no planned rewrites · a11y and motion in-PR, never deferred.

## D. Go-forward backlog (true future PRs, same discipline)

| Future PR | Value | Depends on |
|---|---|---|
| PR-E Edit mode | open a product from the grid into the composer (attribute sets from PROMPT-016 surface here; per-variant prices) | merged PR #1 |
| PR-F Media display join | grid + storefront shelf render photos (read DAO joins `media_assets`) | PR-A |
| PR-G Gallery & reorder | multi-photo `DofMediaSlot` mode | PR-F |
| PR-H C9 adapter swap | Media capability implements the port; Blob adapter retires | C9 |
