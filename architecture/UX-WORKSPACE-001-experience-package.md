# UX-WORKSPACE-001 — Merchant Workspace Experience Package (Vertical Slice 002, Phase 1)

**Status:** Phase 1 design deliverable. No UI code. Awaiting approval.
**Bindings:** UX-BIBLE-001, DESIGN-SYSTEM-001, DPS-001 (§1/§4), BCA-001, VSA-001 (VS4/VS6), PDS-001 (Opportunity First, Calm), OA-001 (O3/O4/O5), ADR-005 (Surface Levels). Ignite is **frozen** (defects/explicit enhancements only) — the Workspace is where Ignite's graduate lives.
**Ground truth:** the Workspace shell is substantially built — `DofWorkspaceLayout`, the **data-driven nav schema** (14 modules, Surface-Level gated, fixed order, each with a promise + why), the Home feed, the Getting-Started progress engine (`/api/v1/workspace/progress`), the ⌘K Ask Bar, notification chrome, breadcrumbs, workspace switcher. This package ratifies what's right, designs what's missing, and marks each item **[built] / [evolve] / [new]**.

**The one sentence:** *the Workspace is a trusted coach who happens to have an office* — it answers "what's the most valuable thing right now?" before it shows a single number.

---

## 1. Information Architecture [built, ratified]
Three rings: **Home** (orientation + opportunity), **Modules** (the 14 nouns below), **Object pages** (a product, an order). Merchant-scoped by membership; business switcher in the chrome. Settings is a door, never a prerequisite ("nothing in here is ever required to start selling").

## 2. Navigation Model [built — the permanent system]
Navigation is **data** (`WORKSPACE_MODULES`): fixed order, each module carries `reveal` (Surface Level), a `promise`, and a `why`. This is already the permanent system the prompt requires:
- **Catalog** → Products · **Inventory/Orders/Deals/Coupons/Sparks/Analytics/Settings** → present · **Listings** → deliberately *no nav noun*: a listing is the publication of a product to a channel (ADR-002), 1:1 and invisible day-one — surfacing "Listings" as a destination would leak plumbing (Invisible Complexity). It lives inside Products/Store until multi-channel makes it a real place. · **Advertising** [new, named now]: reserved as a `reveal: 's3'` module (`id: 'advertising'`) added to the schema when C17 arrives — an array entry, not a redesign. **No future redesign needed: adding a module is adding a row.**

## 3. Primary Layout [built] — `DofWorkspaceLayout`: left rail (desktop) / bottom bar (mobile), top bar (breadcrumbs · ⌘K · notifications · account), content column with optional right rail (`DofFeedLayout`).

## 4. Desktop [built] — rail + generous single content column + right rail for ambient context (Ignite/Opportunities). Density comfortable; no three-pane wall.
## 5. Mobile [built, evolve] — bottom 5-slot bar = the S0 noun budget (Home, Products, Orders, Deals, contextual fifth) + "More" sheet for revealed modules. Thumb-first: the home's primary opportunity CTA sits bottom-fixed. [evolve: the fifth slot becomes *contextual* — see §7.]
## 6. Adaptive Navigation [built, ratified] — Surface Levels (`s0→s3`, per-person, presentation-not-entitlement) grow the nav as the merchant grows; items **appear and retreat, never reorder** (spatial memory is sacred). Capability gating joins the same filter when merchant sessions reach the client (already noted in the schema).
## 7. Contextual Navigation [new] — two quiet mechanisms, no new chrome: (a) the mobile fifth slot swaps by context (a running deal → Deals; unfulfilled orders → Orders), with the swap animated at instant tempo and never mid-view; (b) object pages get contextual actions on the object (ship on an order, publish on a store) — never a global action menu.

## 8. Workspace Home — the centerpiece [evolve]
The Home is **activation-aware**: one layout, three *postures* that blend (never a hard switch):
- **Coach (pre-activation):** the hero is the **Next Opportunity card** (§9); the Getting-Started line ("You're 2 steps from your first sale") sits beneath it; empty-state cards teach what each space becomes. **No metrics anywhere.** The current built home is this posture minus the hero.
- **Operator (first orders flowing):** needs-attention items (unfulfilled orders, low stock) rise above opportunities; the health sentence (§14) appears. Metrics still live in Analytics, not Home.
- **Advisor (established):** the health sentence leads, opportunities become growth proposals (Pulse), attention items only when real. Analytics becomes prominent *only now* — exactly the prompt's activation rule.
Posture is derived from real facts (milestones + order activity), never a mode toggle.

## 9. Opportunity Center [new — the slice's core build]
One **`DofOpportunityCard`** (new permanent DS component) with a strict grammar: **Title (imperative) · Why (the reasoning, always shown, one sentence citing the merchant's own facts) · one primary action · optional "not now"**. Sources, in order of maturity:
1. **Progress-derived (buildable now):** the progress engine's `next_milestone_id` *is* the first opportunity ("Put something on the shelf — the store is open; give visitors one thing to fall for"). Ignite's launch Next-Opportunity already proved the pattern.
2. **Signal-derived (Pulse seam, later):** real signals with the evidence attached ("142 views this week, no deal running — plan a weekend deal"). Arrives via the same card; the engine changes, the grammar doesn't.
**Rules:** at most **one hero opportunity** on Home (the rail may hold two quiet runners-up); every recommendation states its reasoning; "not now" is respected (snoozed, not nagged); no manufactured urgency, ever (PDS-001 Calm).

## 10. Activity Feed [built empty-state; fills with VS3] — "Recent activity" card: needs-action first, money attached; sourced from the domain event trail (correlation-stamped) when Orders land. Until then the empty state teaches — never fake data.
## 11. Notifications [built chrome; C11 grows] — the bell is a *summary*, quiet until useful; transactional now; preference center at C11-P2. Notifications never duplicate the Home's attention items — one fact, one place.
## 12. Quick Actions [built, evolve] — today's row stays, but **derived from posture**: pre-activation they mirror the top opportunities; post-activation they become the merchant's actual frequent verbs (recents from the ⌘K registry — which already records usage).
## 13. Progress Indicators [built] — the Getting-Started timeline (words-first: "You're N steps away", single next CTA). It *retires itself* on completion (Calm: a finished checklist disappears rather than celebrating forever).
## 14. Business Health [new, sentence-first] — one line, no charts on Home: pre-activation none; Operator: "3 orders this week — all shipped on time."; Advisor: "Twice your usual Tuesday." (Pulse). A tap opens Analytics. `DofHealthLine` is deliberately **not** a new component — it's `DofText role="emphasis"` + a link; no chart primitives on Home, by design.
## 15. AI Entry Points [built seams] — the ⌘K Ask Bar (ask anything → future Pulse), `DofProposalCard` for AI proposals in the rail (evidence + confidence, human-applied), Ignite re-entry ("Create another store"). No chat panel: AI enters where work happens, provenance-stamped, advisory-only.
## 16. Empty States [built, law] — every card teaches what it becomes and why it's worth it (the nav schema's `promise`/`why` feed the coming-soon pages). Never fake data, never a locked-feature upsell.
## 17. Loading [built] — skeletons per card (`DofSkeleton`); the shell renders instantly, cards hydrate independently; progress endpoint failures degrade to the teaching empty state (never a broken hero).
## 18. Error Recovery [built pattern] — RFC 9457 → `DofProblem` with educating copy + retry; a failed card never takes the Home down (per-card boundaries); offline shows last-known content with a quiet banner.
## 19. Accessibility [built, extended] — landmarks + skip-link + axe-clean already verified; new: the hero opportunity is an `aria-live="polite"` region when it *changes* (not on load); posture changes never steal focus; bottom bar respects safe-area; all new components keyboard-first with visible focus.
## 20. Responsive [built] — one layout, two postures (comfortable/compact); wide content scrolls in its own container; the right rail folds under the feed on mobile (Opportunities collapse to the hero only).

---

## Three alternative concepts (self-challenge)

| | **A — "The Coach's Feed"** (evolved current shape) | **B — "Mission Control"** (persistent 3-pane: nav · work queue · context) | **C — "The Conversation"** (chat-first home; Ask Bar *is* the workspace) |
|---|---|---|---|
| Fit to "trusted coach" | **High** — one hero opportunity with reasoning; guidance is the layout | Low — operator-dense; a cockpit coaches nobody | Highest metaphorically, but a coach who hides your shop |
| Calm / cognitive load | **Calm by construction**; one thing leads | Overwhelming pre-activation (the Shopify trap the brief forbids) | Calm but *opaque* — every glanceable fact costs a question |
| Scales S0→S3 | **Yes** — postures blend; nav reveals | Only for S2+ operators | Poor — power merchants need objects, not chat |
| Mobile | Natural (single column) | Fails (3 panes don't fold honestly) | Natural |
| Engineering | **Low-risk** — evolves built code (hero card + posture logic) | High — new shell, contradicts frozen `DofWorkspaceLayout` | High — conversational state machine; AI not ready (C13-P1) |
| Constitution | Opportunity First ✓ Calm ✓ Progressive ✓ | Violates Calm + Opportunity First | AI-First over-rotated; Human-Controlled at risk |

**Recommended: A — "The Coach's Feed."** It is the only concept where *opportunity-first* is structural (the hero card is the layout's first element), it blends into Operator/Advisor postures without a redesign, it respects the frozen shell and nav schema, and it ships as an evolution of verified code rather than a bet. B is the industry default the brief explicitly rejects; C is a beautiful idea whose prerequisites (Pulse, conversational AI) don't exist yet — its Ask-Bar seam is preserved in A, so C remains reachable later without waste.

**Phase 2/3 build scope (on approval):** `DofOpportunityCard` (permanent DS), the Home hero + posture derivation (progress + order-activity facts), quick-actions-from-posture, contextual mobile fifth slot, and the a11y/perf verification pass. Everything else is ratified as built.

---

**Phase 1 complete. STOPPING for approval before implementation, per the prompt.**
