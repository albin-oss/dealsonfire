# UX-IGNITE-002 — Ignite Visual Experience Package (Phase 2)

**Status:** Phase 2 deliverable. The permanent design reference for Ignite. Awaiting approval before UI code.
**Bindings:** UX-IGNITE-001 (approved Phase 1), UX-BIBLE-001, DESIGN-SYSTEM-001, PDS-001 (Calm by Default), ADR-005.
**Grounding rule:** every token, duration, ease, type role, and component named here **exists in the shipped design system**. This package specifies compositions of real vocabulary — nothing is invented that Phase 3 can't build. The emotional success metric: *"I can't believe I just created a real business that quickly."*

---

## A. The design idea (one sentence)

**The store is born on screen while you talk.** From the Mirror onward, a live storefront preview is always present — first as a small companion, finally as the thing itself. Ignite's visual language is a *conversation beside a becoming-store*, not a wizard in front of a form. Every other decision in this package serves that idea.

## B. UX Package

### 1. Information hierarchy (per beat)
One question owns each screen. Hierarchy is always: **the question (headline) → the answer surface (the single interactive region) → quiet context (caption) → navigation (bottom, consistent position)**. Nothing competes with the answer surface; progress lives in the header as a whispered step word ("· the mirror"), never a numbered bar shouting "6 steps of work."

### 2. Screen compositions (mobile-first, one column)
- **Welcome:** display-role promise line ("Let's open your store"), one caption of honesty ("about four minutes"), primary ember CTA, the Import Door as a quiet secondary card. 60% whitespace — the calm before.
- **Idea:** headline question; a single generous `DofTextarea`-style field (auto-focus, no label chrome); starter chips *below* the field (assist, don't pre-empt). Nothing else.
- **Mirror:** headline ("Which one feels like you?"); three identity cards in a radiogroup — each card = name (title role), handle (caption, `dof.dev/…`), and its palette *applied to the card itself* (the D-34 token cascade: the card wears its own brand). Compact `StorefrontPreview` appears under the chosen card — **the store's first heartbeat**.
- **First-thing:** headline; title + `DofMoneyInput` price, or the imported-products echo. Preview persists, now showing the product.
- **Reveal:** the composition inverts — **preview becomes primary** (full-width `StorefrontPreview`), the "what DOF set up" list sits beside/below it with the Advanced disclosure folded. The user reviews a *store*, not a summary table.
- **Launch:** see §F.

Desktop (`regular:` breakpoint): the same single column, max-w-2xl, with the preview docking to a right rail from Mirror onward (grid `1fr 320px`) — richer, never busier.

### 3. Component hierarchy & 17. reuse strategy
Everything from `@ds/index`: `DofText` (role scale), `DofCard`, `DofButton` (ember = Ignite's tone, used *only* for the primary action per screen), `DofChip`, `DofMoneyInput`, `DofProblem`, `DofSkeleton`, `DofDivider`, `useJourney`, the motion module. **One new shared component earns permanence: `DofHandleBadge`** — handle text + live availability state (checking → available ✓ / taken + suggestions), reused later by Store Settings and marketplace handle changes. Nothing else new; the Launch sequence is a composition, not a component.

### 4–5. Responsive & mobile-first
Thumb-reachable primary CTA (bottom-fixed on mobile); 44px minimum targets; the Mirror's three cards stack vertically on mobile with the palette stripe on the card edge (scan cost stays low); preview is collapsible-but-default-open on small screens (the heartbeat must not disappear on the device most Grandmas hold).

### 18. Progressive disclosure
The Advanced fold on Reveal is the *only* disclosure — everything else was already inferred. Disclosure copy names what's inside ("shipping starting point, category — all changeable"), so opening it is curiosity, not anxiety.

## C. Motion Specification

The Bible's four tempo bands are the *entire* motion vocabulary — and their scarcity is the premium feel:
| Tempo | Token | Ignite usage |
|---|---|---|
| instant 100ms | `--dof-ref-duration-instant` | chip/radio selection, availability dot state |
| quick 200ms | `quick` + `ease-enter/exit` | beat transitions: outgoing fades down 8px (exit ease), incoming rises 8px (enter ease) — the conversation advances, never slides like a carousel |
| deliberate 400ms | `deliberate` + `ease-settle` | the Mirror moment: chosen card settles forward (scale 1.02→1, shadow raised→spotlight) while siblings recede to 60% opacity; the preview's first appearance rises with this tempo |
| celebration 1100ms | `celebration` | **used exactly once in the product: the Launch reveal (§F)**. Scarcity is what makes it felt. |

**Micro-interactions (7):** availability dot pulses once (instant) on state change, with the state also in text — never color-only. Starter chips fill the field with a quick crossfade, cursor at end (inviting edit, not accepting a default). Price input formats on blur via `DofMoney` rules. Launch button holds a subtle pressed state through the narrated sequence — the button *stays held* while DOF works, a physical metaphor for "we've got it."
**Reduced motion (8):** every sequence gates on `useReducedMotion()` — transitions become opacity-only crossfades at instant tempo; the Launch reveal becomes a dignified fade-through; narration text (aria-live) carries the full experience without movement. Motion is garnish, never information.

## D. Visual language

**12. Rhythm:** an 8px baseline with *breathing sections* — gap-4 within an answer surface, gap-6 between question/answer/context. Whitespace increases toward Launch (the journey literally opens up).
**13. Typography:** `display` (welcome promise + launch moment only) → `headline` (each beat's question) → `title` (identity names) → `body` → `caption` (context/handles). Two font weights; hierarchy through the existing role scale, never ad-hoc sizes.
**14. Color:** neutral surfaces carry the journey; **ember** (`oklch(63% .185 40)`) is Ignite's signature and appears only on the primary action + the step word — one warm thread through a calm room. The *merchant's chosen palette* colors only the preview/identity cards (their brand, not ours). Critical/success tones per system.
**15. Elevation & spacing:** flat page; `shadow-raised` for cards; `shadow-spotlight` reserved for the chosen identity and the Reveal preview — elevation tells you what matters now. Radii: `radius-large` for cards, `medium` for fields.
**16. Consistency rules:** one ember CTA per screen · questions in headline role · all copy through the i18n catalog · no raw values (token gate enforces) · every interactive element keyboard-first with visible focus (existing DS focus ring).

## E. States (9–11)

**Empty:** the idea field's emptiness is *designed* — placeholder is a question, chips are exits from blankness. **Errors (10):** inline `blockedReason` with `aria-live`, educating copy already written; launch failure = the pause card ("We paused at the brand step — nothing is lost") with a single Retry that resumes mid-sequence. **Loading (11):** beat transitions need none (local state); the launch sequence *is* the loading state, redesigned as narration (§F); import parsing shows `DofSkeleton` rows in the preview — the store fills in as the file parses.

## F. The Launch Experience (20)

Not a success screen — **the reveal of a real thing.** Sequence, on pressing "Open my store":

1. **The held moment (0–2s+):** the journey chrome quietly recedes (quick fade). The preview card remains — alone, centered. Below it, the launch narration replaces buttons: five short lines appearing one by one as the kernel steps complete (*"Registering your business…" → "Claiming dof.dev/rosas-knits…" → "Hanging your brand…" → "Placing your first product…" → "Opening the doors…"*). Each line resolves to a quiet ✓ (instant tempo). This is honest progress — the real transactional steps, narrated — and it builds the drum-roll no spinner can.
2. **The becoming (1100ms, the only celebration in DOF):** on `publish` success, the compact preview **grows into the store** — scales from companion-card to full-bleed storefront (settle ease), its palette blooming from the card into the page background, while the ember step-word crossfades to the merchant's brand color. The store doesn't *appear*; the thing they watched being born **arrives**.
3. **The address (after settle):** the URL types itself beneath — `dof.dev/rosas-knits` — in title role, with one action: **"Visit your store"** (→ the public storefront, Phase 3's build item). Copy above, display role, earned and calm: **"You're open."**
4. **The floor beneath (Opportunity First):** two quiet next-step cards fade in below the fold — "Add your next product" / "See your workspace" — no urgency, no confetti, no modal. The user leaves when *they're* done looking at their store.

Reduced-motion: steps 1–4 as sequential fades; the narration and "You're open." carry the emotion in words. Failure at any narrated step swaps to the pause card without theatrical rollback — calm even when pausing.

**Why this works:** the celebration isn't decoration added *on top* of the product — it **is** the product (the store, becoming real). That's the memorable-without-gimmicks answer, and it's unique to DOF because only DOF has the always-present becoming-store to pay it off.

## G. Accessibility decisions (8)

WCAG 2.2 AA throughout: Mirror = real `radiogroup` (arrow keys move, palette differences never the only differentiator — names/handles differ); availability announced via text + `aria-live`; launch narration is an `aria-live="polite"` log (screen-reader users get the *same* drama, in words); focus moves to the beat's question heading on transition; bottom-fixed CTA respects safe-area insets; contrast verified on merchant palettes via existing high-contrast machinery.

---

## H. Self-review (Apple HIG / Shopify design org lens) — and refinements applied

1. *"Your celebration depends on the preview having stayed visible on mobile — if users collapse it, the payoff orphan-appears."* **Refined:** on mobile, the preview auto-reopens (quick tempo) at Reveal regardless of collapsed state; the Launch sequence never begins from a collapsed preview.
2. *"Typing-URL animations read as gimmick under HIG scrutiny."* **Held, with a constraint:** it's 400ms deliberate (not a slow typewriter), reduced-motion replaces it, and the URL is the single most functional artifact of the journey — animating *the address* is meaning, not decoration. Constraint added: never re-animates on revisit.
3. *"Ember on both CTA and step word risks two warm anchors."* **Refined:** step word drops to muted ink; ember is the CTA alone. One anchor.
4. *"Narrated launch could feel slow if the kernel finishes in 800ms."* **Refined:** narration lines have a 350ms minimum cadence but *coalesce* when steps complete faster (lines already-done appear pre-checked) — honesty first, drama second, never artificial delay.
5. *"Where's the failure rehearsal?"* Already designed (pause card, mid-sequence retry) — promoted into the motion spec so the retry *resumes* the narration rather than restarting it (no repeated ✓s; continuity of trust).
No further improvements found that don't trade calm for spectacle.

---

**Phase 2 complete. STOPPING for approval before UI code, per the prompt.**
Scope reminder for Phase 3 (unchanged from approved Phase 1): public storefront `/s/:handle` (the "Visit your store" destination), handle-availability UI (`DofHandleBadge`), the Launch sequence per §F, a11y/perf verification. **No new design tokens required** — the package deliberately composes the frozen token set; the one DS addition is `DofHandleBadge`.
