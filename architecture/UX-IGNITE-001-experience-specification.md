# UX-IGNITE-001 — Ignite Experience Specification (Vertical Slice 001, Phase 1)

**Status:** Phase 1 deliverable (UX before code). Awaiting approval before Phase 2.
**Bindings:** Platform Bible, Constitution, BCA-001, VSA-001 (VS1/VS2), PDS-001, OA-001 (O1/O2), UX-BIBLE-001, ADR-005 (Ignite), DESIGN-SYSTEM-001, Merchant/Commerce/Catalog capabilities.
**Ground truth:** Ignite is **built and shipping** (ADR-005; `app/pages/ignite.vue`, `journey/intelligence/launch` composables; verified in PROMPT-008 with real-time handle availability added). This spec is therefore the *authoritative description* of the experience — ratifying what is deliberately right, and marking the genuine gaps. It does not re-imagine a working flagship into a different product.

---

## 1. The Screen Inventory, challenged (the core UX decision)

The prompt lists **11 screens** (Welcome → Business Type → Business Info → Store Name → Theme → Logo → AI → Review → Congrats → Preview). The built experience deliberately collapses these into a **six-beat conversation** — and this spec defends that collapse, because the 11-screen wizard is exactly the industry pattern DOF differentiates against (PDS-001 §3: "hours of config + theme hunting" vs "five minutes, conversational").

| Prompt screen | Verdict | Where it lives instead |
|---|---|---|
| 1 Welcome | ✅ kept | Beat 1 `welcome` |
| 2 Sign In/Up | ✅ kept, **but not a wall** | `/register`, `/login` exist; Ignite supports **guest-first** (guest token + claim pattern) — you may build before you sign up; the account arrives at launch. Challenged: forcing auth first costs the magic moment. |
| 3 Business Type | 🔀 **inferred, not asked** | The `idea` sentence + intelligence reading infers category & fulfillment kind. Asking "Individual or Registered?" at minute one fails the Grandma Test; the business defaults to `individual` and upgrades later (Progressive Complexity). |
| 4 Business Information | 🔀 **deferred to workspace** | Ignite asks for *zero* form fields beyond the idea sentence. Address/tax/details belong to Settings, after value is felt (Opportunity First). |
| 5 Store Name & Handle | 🔀 **proposed, not typed** | Beat 3 `mirror`: three named identities (name+handle+palette) proposed from the idea; handle **derived** with real-time availability + collision fallbacks (never a dead end, D-16). Typing is an *override*, not a requirement. |
| 6 Theme & Brand Style | 🔀 folded into `mirror` | Each identity IS a brand style (personality → curated palette). One choice instead of two screens. |
| 7 Logo Upload (optional) | ⏳ **deferred — gap** | Media capability (C9) hasn't landed; an upload dead-ends today. Ships as an optional Reveal item when Media lands. Optional per the prompt; honesty over a stub. |
| 8 AI Suggestions | ✅ built as extension points | `IgniteIntelligence` port + `ruleBasedIntelligence` stub (names, palettes, tagline, reveal items; SEO-title reserved on the port). Advisory only — every suggestion is overridable before anything is created (AI-First Human-Controlled). |
| 9 Review & Publish | ✅ kept | Beat 5 `reveal`: live `StorefrontPreview` + "what DOF set up" list with an Advanced disclosure; then Launch. |
| 10 Congratulations | ✅ kept | Beat 6 `launch` success: the store URL, first-product echo, next-step CTA. |
| 11 Public Store Preview | ⏳ **gap — the one open DoD item** | In-journey preview exists; the *public route* (`/s/:handle`) is R1-B5 per DPS-001/IGNITE_ARCHITECTURE (4-step plan ready, no schema change). Product-goal step 6 "visit the public storefront" is open until it lands. |

**Net:** 11 screens → **6 beats + 2 marked gaps**. Every removed screen is a removed decision, and the Five-Minute promise is arithmetic: fewer beats, fewer failures.

## 2. User Journey Map (VS1→VS2)

```
   feel the spark          say the idea            see yourself           choose the first thing
  ┌────────────┐   →   ┌───────────────┐   →   ┌───────────────┐   →   ┌────────────────────┐
  │ 1 WELCOME  │        │ 2 IDEA         │        │ 3 MIRROR      │        │ 4 FIRST-THING      │
  │ the promise│        │ one sentence,  │        │ 3 identities, │        │ first product OR   │
  │ + import   │        │ chips to start │        │ live preview  │        │ import (CSV real)  │
  │ door       │        │ from           │        │ pick one      │        │                    │
  └────────────┘        └───────────────┘        └───────────────┘        └────────────────────┘
                                                                                     ↓
                        ┌──────────────────────────┐        ┌──────────────────────────────┐
                        │ 6 LAUNCH                  │   ←   │ 5 REVEAL                      │
                        │ narrated steps → success  │        │ storefront preview + "what   │
                        │ dof.dev/:handle · next    │        │ DOF set up" (advanced fold)  │
                        └──────────────────────────┘        └──────────────────────────────┘
```
Emotional arc: curiosity → self-recognition (the Mirror is the delight moment — VSA-001 §4) → confidence (Reveal shows the finished thing before commitment) → pride (Launch). Time budget: ~30s + 45s + 45s + 60s + 60s + 30s ≈ **4½ minutes**, inside the promise.

## 3. Decision Flow (every decision the user actually makes)

1. *Start fresh or bring an existing store?* (Import Door — CSV/Excel real; platform connectors honestly marked unavailable.)
2. *What's the idea?* (one free-text sentence; starter chips reduce blank-page cost)
3. *Which identity is yours?* (3 proposals; rename/edit as override — "you can rename anytime, nothing locks")
4. *What's the first thing you'll sell?* (title + price; imported products skip this)
5. *Launch now?* (Reveal → one button)
Total: **5 decisions, 2 typed fields** (idea, first-thing). Everything else is inferred with named, changeable defaults — that is Invisible Complexity, measured.

## 4. State Machine

**Journey (client, persisted):** `welcome → idea → mirror → first-thing → reveal → launch`, back-navigation free, each step validated with educating copy (e.g. "One sentence is enough…"). Persistence: localStorage snapshot `{stepId, state}` → **abandon = resume where you left off** (recovery state). Guest work is claimable into the account (identity claim pattern, built).
**Launch (server orchestration, narrated):** `business → store → brand → product → publish` via the Merchant Kernel — each step triple-gated, idempotent (Idempotency-Key), audited, event-emitting. Failure at any step → **pause, not loss** ("We paused at the {step} step"), retryable from the failed step because completed steps are recorded.

## 5. The Nine States (per prompt)

| State | Treatment (built unless marked) |
|---|---|
| Error | RFC 9457 → `DofProblem`, Errors-Educate copy; validation inline via `blockedReason` with `aria-live="polite"` |
| Empty | starter chips on `idea`; import door for "I have nothing typed but a store elsewhere" |
| Loading | narrated launch progress ("Opening the doors…"); `DofSkeleton`/`DofSpinner` elsewhere |
| Success | Launch beat: URL, product echo, next-step CTA (Opportunity First: the next action, not confetti alone) |
| Recovery | resume-from-persistence + launch pause-and-retry at the failed step |
| Availability | handle checked real-time (`GET /handles/:h/availability`, debounced on explicit edit); collision → numbered suggestions, never HANDLE_TAKEN dead-ends on derived paths |
| Offline/API-fail | journey state survives locally; saves reconcile on retry |
| Auth edge | guest → claim at launch; session expiry mid-journey → login → resume (persistence) |
| Enforcement | publish blocked by standing/hold → educating problem, workspace path onward |

## 6. Design-system inventory (prompt's list → status)

Stepper/progress (`useJourney` + step word) ✅ · cards ✅ `DofCard` · form fields ✅ `DofField/DofInput/DofMoneyInput` · **handle availability indicator** ✅ (endpoint live; UI wiring is Phase 2 polish) · theme selector ✅ (Mirror radiogroup) · success screen ✅ · toasts ✅ `DofToastRegion/DofUndoToast` · dialogs ✅ `DofDialog/DofSheet` · empty states ✅ `DofEmptyState` · skeletons ✅ `DofSkeleton` · **upload component** ⏳ deferred with Logo/Media. Nothing duplicated; all from `@ds/index`.

## 7. Performance & a11y budgets (verification targets for Phase 3)

LCP < 2.5s (journey is a single light page; preview renders locally) · INP < 200ms (beat transitions are local state) · CLS < 0.1 (fixed-height step region) · WCAG 2.2 AA: radiogroup semantics on the Mirror, `aria-live` validation, keyboard-complete (existing Playwright a11y suites extend to `/ignite` assertions in Phase 3).

## 8. Gaps this spec commits to (the honest Phase 2/3 scope)

1. **Public storefront `/s/:handle`** — the one open product-goal step (visit the store). Plan frozen in IGNITE_ARCHITECTURE.md (public live-only read endpoint + SSR page + 404 masking + tests). **This is the principal Phase 3 build item.**
2. **Handle-availability UI wiring** — surface the live endpoint in the Mirror's rename affordance (debounced, with suggestions).
3. **Logo upload** — deferred until Media (C9); tracked, optional.
4. **SEO-title suggestion** — reserved seat on `IgniteIntelligence`, filled with the first real provider.

---

**Phase 1 complete. STOPPING for approval, per the prompt.**
Approval question: proceed to Phase 2/3 with this scope — i.e., the two real build items (public storefront route, handle-availability UI wiring) plus a11y/perf verification passes — **or** do you want any of the challenged screens (Business Type/Info forms, separate Theme screen, Logo now) restored to the flow despite the Five-Minute cost?
