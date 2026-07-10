# DOF Platform — DESIGN-SYSTEM-001

# Production Design System — Engineering Specification

**Status:** Accepted (implementation contract for UI-FOUNDATION-001) · **Version:** 1.0 · **Date:** 2026-07-05
**Authors:** CDO / Principal Design Systems Engineer / Principal Frontend Architect / UX Engineering Lead / Accessibility Specialist / Motion Designer / DesignOps Lead (one pen)
**Binding docs (frozen, translated here — never redefined):** Engineering Constitution · Platform Bible · Product Bible · ADR-001 v1.1 … ADR-005 v1.1 · UX-BIBLE-001 v1.1 · AMENDMENT-001 · DECISIONS.md.
**Stack (given):** Nuxt 3 · Vue 3 · TypeScript strict · Tailwind CSS v4 · Nuxt UI · VueUse · Pinia · Zod · Storybook · Playwright · Vitest · Iconify · Vercel.

This is an implementation specification. Where UX-BIBLE-001 says how DOF must *feel*, this document says exactly what UI-FOUNDATION-001 must *build* so that feeling is structurally guaranteed — by tokens, contracts, lint rules, and CI gates rather than by designer vigilance.

---

## 0. Challenges & Structural Decisions (Read First)

**0.1 Nuxt UI is a dependency, not the design system.** We build on Nuxt UI for velocity, but **application code never imports Nuxt UI directly** — every primitive is wrapped as a `Dof*` component owning its API. Rationale: this document must hold for a decade; Nuxt UI's API will not. The wrap boundary is the replaceability seam — swapping or forking a primitive later is an internal change, invisible to every feature. Enforced by lint (§1.4).

**0.2 There is not one theme — there are two theme *scopes*, and discovering this is this document's most important finding.** The Bible's "Merchant as Hero" (UX-BIBLE §11) means the **workspace** wears DOF's fixed voice while every **storefront** wears the merchant's BrandKit at runtime. One design language, one component set, two token *resolution scopes*: `workspace` (static, DOF-authored, light+dark) and `storefront` (BrandKit-driven CSS-variable overrides of the same semantic layer, validated for contrast at BrandKit save time). A component works in both scopes or it doesn't ship (§2.6, gate G-5).

**0.3 The heart of the system is patterns, not components.** Components make screens consistent; **interaction patterns make behavior consistent** — and behavior is where the constitution lives (undo semantics, R-classes, errors-educate, approval-as-signature). Every pattern ships as a **headless composable (the contract) + a blessed composition (the default rendering)**, so features reuse the behavior even when they need a bespoke skin (§3).

**0.4 No published npm package.** The design system is a directory + Nuxt layer inside the monorepo (`app/design-system/`), versioned by contract (CHANGELOG + deprecation policy + codemods), not by registry. Publishing adds release ops, version skew, and dependency ceremony that a modular monolith explicitly avoids; the extraction seam exists if a second consumer ever appears (same doctrine as the platform's extraction seams).

**0.5 Storybook is the acceptance artifact, not documentation garnish.** A component's stories are the *evidence* its quality gates ran against — every state, both theme scopes, dark mode, RTL, reduced motion, loading/error/empty. If a state has no story, the state is untested and the gate fails (§13, §14).

**0.6 Reversibility classes are a UI concept now.** ADR-005's R0–R3 are not backend metadata: they select the interaction pattern (optimistic+undo vs proposal vs signature confirmation). Every mutating pattern **declares its R-class in its TypeScript contract** (§3.1), which makes "Reversible Over Confirmed" mechanically enforceable instead of aspirational.

---

## 1. Design System Architecture

### 1.1 Location & package organization

```
app/design-system/                  # Nuxt layer; the ONLY UI import surface for features
├── tokens/                         # §2 — the deepest contract
│   ├── theme.css                   # Tailwind v4 @theme — primitive + semantic tokens
│   ├── scopes/{workspace,storefront}.css   # scope resolution (§2.6)
│   └── tokens.ts                   # typed token map generated from theme.css (single source: CSS)
├── primitives/                     # L1 — wrapped Nuxt UI + owned basics (DofButton, DofInput…)
├── patterns/                       # L2 — interaction patterns: composables + blessed compositions
│   ├── composables/                # useUndoable, useProposal, useRun, useBulkSelection…
│   └── components/                 # DofUndoToast, DofEmptyState, DofProblem…
├── surfaces/                       # L3 — constitutional compositions
│   ├── ai/  trust/  moments/  commerce/  community/  operations/
├── layouts/                        # §5 — named layout shells (DofFeedLayout, DofRunShell…)
├── icons/                          # curated Iconify subset, bundled offline (§12)
├── motion/                         # motion tokens bridge + <DofMotion> helpers (§7)
├── a11y/                           # focus manager, announcer, roving-tabindex utils (§11)
├── i18n/                           # message catalogs incl. the ignite.* voice namespace (§8)
└── index.ts                        # curated public API — no wildcard barrels (§12)
```

### 1.2 Layer & dependency rules (extends the existing boundary linter)

`tokens ← primitives ← patterns ← surfaces ← app pages/features`. Strictly downward. Additional laws, enforced by extending `scripts/check-boundaries.mjs` (the gate already runs in CI):

- Feature code imports **only** from `design-system` public API and its own feature directory — never `@nuxt/ui`, never another feature's components.
- The design system is **domain-blind**: it never imports `domains/`, `server/`, or `contracts/` — except `contracts/` *types* for the AI/trust surface props (proposal shape, problem shape), which are type-only imports (the published-language exception, mirroring ADR-003 §4).
- Pinia is forbidden inside the design system. Pattern state is local/provide-inject; app stores live with features. (A design system with a store is a second application.)
- No component may reach the network. Data arrives as props/slots; actions leave as events. This keeps every component Storybook-pure and testable.

### 1.3 Naming conventions

- Components: `Dof` prefix, PascalCase (`DofButton`, `DofProposalCard`); files kebab-case (`dof-proposal-card.vue`).
- Props: `variant` (visual role), `size`, `tone` (semantic color role) — always token-enum-typed, never free strings.
- Events: past-tense facts (`@approved`, `@dismissed`, `@undone`) — the event-language discipline (D-29) applied to UI.
- v-model: standard Vue `modelValue`; multi-model uses named models (`v-model:query`).
- Composables: `use` + capability (`useUndoable`, `useCeremony`).
- Tokens: `--dof-{tier}-{category}-{name}` (§2.1).

### 1.4 Ownership, extensibility, deprecation, versioning

- **Ownership:** every component names an owner in its story metadata; unowned components cannot merge (checked by the doc gate).
- **Extensibility:** three sanctioned mechanisms only — slots (composition), token overrides (theming), and building a new L3 surface from L2 patterns. Forking a primitive inside a feature is a boundary-lint failure.
- **Deprecation:** `@deprecated` JSDoc + dev-mode console warning naming the replacement + removal earliest two minor versions later + codemod where mechanical. Nothing disappears silently.
- **Versioning:** semver recorded in `design-system/CHANGELOG.md`; breaking change = major entry + migration notes + codemod. The version is a contract line, not an npm artifact (§0.4).

---

## 2. Design Token Architecture

### 2.1 Three tiers, one source

```
--dof-ref-*   primitive scales   (space-4, duration-quick, radius-2 …)   never used by components
--dof-sys-*   semantic roles     (surface-raised, text-muted, accent …)  the ONLY tier components consume
--dof-cmp-*   component tokens   (button-height-md …)                    defined only when a component needs
                                                                          per-scope variation of a sys token
```

Source of truth is **CSS**: Tailwind v4 `@theme` in `tokens/theme.css` generates both the utility classes and the CSS custom properties; `tokens.ts` is *generated* from it (build step) so TypeScript prop enums, Storybook controls, and tests share the identical set. One definition, three consumers — the contract-first doctrine applied to pixels.

**Nothing hardcodes visual values.** A `check:tokens` CI gate (new script, sibling of `check:boundaries`) fails on: hex/rgb/hsl literals in `.vue`/`.css` outside `tokens/`, Tailwind arbitrary values (`[…]`) using raw units/colors, raw `ms`/`px` durations in transitions, and z-index integers outside the scale.

### 2.2 Categories (architecture, not values)

| Category | Structure | Constitutional hook |
|---|---|---|
| **Typography** | family roles (ui, reading, numeric-tabular) · fluid size scale (clamp-based, ~6 steps + display) · weight roles · line-height paired to size | money/quantities always `numeric-tabular` (UX-BIBLE §4.3) |
| **Spacing** | 4px-base geometric scale; semantic aliases (`stack`, `inline`, `section`) | calm density = spacing discipline (§11 Bible) |
| **Sizing** | control heights (per posture), content measures (`measure-prose`), target minimum | touch target token ≥44px (§11) |
| **Radius** | small/medium/large/full roles | one voice across scopes |
| **Elevation** | **semantic only**: `flat / raised / overlay / spotlight` (shadow+border recipes) | "depth is honest" — elevation means interactivity/focus, never decoration (Bible §11); no numeric shadow scale to abuse |
| **Grid & breakpoints** | postures, not devices: `compact` (~<640) / `regular` (~<1024) / `wide` — plus **container queries as the primary responsive tool** (components adapt to their container, pages to the viewport) | one design language across web/tablet/desktop/future mobile shells |
| **Opacity** | role-based (`disabled`, `overlay-scrim`, `hint`) | no magic numbers |
| **Motion** | durations `instant/quick/deliberate/celebration` + easing roles `settle` (default), `enter`, `exit` — exactly the Bible §6.2 bands | tempo is law, tokens make it unbreakable |
| **Z-index** | named layers: `base/sticky/overlay/toast/ceremony` | one interruption layer max (Bible §15) |
| **A11y tokens** | focus-ring (width/offset/color), target-min, contrast-pair definitions | gates test *tokens*, so fixes are global |

### 2.3 Semantic color roles (no hues defined here)

Roles, each with required contrast pairings: `surface / surface-raised / surface-sunken` · `text / text-muted / text-faint` · `accent` (the one living accent — Bible §11) · `positive / caution / critical / info` · **`ember`** — the fire motif, reserved for heat (deals, launches, moments); and **trust surfaces are constitutionally forbidden from `ember` and `accent`** — trust renders in the calm base voice only (Bible §3.5). That prohibition is a lint rule on `surfaces/trust/*`, not a guideline.

### 2.4 Light & dark

Both modes ship day one for the workspace scope; dark is a full semantic re-resolution (never `invert`, never per-component overrides). Mode is `data-mode="light|dark"` on `<html>`, defaulting to system preference. Every gate screenshot runs both modes (G-5).

### 2.5 Accessibility tokens as first-class

Focus ring, minimum target, and every `text-on-*` contrast pair are tokens with **CI-verified WCAG AA contrast** (a token-level test, so the entire system inherits compliance — components cannot individually fail what tokens guarantee).

### 2.6 The two theme scopes (§0.2)

`workspace` scope: static resolution of sys tokens, DOF-authored. `storefront` scope: sys tokens re-resolved from **BrandKit** (palette, type, radius voice) via runtime CSS variables — same roles, merchant values. Contract: BrandKit values are contrast-validated **at save time** (the merchant domain already owns BrandKit; validation joins its command path as a UI-foundation requirement), so storefront rendering never needs runtime contrast fallbacks. Components consume sys roles and therefore work in both scopes by construction.

---

## 3. Interaction Patterns (the heart)

### 3.1 The pattern contract

Every pattern is: **a typed headless composable** (state machine + a11y wiring + telemetry hooks) **+ a blessed composition** (default component). Every *mutating* pattern's TypeScript contract declares `rClass: 'R0'|'R1'|'R2'|'R3'` and the composable enforces the constitutional consequence:

| R-class | Enforced behavior |
|---|---|
| R0 | optimistic apply + `useUndoable` toast (no confirmation permitted — asking is the defect) |
| R1 | optimistic apply + undo + digest-report event emitted |
| R2 | proposal/confirmation required; approval affordance = signature spec (§3.2 Approve) |
| R3 | signature + step-up hook + never AI-initiated (the composable will not accept an `actor: 'ai'` initiation — ADR-001 §13.3 enforced in the UI layer too) |

### 3.2 The pattern catalog (each = composable + composition + Storybook contract page)

**Creating** — never a blank form (Bible: no blank fields after the first question). Contract: every create flow receives *seed content* (AI draft, template, duplicate-from); renders as editable result, not empty inputs. Camera-first variant on `compact` posture.
**Editing** — inline, on the thing (`useInlineEdit`): click-to-edit with visible affordance, Esc = revert, blur/Enter = R0/R1 apply+undo. Distant edit forms require a pattern-exception review.
**Saving** — R0/R1: continuous/optimistic with reconciliation toast on failure; explicit Save buttons exist only in R2 contexts (policies, prices) where saving *is* signing.
**Undo** — `useUndoable`: window timer (token-driven), action stack, toast with the undo as **primary** affordance; emits `undone` telemetry (feeds Ignite self-demotion, ADR-005 §2.4).
**Cancel / Back** — always safe: drafts persist, no re-asking, no double-submit (Idempotency-Key plumbed through the fetch layer by default).
**Deleting** — near-absent by design (platform archives; tombstones only). The danger pattern (`useDanger`) exists solely for true R3: typed-confirmation + step-up + cooling-off display. It must be *hard* to reach — no red buttons adjacent to routine actions.
**Archiving / Restoring** — R1 pair with undo; archived things render with a quiet "restore" door (the D-31 lesson: the archive state educates).
**Publishing** — R2 ceremony-lite: preview-as-customer + single signature control; emits `published` for the Moment Ledger (first-publish detection).
**Approve / Reject** — the **signature spec**: singular distinct affordance, never keyboard-default-focused, never positioned where muscle memory lands, preview of after-state mandatory, "Not now"/"Not ever" equally weighted, both one tap (Bible §7.4).
**Wizard** — permitted only for ceremonies (genesis, guided imports); `useJourney`: resumable at every step (server-persisted), progress = the thing materializing (never a % bar), one question per screen.
**AI Proposal** — §8; consumes the quartet; renders per R-class.
**Confirmation** — reserved for R2/R3 (the composable refuses R0/R1 — Reversible Over Confirmed is compiled in).
**Searching** — `useSearch`: instant (<100ms perceived) local narrowing + debounced server query; keyboard-first; query state in URL (shareable, back-safe).
**Filtering** — chip-based, visible active filters, URL-persisted, one-tap clear; filter vocab from token enums.
**Bulk editing** — `useBulkSelection`: selection mode with batch bar (appears only when volume makes it kind — Bible §10), batch actions are R-classed like single actions, always undoable as a batch (the import batch-undo pattern generalized).
**Pagination / Infinite scroll** — merchant surfaces: **keyset "Load more" + virtualization, never infinite scroll** (no infinite-scroll traps — Bible §15); customer feed surfaces: infinite scroll permitted with restore-position and reachable footer. Cursors are opaque (the platform's keyset cursors surface directly).
**Loading** — `useLoadingStage` implements Bible §6.3 exactly: <400ms nothing → skeleton (structure-true only) → >3s narrated progress (message stream slot); AI content streams.
**Empty states** — `DofEmptyState` contract: *what this becomes* + *why it's worth it* + one primary action + effort label ("30 seconds"). A bare "No items" render is a gate failure.
**Errors** — `DofProblem` renders RFC 9457 problems (the platform's stable codes) through the errors-educate law: plain what-happened → what it means → pre-filled next step; retry carried when retryable; `Inspect` rung holds raw details. Customer-touching failures expose the escalate-to-recovery hook (§3.6 Bible).
**Offline** — a state, not an error: `useQueuedAction` declares queued mutations ("will send when you're back"), reads persist, composer content never lost.
**Success** — proportional: R0/R1 settle quietly (motion `quick` + optional haptic hook); rare successes route to Moments (§10). Success copy states what is now true.
**Notifications** — consolidated + ranked through one `DofNotice` pipeline; no badge without a real deadline (a `deadline` prop is *required* to render an urgency treatment — calm enforced by API design).

---

## 4. Navigation System

- **Workspace nav** — data-driven from a typed `NavSchema` (capability-gated + Surface-Level-gated per ADR-005 §6): fixed order (spatial memory — frozen), items appear/retreat but never reorder; S0 renders exactly the five frozen nouns. The schema is the single source for sidebar (regular/wide) and tab bar (compact).
- **Marketplace nav** — customer-side: discovery-first (people/moments), search prominent, cart quiet; no workspace chrome.
- **Store nav** — storefront scope: merchant's structure (collections-derived), DOF chrome ≈ 0; only the trust surfaces (§9) are platform-rendered.
- **Community nav** — feed-first with the braid rule: any object (deal, product, Spark) opens politely in-context (sheet on compact, panel on wide) without losing feed position.
- **Admin nav** — same design system, `regular/wide`-optimized recipes, denser tables; capability-gated by admin roles. No separate system (§0 of the brief honored: one language).
- **Mobile** — bottom tab bar (≤5 slots from NavSchema) + center **camera/ask action** (the primary input device — Bible §12); one-thumb reach map respected by layout tokens.
- **Command palette / Ask bar** — **one component** (`DofAskBar`), two dialects (Bible §5.2): natural language → Ignite (does/proposes/navigates); command syntax → palette. Global shortcut, full keyboard operability, and it is the universal a11y path (§11).
- **Quick actions** — per-object action sheets fed by the same command registry the palette uses (one registry, three renderings: palette, context menu, quick actions).
- **Keyboard navigation** — global map registered through `useShortcuts` (conflict-checked at dev time); every pattern publishes its keys; printable cheat-sheet generated from the registry.
- **Search navigation** — search results are *doors*: selecting navigates with context (highlight, scroll-to) — and searching for a hidden capability is a reveal signal (emitted for Ignite).

---

## 5. Layout System

Named layout shells (L3), each a contract with slots + posture behavior:

| Shell | Used by | Posture rules |
|---|---|---|
| `DofFeedLayout` | Pulse, Community | single column, card stream; `wide`: rail for context |
| `DofCatalogLayout` | products, collections, marketplace grids | container-query grid; virtualized ≥50 items |
| `DofObjectLayout` | product/order/customer detail | header + tabs (`compact`) / two-pane (`wide`); inline-edit everywhere |
| `DofRunShell` | packing runs, import review | full-screen, chrome hidden, progress + one exit (Bible §5.3) |
| `DofCeremonyShell` | genesis moments, §10 | full-screen, queue-aware, skippable, reduced-motion parity |
| `DofSettingsLayout` | settings | the frozen three-way split (Store/Business/Account, ADR-001 §11); search-first on `compact` |
| `DofInsightsLayout` | analytics | sentences before charts (Bible §4.3): narrative slot precedes visualization slot |
| `DofOpsLayout` | orders, inventory, returns | task-list-first; module tables secondary; needs-action always first |
| `DofStorefrontLayout` | customer store | storefront scope; BrandKit-themed; trust surfaces pinned |
| `DofConsoleLayout` | admin | dense tables, bulk-first, `wide`-optimized |

Responsive law: **container queries first** (components respond to containers), viewport postures second (layout shells respond to `compact/regular/wide`), device sniffing never.

---

## 6. Component Taxonomy (classification only)

| Layer | Contents (illustrative, not exhaustive) |
|---|---|
| **Foundation** | tokens, `DofIcon`, `DofText`, `DofMoney` (minor-units → `Intl` rendering — the *only* way money renders), `DofTime` (µs-safe, tz-aware) |
| **Inputs** | button, field, select, combobox, toggle, stepper, date/window picker, media picker (camera-first), option-matrix editor |
| **Navigation** | nav schema renderers, tabs, breadcrumb (rare), ask bar/palette, quick actions |
| **Feedback** | toast/undo, notice, problem, skeleton, progress-narration, empty state, offline banner |
| **Overlay** | sheet, panel, dialog (R2/R3 only), popover — all through one focus/scroll manager |
| **Data** | card, virtualized list/table, definition list, chart wrapper (narrative-first) |
| **Commerce** | product card, variant matrix, price/sale display, stock badge, order card, fulfillment task, return decision card, label purchase |
| **Community** | Spark card, deal card (truth-telling clock), coupon, video stall, store character card, follow control |
| **AI** (§8) | proposal card, evidence panel, assumptions list, confidence phrase, approval control, conversation panel, digest card, goal/coaching cards |
| **Trust** (§9) | track record, verified marks, protection note, promise date, quartet explainability panel, transparency panel, new-store vouch |
| **Celebration** (§10) | ceremony shell, moment card, whisper line, launch card composer |
| **Operations** | task card, run shell internals, batch bar, adjustment ledger row, scanner surface |

Classification rule: a component lives in the **lowest layer that can express it**; L3 surfaces may compose L1/L2 but add no new primitive styling (token discipline).

---

## 7. Motion Language

- **Principles compiled from Bible §6:** every animation must *orient, connect, report, or celebrate* — each animated component's story metadata declares which job its motion does; "none" fails review. Motion never blocks input (all animations are interruptible; no `pointer-events: none` during transitions).
- **Tokens:** durations `instant(≈100ms)/quick(≈200ms)/deliberate(≈400ms)/celebration(≤1200ms)` + easings `settle/enter/exit` — raw values banned by `check:tokens`. Physics: settled arrivals, no bounce/elastic (easing tokens simply don't include one).
- **Transition rules:** route/layer transitions use the View Transitions API as progressive enhancement with instant fallback; list reflows animate only when they *orient* (e.g., reorder), never on data refresh.
- **Micro-interactions:** state flips at `instant`; cause-effect connections at `quick` with shared-element continuity where cheap.
- **Loading behaviors:** §3 loading pattern is the only sanctioned implementation; skeleton pulse uses the `hint` opacity token at `deliberate` tempo — quiet, not shimmering.
- **Reduced motion:** `prefers-reduced-motion` yields **full parity** — every motion job has a static equivalent (opacity/instant swap; ceremonies become still, warm cards). Implemented centrally in the motion helpers so components inherit it; verified per component by gate G-6.
- **Performance budget:** compositor-only properties (`transform`, `opacity`) for anything continuous; zero layout-thrashing animations (CI Playwright trace check on pattern stories); 60fps target on mid-range mobile; any animation dropping frames in the trace gate gets simplified, not "optimized later."

---

## 8. AI Surface Specification

One Ignite everywhere: all AI surfaces share the `ignite.*` i18n voice namespace (first-person, plain, calibrated, no exclamation inflation — Bible §7.1) and these contracts:

- **`DofProposalCard`** — props mirror the frozen proposal anatomy (ADR-005 §2.1) *by type import from contracts*: intent (headline), evidence (cited), **assumptions (always visible, never collapsed away)**, preview slot (outcome, never command list), R-class, confidence, expiry. Renders per R-class (§3.1). Dismissal is one tap, emits `dismissed` with reason enum (feeds Never-Ask-Twice).
- **`DofEvidencePanel`** — citations to *the merchant's own data*: each evidence line carries a source ref that opens the underlying record (Show the Work is a link, not a tooltip).
- **Confidence** — rendered as **calibrated language, never percentages** ("fairly sure" / "a guess until ~20 orders"); the phrase set is a token-like enum in `ignite.*` so calibration is consistent platform-wide.
- **`DofApprovalControl`** — the signature spec (§3.2), shared by proposals, publishing, and R3 flows; one implementation of "approving feels like signing."
- **`DofConversationPanel`** — the ask bar's expanded form: streaming responses (§7 streams), grounded-fact chips linking to evidence, proposals appear *as proposal cards inline* (chat has no privileged write path — ADR-005 Law 1 visible in the UI).
- **Recommendations / Insights** — `DofInsightCard`: sentence-first, chart at Read rung or below, every insight carries the quartet or it doesn't render (the component *requires* evidence props — unexplainable recommendations are unrenderable, ADR-005 §9.4 compiled in).
- **Goal tracking / coaching** — `DofGoalCard`: merchant-accepted goals only (no self-assigned KPIs), progress narrated, at most one riding next-step proposal.
- **Undo experiences** — the standard `useUndoable` toast + **`DofSelfDemotionNotice`**: when a reversal triggers autonomy self-demotion (ADR-005 §2.4), the notice renders Ignite's one-sentence explanation — the trust-building sentence gets a dedicated, quiet component.
- **Silence is a component state:** every AI surface has a designed *quiet* state (Ignite's default is silence — Bible §7.2); AI surfaces never render placeholders begging for engagement.

---

## 9. Trust Surface Specification

Dress code (compiled from Bible §3.5): trust components render in the **calm base voice** — sys text/surface tokens only; `ember`/`accent`/promotional styles are lint-banned in `surfaces/trust/*`. Signals are records, never scores; every signal is traceable (tap → source).

- **`DofVerifiedMark`** — renders the frozen ladder levels (ADR-001 §10) only; no other component may draw a checkmark-of-trust (single source of verification truth; counterfeit-proof by grep).
- **`DofVerifiedPurchase`** — structural review authenticity tag; renders only from an order-line reference prop (unfakeable by construction when Reviews land).
- **`DofTrackRecord`** — the merchant record (§3.2 Bible): evidence rows (longevity, orders, on-time rate, resolution time), trajectory over snapshot, repair history included, "new with dignity" variant (`DofNewStoreVouch`: "New store · payments protected by DOF").
- **`DofPromiseDate`** — shipping confidence: renders only *defended* dates (prop contract requires a confidence source), states the promise plainly, and owns the at-risk state (which routes to proactive-disclosure recovery, ADR-005 §2.5).
- **`DofReturnConfidence`** — the policy, human-readable, merchant-confirmed marker visible.
- **`DofProtectionNote`** — buyer protection/escrow narration: quiet, foundational placement (never banner dress).
- **`DofExplainabilityPanel`** — the quartet renderer (why/evidence/confidence/assumptions) shared by AI surfaces (§8) — AI trust and marketplace trust use the same glass (one implementation of transparency).
- **`DofTransparencyPanel`** — plain-language privacy/data answers ("what DOF knows and why"), including personalization citations ("because you follow…").

All trust components are **props-in renderers of domain truth** — they compute nothing (one writer per fact reaches the pixel layer: the UI may not synthesize trust any more than Ignite may).

---

## 10. Signature Moments

The Moments architecture (ADR-005 §10, Bible §14) as reusable machinery:

- **`useCeremony`** — queue-aware (never interrupts runs/flows: subscribes to the run/ceremony arbiter), once-only (requires a Moment-Ledger receipt prop; refuses to render without one — celebration inflation is structurally impossible), skippable always, reduced-motion full parity, haptic hook (mobile future).
- **`DofCeremonyShell`** — full-screen tier: content slots (the real thing: item, amount, town), celebration motion capped by the `celebration` token, bespoke ember motif only — **no generic confetti library will be added to the dependency tree** (subtle-premium is enforced by not shipping the tacky option).
- **`DofMomentCard`** — Pulse-tier: warm variant of the standard card, share affordance (launch-card composer), dismiss = permanent (ledger write-back event).
- **`DofWhisper`** — digest-line tier: text-only, the default intensity.
- **Intensity is a prop from the registry** (`ceremony|card|whisper`), never a component choice: the UX-BIBLE §14.3 registry maps moment → tier, and the components refuse mismatched escalation (a whisper-tier moment cannot be rendered in the ceremony shell).
- **Recovery-moment variants** carry their own tempo (steadiness first): `DofMomentCard` `tone="steady"` for resilience markers and trust-restored closures — no ember, no celebration motion (Bible §14.4).

---

## 11. Accessibility Engineering

**Floor: WCAG 2.2 AA — as CI gates, not aspiration.**

- **Keyboard:** 100% operability; the shortcuts registry (§4) is conflict-checked; every pattern's Storybook contract page documents its keys; a Playwright keyboard-only suite walks every pattern (no pointer events).
- **Focus:** one central focus manager (trap only in overlays; restore on close; visible ring from a11y tokens; never `outline: none` without replacement — lint rule); roving tabindex utilities for grids/matrices.
- **Screen readers:** narrative-first (Bible §13): `DofAnnouncer` (aria-live, polite by default) speaks in sentences from the same i18n catalogs as visible copy; component gates include an SR-checklist (name/role/value/state) and pattern-level NVDA+VoiceOver manual passes per release.
- **Contrast:** token-level (§2.5) — components inherit compliance; BrandKit storefront values validated at save (§2.6).
- **Touch targets:** `--dof-sys-target-min` ≥44px on all interactive elements; gate-checked geometrically in Playwright.
- **Reduced motion:** central, full-parity (§7); gate G-6 screenshots every animated story under `prefers-reduced-motion`.
- **Localization readiness:** zero concatenated strings (ICU messages only); pseudo-locale (é×pansion) story pass catches truncation; `DofMoney`/`DofTime` are the only date/money renderers (locale-correct by construction).
- **RTL readiness:** logical properties/utilities only (`ms-/ps-/text-start`); physical direction utilities (`ml-/pl-/text-left`) are lint-banned; RTL is a standard screenshot axis in gates.
- **Testing:** axe on every story (zero violations to merge) + keyboard suite + SR checklist + manual passes; accessibility defects are severity-1 by policy.

---

## 12. Performance Standards

- **Bundle:** workspace route initial JS ≤ 200KB gz (app shell + L1/L2); design-system CI tracks per-component cost; any PR adding >10KB gz to the shared chunk needs explicit sign-off. No wildcard barrels (the public `index.ts` is curated and tree-shake-verified).
- **Web vitals budgets (p75, mid-range mobile):** LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1 — measured in CI (Playwright + throttling) on reference pages (Pulse, catalog grid, product detail, storefront) and in production via web-vitals reporting into the platform `Metrics` port (the existing observability discipline extended to the client).
- **Rendering:** virtualization mandatory for lists ≥50 rows (`DofVirtualList` under catalog/orders/tables); heavy surfaces (charts, editors, media pipeline, scanner) are async components behind interaction or visibility.
- **Images:** always through the Media domain's variant system — components take `MediaRef`, never URLs (frozen VO honored in the UI); aspect-ratio boxes mandatory (CLS-proof), modern formats + `sizes` handled by one `DofImage`.
- **Icons:** curated Iconify subset compiled into the bundle at build time — **no runtime icon fetching** (offline-safe, CSP-clean); additions go through the same PR gate as components.
- **Animation:** compositor-only + trace gate (§7).
- **Monitoring:** vitals + component-level marks (`performance.mark` in dev) + bundle-size trend in CI; regressions block like test failures.

---

## 13. Developer Experience

- **Storybook organization** mirrors the taxonomy exactly (`Foundation/…, Patterns/…, Surfaces/AI/…`); every component ships: all-states stories, both theme scopes, dark, RTL, pseudo-locale, reduced-motion, loading/empty/error — because stories are the gate evidence (§0.5). Pattern contract pages document: behavior, R-class, keyboard map, a11y notes, do/don't with *rationale citations to the Bible section that decided it*.
- **Documentation:** props/events/slots auto-extracted from TypeScript; every doc page answers "when NOT to use this" (the anti-pattern habit, §15 Bible).
- **Testing strategy:** Vitest for composables/pattern state machines (the behavior contracts get the deepest unit coverage) · Storybook interaction tests for component states · Playwright for pattern E2E (keyboard suite, undo semantics, offline queue) · **visual regression via Playwright screenshots in CI** (self-hosted; no external SaaS dependency), axes: scope × mode × RTL × reduced-motion × posture.
- **Contribution:** RFC-lite for new patterns/L3 surfaces (one page: problem, which existing pattern fails, proposed contract); primitives and tokens change only via design-system owners (CODEOWNERS); features may *compose* freely.
- **Versioning & migration:** §1.4 — CHANGELOG discipline, dev-mode deprecation warnings, codemods for mechanical migrations, two-minor grace.

---

## 14. Quality Gates (all mandatory; automated where marked ⚙)

| # | Gate | Bar |
|---|---|---|
| G-1 | **Token compliance** ⚙ | `check:tokens` clean — zero raw visual values |
| G-2 | **Pattern conformance** | mutating behavior uses a pattern composable; R-class declared; no bespoke confirmation/undo implementations |
| G-3 | **Accessibility** ⚙+manual | axe zero violations on every story · keyboard suite pass · SR checklist · targets ≥ token min |
| G-4 | **Performance** ⚙ | bundle delta within budget · virtualization where required · animation trace clean |
| G-5 | **Theming** ⚙ | renders correctly in workspace+storefront scopes × light+dark (screenshot axes) |
| G-6 | **Motion** ⚙+review | motion job declared (orient/connect/report/celebrate) · reduced-motion parity screenshots |
| G-7 | **Responsiveness** ⚙ | compact/regular/wide screenshots · container-query behavior verified |
| G-8 | **RTL + i18n** ⚙ | RTL screenshots · pseudo-locale pass · zero hardcoded strings |
| G-9 | **Testing** ⚙ | composable unit tests · interaction stories · visual baselines committed |
| G-10 | **Documentation** | full story matrix · contract page · owner named · "when not to use" |
| G-11 | **Bible conformance** | review checklist against UX-BIBLE registers (calm: no unearned urgency; errors educate; empty states teach; trust dress code) |
| G-12 | **Browser matrix** ⚙ | last-2 evergreen + iOS Safari − 1; graceful degradation documented for View Transitions et al. |

CI wiring: G-1/3/4/5/6/7/8/9/12 join the existing gate chain (`lint → check:tokens → typecheck → unit → stories/axe → visual → build`); G-2/10/11 are PR-review checklists with named sign-off. **No component enters production without all twelve.**

---

## 15. Decision Register

**DS-1** Nuxt UI is wrapped, never imported by features; the wrap is the decade seam. **DS-2** Two theme scopes (workspace, storefront/BrandKit) over one semantic token layer; BrandKit contrast validated at save time. **DS-3** Monorepo Nuxt layer, no npm publication; versioning by CHANGELOG contract + codemods. **DS-4** Three-tier tokens (`ref/sys/cmp`), CSS as source of truth via Tailwind v4 `@theme`, generated TS types; `check:tokens` CI gate bans raw visual values. **DS-5** Interaction patterns are headless composables + blessed compositions; mutating patterns declare R0–R3 and the composable enforces the constitutional consequence (undo vs proposal vs signature; R3 refuses AI initiation). **DS-6** Elevation, motion, z-index are semantic-only scales; easing tokens contain no bounce. **DS-7** Merchant surfaces never infinite-scroll (keyset load-more + virtualization); customer feeds may. **DS-8** One ask bar = command palette + Copilot door, backed by one command registry (palette/context/quick-actions). **DS-9** Container queries are the primary responsive mechanism; postures (`compact/regular/wide`) secondary; device sniffing forbidden. **DS-10** `DofMoney` and `DofTime` are the only money/time renderers (minor units + µs/tz safety inherited from platform law). **DS-11** AI surfaces require the explanation quartet as props — unexplainable recommendations are unrenderable; confidence renders as calibrated language, never percentages; chat renders proposals inline (no privileged write path). **DS-12** Trust components are calm-voice renderers of domain truth: no `ember`/`accent` (lint-banned), no computation, single sources for verification marks and purchase authenticity. **DS-13** Moments machinery enforces the registry: intensity comes from the registry prop, ceremonies require a Moment-Ledger receipt, no confetti dependency exists. **DS-14** Accessibility floors are tokens + CI gates (axe-clean stories, keyboard-only suite, logical-properties-only, ICU-only strings); a11y defects are sev-1. **DS-15** Performance budgets are CI-enforced (200KB gz shell, vitals p75 targets, virtualization ≥50 rows, build-time icon subset, `MediaRef`-only images). **DS-16** Storybook stories are gate evidence; the story matrix (states × scope × mode × RTL × motion × posture) is mandatory. **DS-17** Twelve quality gates, none waivable; automated gates join the existing CI chain.

---

*DESIGN-SYSTEM-001 in one sentence: the constitution said how DOF must feel — this contract makes those feelings the path of least resistance for every engineer, and makes their violations fail CI.*
