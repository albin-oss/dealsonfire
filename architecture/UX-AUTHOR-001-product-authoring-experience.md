# UX-AUTHOR-001 — Product Authoring Experience (Vertical Slice 003, Phase 1)

**Status:** Phase 1 UX package. No visual design, no code. Awaiting approval.
**Bindings:** UX-BIBLE-001, DESIGN-SYSTEM-001, PDS-001 (Calm, Opportunity First), ADR-002 + Catalog Capability (frozen — the aggregate, invariants I1–I11, and API are reused, never recreated), UX-WORKSPACE-001. Ignite + Workspace are **frozen**.
**Emotional target:** *"I can't believe adding a product was that simple."* **Hard target: publishable in under two minutes.**
**Ground truth:** `/products` is a 7-line coming-soon stub — this is real greenfield UI over a complete backend (create/update/lifecycle/variants/options/media APIs, attribute sets, brand refs). One honest constraint: product **photos** require the Media capability (C9, not landed) — designed-in below, deferred without pretending.

---

## 1. Every field, challenged (the decision map)

The Catalog API accepts ten things. The merchant *needs* to decide **two**:

| Field | Verdict | Why |
|---|---|---|
| **Title** | ✅ ask (field 1) | Only the merchant knows what it is |
| **Price** | ✅ ask (field 2) | Money is a merchant decision, constitutionally (ADR-002 §8) |
| Fulfillment kind | 🔀 **inferred** | From the business's onboarding `sell_types` + title reading (Ignite's `readIdea` pattern); shown as a changeable chip, never a form control |
| Description | 🔀 **postponed + drafted** | AI drafts from the title (advisory); optional inline edit; a product publishes fine without one |
| Category | 🔀 **suggested, deferrable** | AI proposes; accept/ignore in one tap; opaque `CategoryReference` (taxonomy is O2-1) |
| Options/Variants | 🔀 **on-demand only** | The 80% product has none. One quiet affordance — "It comes in sizes or colors" — expands the option builder; otherwise a single implicit variant (the aggregate already guarantees ≥1) |
| Photos | 🔀 **designed-in, C9-gated** | The photo slot is present and inviting ("your photo here" — same promise as the preview) but upload arrives with Media; no dead-end button |
| Inventory tracking | 🔀 **defaulted** | `untracked` — tracking is Inventory's (CS2) moment, not authoring's |
| SKU | 🔀 **generated silently** | "Grandma has no SKUs" — already the system's rule (I4) |
| Brand / attributes | 🔀 **postponed** | Attribute sets (PROMPT-016) surface in *edit*, when a set exists — never during first authoring |

**Score: 2 typed fields, ~3 decisions (title, price, publish), 0 screens of settings.** Shopify's default form asks for ~14 decisions before publish.

## 2. Three concepts, critiqued

| | **A — Conversational Authoring** (chat: "What are you selling?" → Q&A) | **B — Visual Canvas** (start from the product card as it will appear; edit-in-place) | **C — Adaptive Form** (one smart line that grows only what's needed) |
|---|---|---|---|
| First product | Delightful — mirrors Ignite | Strong — WYSIWYG confidence | Fast, calm |
| **Tenth product** | **Fails** — conversation doesn't scale for a repeated task; typing "next question" 10× is a queue, not a chat | Good | **Excellent** — muscle memory, "add another" loop |
| Two-minute target | At risk (turn-taking overhead) | Met | **Met with margin (~40s typical)** |
| Grandma Test | Passes | Passes if editing-in-place is discoverable (it often isn't) | Passes — one visible line, one visible button |
| Mobile | Good | Weak — in-place editing on small screens is fiddly | Good — single column, keyboard-first |
| Invisible Complexity | Good | Risk: the canvas *invites* fiddling with looks over substance | **Best — the form literally doesn't show what wasn't needed** |
| Engineering | Medium (new chat machinery) | High (in-place editing framework) | **Low — composes existing DS fields + Ignite's inference pattern** |

**Recommended: C — the Adaptive Form, opened with A's move.** The first thing on screen is a single conversational line — *"What are you selling?"* with a combined smart field (`Lavender baby blanket, 45` parses title + price) — so the *feel* is A's, but the mechanics are a form that grows adaptively: inferred chips appear beneath (kind · suggested category · drafted description) as quiet, tappable proposals; the variant builder exists only behind "It comes in sizes or colors." B's soul is kept as the **live product-card preview beside the field** (the Ignite pattern — you author *into* the thing buyers will see). A pure A fails the repeat case; a pure B fails mobile and invites fiddling.

## 3. User journey & screen flow
```
/products (grid)                    THE COMPOSER (one surface, not a wizard)
┌──────────────────────┐      ┌───────────────────────────────────────────┐
│ [+ Add a product] ───┼──►   │ "What are you selling?"                    │
│ grid of cards        │      │ [ Lavender baby blanket, 45          ] ◄──┼── one smart line
│ (empty state teaches │      │  inferred, tappable, all optional:        │
│  on first visit)     │      │  ⬡ physical · ⬡ category: Baby › Blankets │
└──────────────────────┘      │  ⬡ “Soft, hand-knitted…” (draft) ✎        │
                              │  ▸ It comes in sizes or colors            │
        publish ──────────────│  [ Put it on the shelf ]  [ Save draft ]  │
   grid + toast ◄─────────────│        live card preview (right/below)    │
   "add another" keeps        └───────────────────────────────────────────┘
   the composer open
```
- **Publish** = create (+activate when the price makes it shelf-worthy — the existing rule). The toast offers **Add another** (the repeat loop) and **See it on your store** (`/s/:handle` — Opportunity First).
- **Draft** = create without publish pressure; drafts appear in the grid with an honest badge.
- The grid is the existing keyset-paginated list API; first visit shows the teaching empty state with the composer as its single CTA.

## 4. States
**Errors:** inline, educating, field-scoped (RFC 9457 → `DofProblem` only for transport failures); a validation miss never clears the field. **Recovery:** the composer autosaves locally per keystroke (the Ignite draft pattern) — navigation away and back restores; a failed publish keeps everything and offers retry. **Loading:** publish is optimistic-feeling (button holds pressed, ≤300ms budget); the grid uses skeletons. **Empty:** the grid's first-visit state *is* the invitation.

## 5. Mobile
Single column; the smart line auto-focuses with the appropriate keyboard; price extraction means no separate numeric field in the common case (a dedicated `DofMoneyInput` appears only if no price was typed); the preview card collapses to a peek above the publish button; publish is bottom-fixed, thumb-reach, safe-area aware.

## 6. Accessibility
The smart line is a labelled textbox with its parse echoed in an `aria-live` hint ("Title: Lavender baby blanket · Price: €45"); inferred chips are buttons with pressed state; the variant disclosure is `aria-expanded`; the preview is `role="img"` with a meaningful label; publish result announced. Axe-clean gate extends to `/products`.

## 7. Motion opportunities (tempo bands only)
Chips **arrive** (enter ease, quick) as inference resolves — the form visibly *thinks alongside you*; the preview updates settle-eased; publish success = the card **flies to the grid** (deliberate, reduced-motion → fade) — the product joins the shelf, the same "becoming" language as Ignite's launch, one size smaller. No celebration tempo — that stays unique to Launch.

## 8. AI seams (assist, never control)
One `AuthoringIntelligence` port (the `IgniteIntelligence` pattern): `parseLine` (title/price extraction — rule-based, ships now), `inferKind`, `suggestCategory`, `draftDescription`, `suggestTags/SEO` (port seats; fill with real providers later). Every output is a **tappable proposal with provenance** — nothing applies itself; ignoring every suggestion still publishes in two fields.

## 9. Deferred, honestly
Photos (C9 Media — the slot is designed, the pipeline isn't), attribute-set application (edit-mode, when a set exists), bulk/CSV (the Ignite import door already owns bring-your-catalog), pricing guidance (needs market data — port seat reserved).

---
**Phase 1 complete. STOPPING for approval.**
Approval question: proceed to Phase 2 (visual design) with **Concept C + A's conversational opener + B's live preview** and the §1 decision budget (2 fields, 3 decisions) — or adjust the balance (e.g., you want photos to block on C9 rather than ship text-first)?
