# REVIEW-003 — Principal Engineer Review: Product Aggregate (REV-COM-001A)

**Date:** 2026-07-05 · **Scope:** `domains/commerce/{shared-kernel, catalog/domain}`, commerce event schemas, commerce unit tests — reviewed against ADR-002/003/004, BLUEPRINT-002, PRODUCT-AGGREGATE.md, DECISIONS D-01…D-28.
**Method:** independent adversarial pass — full code re-read, two empirical probes (both confirmed defects), gate re-runs. At review time: 66/66 commerce tests, 180/180 unit, typecheck/boundaries/lint/hygiene clean, zero `pg` imports in commerce, zero persistence code. Green gates are the floor; findings below are what they cannot see.

---

## Findings

### HIGH

**H-1 — The aggregate emits events its OWN registered schema rejects (empirically confirmed)**
*Category:* Event contract / correctness · *Files:* `catalog/domain/product.ts` (`updateVariant`), `contracts/schemas/events/commerce-payloads.ts`
`updateVariant(id, {}, actor)` succeeds and emits `commerce.variant.updated` with `fields_changed: []` — probe output: the registered schema answers `"fields_changed: Array must contain at least 1 element(s)"`. The moment the persistence sprint wires the dispatcher, this event **dead-letters at M-6 validation and, being a partition head, blocks every later event for that business until it dies through the retry ladder**. A same-value "change" (`{price: 1500→1500}`) likewise emits a misleading `variant.updated` (`fields_changed: ['price']` with nothing changed). Root cause: `updateVariant` computes `fields_changed = Object.keys(changes)` from the *request* instead of from *actual* change detection, and has no no-op short-circuit — inconsistent with the aggregate's own idiom (`rename`, `setCategory`, `archive` all no-op silently).
*Risk:* self-manufactured poison events; partition head-of-line blocking; misleading consumer signals (a projection rebuilding "on price change" re-renders for nothing).
*Fix:* compute `fields_changed` from detected deltas; emit nothing when nothing changed; reject or no-op an empty `changes` object. Add the missing test class (M-2).
*Must fix before persistence?* **Yes** — this is precisely the bug persistence turns from latent into operational.

### MEDIUM

**M-1 — AI provenance drifts: human edits keep AI attribution (empirically confirmed)**
*Category:* AI governance / auditability · *Files:* `product.ts` (all content mutations), `factories/product-factory.ts`
Probe: `fromDraft` → human `rename('Human Title')` → `aiProvenance.title` still reads `{model: claude-fable-5, humanApproved: true}` attached to text the AI never wrote. ADR-001 §13.3's promise — "merchants can always see what AI wrote" — is inverted into misattribution the moment a human edits an AI-drafted field. Affects title/description/category via their mutations, and price via `updateVariant`.
*Fix:* content mutations clear (or mark superseded) the provenance entry for the field they replace — one helper, four call sites. *Must fix before persistence?* **Yes** — provenance rows written to disk with this bug become a data-cleanup problem instead of a code fix.

**M-2 — Test gap: aggregate-emitted payloads are never cross-checked against schemas**
*Category:* Test quality · *Files:* `tests/unit/commerce/catalog/*`
The factory test validates *factory* events against schemas; no test validates events from *mutations* (rename, updateVariant, media ops, lifecycle) — exactly where H-1 lived. The schema suite validates fixtures, not emissions. *Fix:* a property-style sweep — perform every mutation once, validate every pulled event against `commercePayloadValidators()`. Would have caught H-1 at authoring time. *Must fix before persistence?* **Yes** (lands with H-1's fix).

**M-3 — I11 mutation-path guards for media (50) and variants (100) are untested**
The validator-path is tested (oversized rehydration); the `addMedia`/`addVariant` guard branches are not. Cheap loop tests. *Before persistence?* No — with M-2's sweep ideally, but not blocking.

### LOW

- **L-1** No-op inconsistency: `reorderMedia` with the identical order (or empty set) emits `product.updated`; `updateVariant` no-ops emit (H-1's cousin). The kernel idiom is silent no-ops — apply uniformly.
- **L-2** `ProductMediaInput.variantHint` (MediaRef render hint, e.g. `thumb`) vs `variantId` (product-variant link) — confusable names one autocomplete apart. Rename `variantHint` → `renderVariant` or document loudly.
- **L-3** Changing a variant's price *currency* silently reinterprets an existing sale amount in the new currency (sale carries no currency by design). Harmless single-currency; note for the multi-currency ADR (O2-3).
- **L-4** `makeCommerceEvent` freezes the envelope but not the payload object — a consumer could mutate a payload in-flight. Kernel has the same wart; fix both when touched.
- **L-5** `Product.media`/`variants` getters expose live child entities with public mutators (`setPosition`) — in-domain discipline holds today; a `ReadonlyVariantView` is the strict answer, not urgent.
- **L-6** Option names accept embedded tabs (`.` matches `\t`); cosmetic input-quality gap.

---

## Checklist verdicts (1–20)

1–4 ✓ (root/entities/VOs modeled exactly per contract; entities have identity for the right reasons — listings/inventory/AI-swaps reference them). 5 ✓ lifecycle matches, incl. the activate-vs-restore door distinction. 6 ✓ readiness computed (spec, explainable). 7–10 ✓ **clean absences verified**: no publication/visibility, no stock, no listing refs, no schedules (variant sale windows are BLUEPRINT §2.2's, not scheduling). 11 ◐ provenance modeled safely at *birth* but drifts on edit (M-1). 12 ✓ MediaRef only, zero URLs. 13 ◐ I1–I11 enforced; I-adjacent event hygiene fails (H-1). 14 ✓ event names match ADR-002 §13, incl. the D-28a price_changed resolution. 15 ✗ schemas exist and reject corruption (negative suite is genuinely good), but the aggregate can emit outside them (H-1). 16 ✓ no request context in events; trace at append only (D-20, verified by construction). 17 ✓ zero framework imports (boundary-linted). 18–19 ✓ zero `pg`, interface-only repository (grep-verified). 20 ◐ 66 meaningful tests, strong invariant coverage both directions — minus the emissions×schema cross-check (M-2) and limit-guard paths (M-3).

---

## Final Report

1. **Executive summary:** The model is right — boundaries surgically clean, invariants real and bidirectionally tested, the deliberate absences (listings/inventory/scheduling) actually absent. The defects are both in the *seams between correct parts*: the aggregate and its schemas are individually sound but were never tested against each other (H-1), and provenance is sound at creation but has no story for the edit lifecycle (M-1). Same review-pattern as REVIEW-001/002: bugs live where two proven components meet untested.
2. **Architecture score: 9.5/10** — the cross-domain/shared-kernel discipline and the D-03-style nullable-context spec are exemplary.
3. **Domain model score: 8.5/10** — H-1's missing change-detection and M-1's provenance lifecycle are model gaps, not typos.
4. **Test quality score: 8/10** — excellent invariant coverage (including corrupt-rehydration and negative schemas); the one missing test class is the one that mattered.
5. **Production readiness: 8/10** *as a domain artifact* — would be 9.5 with H-1/M-1/M-2 closed.
6. **Strengths:** invariants explained at enforcement sites and numbered consistently across code/docs/tests; the zero-options ⇒ one-variant theorem treated as a theorem; option-surgery protocol (assignment-required adds, merge-refusing removals); the sprint's own catch history (SKU-from-uuid-head, activate-bypasses-restore) already encoded as regression tests.
7. **Weaknesses:** event emission trusts request shape over detected change; provenance has a birth story but no edit story; no-op discipline applied inconsistently across behaviors.
8. **Required fixes (before persistence):** H-1 (change-detected `fields_changed` + silent no-ops), M-1 (provenance cleared/superseded on human edit of AI fields), M-2 (mutation-emissions × schema sweep test).
9. **Nice-to-fix:** M-3, L-1…L-6.
10. **DECISIONS updates:** none required now; the fixes should add **D-29** (events describe detected change, never request shape; no-ops are silent platform-wide) and extend **D-28** with the provenance-supersession rule.
11. **Recommendation: PROCEED WITH CONDITIONS** — persistence (migrations 0004–0005, PgProductRepository, commerce machinery instances) may start once H-1, M-1, and M-2 land. All three are contained changes to two source files plus tests; nothing touches the frozen contracts.

---

## Remediation Record (FIX-COM-001A, same day)

| Finding | Fix | Regression test |
|---|---|---|
| H-1 | `Variant.update` returns detected `fieldsChanged`; aggregate emits nothing on all-no-op updates; `fields_changed` = deltas only; `price_changed` only on real price/sale change | `updateVariant({})` → zero events; same-value updates → zero events; request-mentions-sku-but-only-price-changed → `['price']` |
| M-1 | `clearFieldProvenance` (additive merchant shared-kernel helper); rename/description/category/price mutations supersede their provenance entries; no-ops clear nothing | fromDraft → edit each field → entry cleared, untouched entries kept; no-op edits keep provenance |
| M-2 | Mutation-emissions × schema sweep: all 12 behaviors, every emitted event validated against `commercePayloadValidators()` | the sweep itself (would have caught H-1 at authoring time) |
| M-3 | — (tests only) | 101st variant refused at `addVariant`; 51st media refused at `addMedia` |
| L-1 | Identical-order `reorderMedia` is a silent no-op | tested |
| L-2 | `variantHint` → `renderVariant` with a disambiguating doc comment | compile-time |
| L-4 | Event payloads frozen at construction (commerce + kernel `makeEvent`) | existing suites (no mutation anywhere) |
| L-6 | Option names/values reject control characters incl. tabs | tab + \u0001 fixtures |

L-3 (sale currency under multi-currency) and L-5 (readonly child views) deliberately deferred per the fix brief. DECISIONS extended with **D-29**. Commerce suite 66 → 78 tests; totals 192 unit.

**Conditions closed — persistence unblocked.**
