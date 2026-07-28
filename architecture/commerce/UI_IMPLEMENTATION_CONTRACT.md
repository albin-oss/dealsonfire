# DOF — UI_IMPLEMENTATION_CONTRACT

**Status:** BINDING on every increment C3–C12 · v1.0 · 2026-07-27
**Nature:** constitutional. This document composes the frozen corpus (DESIGN-SYSTEM-001, UX-BIBLE, the approved Buyer/Merchant experience sets, the token gates) into implementation law. It invents nothing; it makes drift impossible. Where an existing law is cited, the citation IS the rule — this contract adds only the commerce-specific bindings.
**Enforcement:** the existing gates (check:tokens, DS lint, axe/e2e suites) plus the increment checklist in §7. A PR that violates a numbered rule here does not merge.

---

## 1. Page rhythm

**R1.1 — Three widths, no others.** `max-w-2xl` (narrow: focused acts — checkout, a deal page, the letter) · `max-w-3xl` (standard: workspace pages, cart, order timeline) · `max-w-4xl` (wide: grids — shelf, street, products). Chosen per page's *task*, never per taste.
**R1.2 — Vertical cadence.** Page padding `px-4 py-8` (public `py-10`); section gap `gap-6` workspace / `gap-8`–`gap-10` public; intra-section `gap-2`–`gap-4`. No margins for layout — flex/grid gaps only (established idiom).
**R1.3 — One h1.** Every page has exactly one h1 (PageHeader in workspace; role="headline"/"title" as h1 on public pages); headings descend without skips (axe-enforced).
**R1.4 — Reading flow is single-column.** Two-column layouts only where one column is a *mirror* (store identity editor) or a *summary rail* (checkout review at `regular:` width). Mobile always collapses to the reading order that makes sense read aloud.
**R1.5 — Pages end with a door.** No dead-end pages: every public page ends with one onward link (street/shop); every workspace page ends within the shell's nav. (Aliveness law, made binding.)
**R1.6 — Density scales by count, not redesign.** Lists paginate by keyset "Show more" (established idiom) at 48/page public, 24 workspace; at 1M products nothing about the page *changes* except the number of fetches. No infinite scroll (the caught-up moment is product law); no virtualization until real catalogs demand it (roadmap).

## 2. Interaction rhythm

**R2.1 — Buttons.** DofButton only; one accent-tone primary per view region; destructive = two-tap armed idiom (useArmedAction — never window.confirm, never a dialog for single-object deletion); irreversible-and-large (place order) = explicit full-width primary with the consequence named above it.
**R2.2 — Mutation classes.** Toggles → optimistic-with-reconcile (DealEngage pattern: flip now, converge to server answer, roll back + announce on failure). Idempotent sets → absolute values by natural key (cart pattern). Sagas (checkout) → **never optimistic**: real states rendered honestly (`reserving → authorizing → placing`), one attempt key, resumable.
**R2.3 — Saving.** Editors use the SaveState idiom (`idle|saving|saved|failed`) with per-row Save/"Saved ✓" where rows save independently; whole-form saves disable the button while `saving` and announce outcomes.
**R2.4 — Loading.** Skeletons only on cold loads and only shaped like the content they replace; stale-while-revalidate keeps content during refetch (`opacity-60` transition, home pattern). Never spinners-as-pages; button-level `loading` only where the wait is the button's own promise and the interaction is not optimistic.
**R2.5 — Failure.** Every failure surface: names what happened specifically · states what was NOT lost ("nothing was charged; your cart is exactly as you left it") · offers the retry in place · never blames ("that didn't take" — never "invalid input"). DofProblem for blocks, announce() for transients.
**R2.6 — Success.** A fact plus its consequence ("Saved — live on your store"), announced to screen readers, never a modal. Ceremony is reserved for Moment-Ledger events only (once-ever, dismissible).
**R2.7 — Waiting.** Anything asynchronous names the next real event and its expected timing (narrated waiting: "usually ships in 2–4 days", "payout scheduled Friday"). Silence with a clock beats spinners without one.
**R2.8 — Motion.** Tempo tokens only; page crossfade + press-settle are the only ambient motions; reduced-motion parity absolute (token-layer floor). New commerce screens add zero new animation classes.
**R2.9 — Focus & keyboard.** Every interactive element shows the focus ring (`focus-visible:focus-ring` or wrapper `focus-within`, e2e-guarded); combobox/listbox patterns follow StreetSearch's ARIA shape; Escape closes, Tab order follows reading order.

## 3. Commerce-specific laws (reusable, never page-specific)

**R3.1 — Money.** DofMoney everywhere; integer minor units end-to-end; floats constitutionally banned. Totals compose visibly: subtotal → shipping → tax → total, each labeled in words, no math the buyer must do. Fees/holds merchant-side use the same component (one money voice).
**R3.2 — The promise date is a promise.** Rendered in merchant voice with a real date ("Rosa promises to ship by Thu, Aug 6") — never "ETA", never carrier jargon. Case-history ranges ("usually ships in 2–4 days") appear only past their evidence threshold (confidence system registry).
**R3.3 — Orders render as promises in progress.** Both sides. Merchant: "the Lavender Blanket, for Thursday" — parcels and promise dates, never a status table (THE_DOF_WORKSHOP §2 verdict, binding). Buyer: the timeline is a story read top-down, oldest → newest, ending at the current state; each entry = plain-language fact + DofTime; consumed facts cite their moment, never their event id.
**R3.4 — Status vocabulary.** One shared map, used verbatim on both sides: `placed → confirmed → being made/getting ready → on its way → delivered → complete`, with `payment pending / payment failed / cancelled / returned` as honest exceptions. Status renders as dot + words (`● On its way`), tone from status tokens (platform-owned colors, never brand); no pill rainbows, no percent bars.
**R3.5 — The keystone.** One sentence, versioned platform copy (legal-gated at C4), rendered by ONE component at three sites only: product page under actions, cart section footer, checkout beside pay. Stores never restyle it (trust dress-code).
**R3.6 — Checkout shape.** Single column, `max-w-2xl`, steps visible as a quiet progression (contact → delivery → review → pay), each step's summary editable-in-place after completion. NO upsells, NO account wall, NO coupon-field-first (code entry is a quiet link). Payment fields are Stripe-hosted elements inside a DofCard — never restyled to hide their provenance.
**R3.7 — Addresses.** One AddressFields component (C3): autocomplete-friendly, minimal required set, country-aware labels, never split into modal steps; renders back as two calm lines, never a form-echo.
**R3.8 — Refunds/returns surfaces.** Money-back statements always pair amount + destination + timing fact ("€45.00 back to your card — usually 3–5 business days"); merchant decision cards show consequence math BEFORE the decision (frozen ops UX law).
**R3.9 — Notifications (C7 seam).** Three classes (money-and-promises now; milestones batched; everything else waits) — binding on any surface that sends anything, email included. Every email is the letter idiom: one fact, one next event, one door.
**R3.10 — The presence line.** One component (`followers · liveness`, stale-falls-back-to-opened) rendered identically at: product page, cart store sections, checkout header, order timeline header. It is the merchant's face in commerce chrome; it never carries platform status.

## 4. Component laws

**R4.1 — Cards.** Public commerce card = `rounded-large border border-foreground/10 bg-foreground/[0.02]` (interactive: `dof-interactive` + `hover:border-foreground/25`); workspace card = DofCard/`border-line bg-surface-raised`. No third idiom may be introduced.
**R4.2 — Lists over tables.** Commerce data renders as lists of things (image + words + one fact right-aligned). Tables are permitted ONLY for admin/finance surfaces (ledger views) — never merchant- or buyer-facing.
**R4.3 — Timelines.** One OrderTimeline component (C3+): entries = icon + sentence + DofTime, oldest→newest, current state emphasized, positive tone reserved for delivery/completion (the one celebratory color, SM-4).
**R4.4 — Dialogs/sheets.** Dialogs only for step-up auth and irrecoverable cross-context interrupts; commerce flows never open modals for forms (inline expansion or dedicated page). Sheets: not in the vocabulary — don't introduce them.
**R4.5 — Empty states.** DofEmptyState with `heading-as` discipline; every commerce empty state teaches what the space becomes and offers its one door (established law).
**R4.6 — Skeletons.** Shape-matched, `aria-hidden`, count ≤ 3, only on cold loads (R2.4).
**R4.7 — Images.** PublicImg everywhere buyer-facing (branded placeholder on failure; `eager` only for LCP heroes). Parcel/timeline photos ride the same component.
**R4.8 — Time.** DofTime for every timestamp, relative mode ≤ 7 days, date mode beyond (one clock, both sides of the counter).
**R4.9 — Price presentation.** Price near title, bold weight, never colored for emphasis, sale price = current price + quiet "was" (no red slashes); per-line totals right-aligned baseline.
**R4.10 — Forms.** DofInput/DofTextarea with label + hint always (no placeholder-as-label); validation inline on blur, never on keystroke; error text names the fix. Drafts persist by the everything-survives law where a form outlives a session.

## 5. Copy laws (rules, not copy)

**R5.1 — Sentence shape.** One clause preferred, two maximum; ≤ 16 words for UI chrome; reading level ≈ a friendly postcard. Contractions welcome. No exclamation marks except inside a merchant's own words.
**R5.2 — Vocabulary.** The frozen two-sided lexicon binds every string: street-side (maker, shop, promise, "on its way to being yours") and workshop-side (shelf, bench, parcel, people). The banned lists (SKU, ETA, vendor, inventory, pipeline, processing, dashboard…) are lintable: a `check:copy` greplist ships with C3 and grows with each increment.
**R5.3 — Numbers.** Counts with visible denominators for evidence ("41 of 43"); no percentages on trust surfaces; thresholds hide sparse evidence (registry). Quantities in words below five where rhythm allows ("two parcels to pack").
**R5.4 — Money in prose.** Always the formatted amount, never rounded prose ("€45.00", not "about €45"); merchant-side entitlements always name their state in plain words ("yours when it ships").
**R5.5 — Dates in prose.** Weekday + date for promises ("by Thu, Aug 6"); relative for history ≤ 7 days; never ISO strings user-facing.
**R5.6 — Errors.** Structure: what happened → what was not lost → the way forward. Never blame, never jargon, never error codes user-facing (correlation ids live behind a "details" disclosure for support).
**R5.7 — Waiting/delay copy.** Always names the next event + expected timing; delay disclosures lead with the new truth, then the recourse ("It'll be later than promised — here's the new date, and cancelling is one tap if that doesn't work").
**R5.8 — Payment/legal statements.** The keystone and all legal-adjacent sentences are versioned platform copy (single source, one component each); increments may not paraphrase them locally. AI never authors any buyer-facing sentence (frozen R-class law).
**R5.9 — Success copy.** Fact + consequence, merchant-subject wherever true ("Rosa has your order" — not "Order received").

## 6. Scale challenge (answered per the brief)

100 merchants: trivially fine. 10,000 merchants: every rule above is per-page O(1) — presence lines and evidence counts come from the read models built for exactly this (keyset everywhere, thresholds cached). 1M products: R1.6 keeps pages constant-size; R4.2's lists paginate; the only rule that would bend is skeleton-count (unchanged) — no rule in this contract has a scale term in it, which is the point: **rhythm is scale-free; only data volume scales, and the architecture already owns that.**

## 7. The increment checklist (every C3–C12 PR carries it)

1. check:tokens / boundaries / data / identity / operations green · 2. axe on new routes · 3. focus-ring e2e on new interactive surfaces · 4. copy greplist clean (R5.2) · 5. the three binding checklists: trust laws (BUYER_CONFIDENCE_SYSTEM), feeling checkpoints (BUYER_EMOTIONAL_JOURNEY), workshop verdicts (THE_DOF_WORKSHOP) · 6. dark + light screenshots, desktop + 375px · 7. Experience Review section in the increment report.

*This contract composes; it does not create. Where it is silent, DESIGN-SYSTEM-001 and the frozen experience corpus speak. Where those are silent, match the nearest existing surface — never invent a third way.*
