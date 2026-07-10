# ACCEPTANCE-001 — Product Vertical Slice: Business Acceptance Validation (ACC-COM-001)

**Date:** 2026-07-05 · **Roles:** Product Owner / QA Lead / Principal Engineer / Merchant Representative
**Method:** black-box only — no code review. Live-API attack probes over real HTTP + real PostgreSQL (5 probes, run and deleted), plus workflow walkthroughs against the published contracts and the 58-test integration evidence.

---

## Executive Summary

The engineering substrate is excellent — invariants hold under every break attempt, errors are structured, auditing/eventing/tracing are complete, and the future seams (listings, inventory, offers, AI) are genuinely clean. But two findings, both **empirically confirmed by probe**, mean this is not yet shippable to paying merchants: a routine merchant action (reusing a SKU across products) returns an **HTTP 500 "unexpected error"**, and the platform's own flagship story — *start simple, grow later* — is **severed at the API seam**: a merchant who creates a simple product has no path to options or variants for it, ever. The fixes are small (an error mapping; endpoints over already-tested aggregate behaviors) precisely because the domain layer beneath is right.

## Scores

| Dimension | Score | Basis |
|---|---|---|
| Business readiness | **6.5/10** | Two blocking capability/experience gaps (B1, B2) |
| Engineering readiness | **9/10** | Machinery, tests, security, audit all strong; the 500 is a mapping gap, not architecture |
| Merchant experience | **7/10** | Premium touches (readiness checklist in every response, silent SKUs, explainable errors) undercut by B2's dead end and P4/P5 papercuts |
| API design | **8/10** | Consistent, contract-first, RFC 9457, idempotent, masked; naming trap (B4) and B1 mar it |
| Future scalability | **9.5/10** | Channel/inventory/offer/AI seams verified clean; nothing here needs redesign for any listed future |

---

## Blocking issues

**B1 — Cross-product duplicate SKU returns HTTP 500 (probe P1, confirmed)**
`POST /products` with a SKU already used by another product: `500 INTERNAL "An unexpected error occurred"`. Merchants manage SKUs in spreadsheets; reuse is a *routine mistake*, and BLUEPRINT-002 §4 itself specifies `409 SKU_TAKEN` for exactly this. The DB constraint (`uq_variants_business_sku`) fires correctly — the platform simply never maps unique-violation (23505) to a domain answer. A paying merchant seeing "unexpected error" on normal input files a support ticket and loses trust. **Fix size: small** (constraint→problem mapping at the endpoint wrapper or command layer + regression test).

**B2 — The simple→variants growth path does not exist (probes P2+P3, confirmed)**
The Ignite/Grandma story is: start with one plain soap, grow later. Reality: a zero-options product refuses a second variant with `409 "a variant with this option combination already exists"` (domain-correct, merchant-baffling — she never made "options"), and **no endpoint manages options post-creation** (`POST …/options` → 404; `PATCH` rejects the key). The aggregate's option surgery — `addOption` with the per-variant assignment protocol, value/axis removal with collapse protection — is fully implemented and 78-test-covered, but has **no API door**. Every simply-created product is permanently locked out of variants; the only recovery is re-creating the product. This fails the sprint's own acceptance list ("Manage options") and breaks Progressive Complexity where it matters most. **Fix size: endpoint work only** — the hard domain problems are already solved and tested.

## Non-blocking improvements

- **N1 (P4):** the default grid includes archived products; premium SaaS defaults to the working set (`status != archived`) with an explicit "show archived" filter.
- **N2 (P5):** `"Expected integer, received float"` for `14.99` — correct, developer-grade, merchant-hostile. The Money error should say *"prices are in minor units — send 1499 for €14.99"*.
- **N3 (B4-naming):** the `{mediaId}` path segment is actually `product_media_id` (the response field's name). A third-party developer will paste the wrong id once per integration. Rename the segment or alias the response field.
- **N4:** no title search on the grid — hundreds of products with only status+cursor is thin; a simple `title` ILIKE filter is table-stakes until the Search domain lands.
- **N5:** no delete affordance for mistake-drafts (archive only). Tombstone deletion is designed (ADR-001 patterns) but unexposed — acceptable short-term; merchants will ask.

## UX recommendations

Improve the B2-adjacent error copy once options endpoints exist ("This product has no options yet — add one (e.g. Scent) to create more variants") — errors should teach the path, as the readiness checklist already does · surface `recommended` readiness items as first-class UI fodder (they're already perfect Pulse inputs) · default sort "recently updated" is right, keep it.

## Product recommendations

Prioritize **Taxonomy (minimal)** next-adjacent: `category_path` is an opaque string with nothing to browse or validate against — merchants are typing folklore (K3 is the documented reason; this is the business cost becoming visible) · the acceptance probes worth keeping should graduate into a permanent black-box acceptance suite once B1/B2 land, so future slices get attacked from the merchant angle by default.

## Validation results (everything else)

**Domain rules under attack:** duplicate combinations 409 · archived mutations 409 with *"restore it instead"* guidance · invalid categories/lifecycle/media references all correctly refused · duplicate media & hero rules hold · masking (404) held against cross-tenant probes — nothing broke that should hold. **API:** idempotency replays verified; pagination cursors opaque and correct (µs-precision); auth/capability/trust gates all engaged (support-agent draft-grant denied; suspended standing blocked). **Future compatibility:** channel columns, variant-referencing design, offer targeting language, provenance/AI hooks, event language — all present and uncompromised; no Product redesign is plausible for any listed future. **Production checklist:** architecture unchanged ✓ · 194 unit + 58 integration ✓ · security acceptable ✓ · audit/events complete with trace ✓ · docs complete (PRODUCT-AGGREGATE.md, OpenAPI, DECISIONS D-28…D-30) ✓ · debt documented ✓.

---

## Verdict

# Yes, with conditions

**Conditions before merchant release:** **C1** = fix B1 (unique-violation → `409 SKU_TAKEN`, with test) · **C2** = fix B2 (option-management endpoints over the existing, fully-tested aggregate behaviors, with the improved error copy). Both are days-not-weeks because the domain layer beneath them is finished and proven — which is itself the strongest signal about this slice: every acceptance failure found is a missing *door*, not a missing *room*.

---

## Closure (IMP-COM-001C, 2026-07-05)

Both conditions and all four notes were closed and regression-locked (decisions in D-31):

- **C1/B1 closed** — `uq_variants_business_sku` violations now surface as `409 SKU_TAKEN` with merchant-worded copy, at create-time and add-variant-time; regression tests assert both doors and that the failed transaction leaves nothing behind.
- **C2/B2 closed** — five option endpoints (`POST/PATCH/DELETE /products/{id}/options[/{optionName}]`, `POST /options/{optionName}/values`, `DELETE /options/{optionName}/values/{value}`) expose the existing aggregate behaviors; AddVariant on an option-less product now teaches the options path.
- **N1** default grid excludes archived (`show_archived=true`) · **N2** Money errors teach minor units · **N3** route segment renamed `{productMediaId}` · **N4** `q=` title filter added.
- The probes from this review are now permanent: `tests/integration/commerce/acceptance.test.ts`.
- **N5** (mistake-draft deletion) remains open by design — tracked for a future slice.

