# UX-AUTHOR-002 — Product Authoring Visual Experience Package (Phase 2)

**Status:** Phase 2 deliverable. No UI code. Awaiting approval for Phase 3.
**Bindings:** UX-AUTHOR-001 (approved: Adaptive Form + conversational opener + live preview, 2-field budget), UX-IGNITE-002 (the motion/typography language), DESIGN-SYSTEM-001, ADR-002/Catalog (frozen).
**Reframe (per approval):** this is not "creating a product" — it is **helping a merchant become confident enough to publish**. Every visual decision below optimizes for confidence: the merchant should *see* the product becoming real and *understand* why it's ready.

---

## A. The design idea
**The composer is a mirror, not a form.** The left half is one conversational line and a few quiet proposals; the right half is the product card exactly as buyers will see it, updating live. Confidence comes from watching the *real thing* assemble — the same "becoming" language as Ignite, one register quieter.

## B. Screen composition (desktop → mobile)
```
┌── /products — the Composer ────────────────────────────────────────┐
│  "What are you selling?"                                            │
│  [ Lavender baby blanket, 45                    ]   ┌────────────┐  │
│  parse echo: Title · Price €45 (aria-live)          │  LIVE CARD │  │
│                                                     │  (as buyers│  │
│  ⬡ physical  ⬡ Baby › Blankets  ⬡ draft desc ✎      │   see it)  │  │
│  [photo slot — DofMediaSlot]                        └────────────┘  │
│  ▸ It comes in sizes or colors                                      │
│                                                                     │
│  READY TO PUBLISH (DofReadinessSummary)                             │
│   ✓ Title — buyers know what it is                                  │
│   ✓ Price — they know what it costs                                 │
│   ✓ Category — helps people find it                                 │
│   ○ Photo — products with photos sell better; add anytime           │
│                                                                     │
│  [ Put it on the shelf ]        [ Save for later ]                  │
└─────────────────────────────────────────────────────────────────────┘
```
Mobile: single column — line → chips → photo slot → collapsed preview peek → readiness → bottom-fixed publish. The preview expands on tap; the readiness summary sits directly above the publish button (confidence at the moment of commitment).

## C. Component hierarchy (permanent DS additions: **two**)
1. **`DofReadinessSummary`** — the confidence indicator. Grammar enforced by the API: items are `{ label, why, state: 'secured' | 'invited' }`. **No percent, no progress bar, no count, no red** — secured facts get a quiet ✓ + why; invitations get an open ○ + an honest reason ("products with photos sell better") and never block. Reused next by Store publish readiness and, later, Listing readiness — this component becomes DOF's universal "am I ready?" voice.
2. **`DofMediaSlot`** — the photo drop/pick slot: inviting empty state, upload progress, thumbnail, remove. Speaks only to the **Media Port** (§D). Reused by brand kit, Sparks, anywhere media lands.
Everything else composes existing pieces: `DofInput` (smart line, with suffix parse hint), `DofChip` (proposals — pressed = accepted), `DofMoneyInput` (appears only when no price was typed inline), the Ignite option/variant pattern behind the disclosure, `DofButton`, `DofSkeleton`, the product card preview (a sibling of `StorefrontPreview`'s card, storefront-scoped tokens).

## D. The Media Port — a seam, not a hack
```
app (DofMediaSlot) ──► POST /api/v1/media  ──► MediaPort (interface, platform-level)
                                                 │ store(upload) → { mediaId, url }
                                                 │ resolve(mediaId) → url
                                    ┌────────────┴───────────────┐
                              VercelBlobAdapter            (future) C9 Media capability
                              + media_assets registry       richer pipeline: transforms,
                              (id, business_id, url,        rights, DAM — SAME PORT
                               content_type, created_at)
```
- **Port lives at the platform level** (like `Clock`/`TokenHasher`): media is cross-capability by nature; no domain owns the port.
- **`media_assets` registry table** (one migration, manifested): the durable `media_id → url` fact — so `product_media.media_id` (already in the schema, by contract) finally resolves. The registry is the *permanent* part; the storage adapter is the swappable part.
- **VercelBlobAdapter** is production-safe day one: direct-to-Blob upload (signed, size/type-limited, business-scoped path), public CDN URL back, audited create. When C9 arrives it *implements the same port* — Product Authoring never changes. No temporary hacks: the port, registry, contract, and tests are all permanent; only the adapter is replaceable, and that's the design.
- Constraints stated now: images only (jpeg/png/webp), ≤10MB, ≤50 per product (existing I11); alt text field on the slot (a11y is not optional).

## E. Product Readiness model (confidence, not completeness)
Pure function `productReadiness(draft) → ReadinessItem[]` (same idiom as the companion engine):
- **Secured** (✓, with why): title · price · category-when-accepted · photo-when-added.
- **Invited** (○, honest reason, never blocking): photo ("products with photos sell better — add anytime"), description ("a sentence helps buyers fall for it").
- **Laws:** publishable = title + price (the API's own bar) — the summary never gates beyond the domain's truth; no urgency language; no counts ("3 of 5"); invitations cap at **two** (more is a checklist); items never reorder.

## F. Motion specification (tempo bands only)
Parse echo updates instantly (text, no animation). Proposal chips **arrive** (enter-ease, quick, 40ms stagger) as inference resolves — the form thinks alongside you. Preview updates settle (deliberate) — the product breathes, doesn't flicker. Readiness ✓ transitions ○→✓ with a quick tick draw (reduced-motion: swap). Publish: the button holds pressed; on success the card **flies to the grid** (deliberate; reduced-motion: fade) + toast with *Add another* / *See it on your store*. **No celebration tempo** — reserved for Launch, forever.

## G. Responsive behavior
One column under `regular`; preview = tappable peek (sticky, 64px) above the publish bar; photo slot full-width targets ≥44px; the option builder becomes a sheet on mobile (matches DS overflow idiom); keyboard: numeric pad only when the dedicated money field materializes.

## H. Accessibility review
Smart line: labelled textbox; parse echoed via `aria-live="polite"` ("Title… · Price €45"). Chips: toggle buttons with `aria-pressed`, text prefixes ("Category:") so meaning survives without color. Media slot: real `<input type=file>` under the hood, alt-text prompt on add, upload progress announced. Readiness: a list, ✓/○ conveyed in text ("added"/"optional"), not glyph-only. Disclosure: `aria-expanded`. Publish result announced; focus moves to the toast's first action. Axe gate extends to `/products` (already the suite's pattern).

---

## I. Product Critique — cognitive load, not features

Estimates for a **first-time merchant publishing their first product** (typical paths, honest ranges):

| | Decisions | Typed fields | Context switches | Time to first published product |
|---|---|---|---|---|
| **DOF (this design)** | **3** (what · price · publish) | **1–2** (one line; +money field if no inline price) | **0** (one surface; preview is the same surface) | **~40–90s** |
| Shopify | ~12–15 (title, desc, media, category, price, compare-at, tax, inventory, SKU, shipping weight, variants?, status, sales channels) | ~8 | 3–5 (sections/tabs, settings detours) | ~5–8 min |
| Etsy | ~13+ (mandatory category, 13-photo pressure, attributes, renewal, production partner, shipping profile) | ~7 | 2–4 | ~10–15 min |
| Square | ~6–8 | ~5 | 1–2 | ~3–4 min |
| WooCommerce | ~20+ (WP admin, metaboxes, product data tabs, plugin detours) | ~10 | 5+ | ~10+ min |

**Where DOF is materially better:** the decision budget (2 fields vs 7–10 everywhere else); zero context switches (authoring *into* the buyer's card); inference with provenance instead of blank fields; the readiness voice that builds confidence instead of a form that implies debt; the repeat loop ("Add another") that makes product #10 *faster* than product #1.

**Where DOF is still honestly weaker:** no rich description editor (Shopify's is genuinely good — ours is a drafted sentence + plain edit); no variant *matrix* UI (our on-demand builder covers axes, not per-cell price/SKU editing at Shopify's depth); single-photo-first media (no gallery management, cropping, or reorder at Etsy's level); shallow category taxonomy (O2-1 still open — suggestions are only as good as the tree); no compare-at/sale price at authoring (Offers own that later, correctly — but Shopify merchants will look for it); no bulk editing. None of these block the *first-product* promise; all are tracked seams.

**Recommendation: BEGIN PHASE 3.** The differentiating claim survives the critique — the weaknesses are depth features for later slices, while the strength (confidence in under two minutes, zero context switches) is structural and buildable now on frozen APIs. Phase 3 scope: the Composer, the two DS components, the Media Port + Blob adapter + registry migration, the readiness engine, tests, and the verification passes.

---
**Phase 2 complete. STOPPING for approval before implementation.**
