# DOF Roadmap — Parallel Product Evolution

Two continuous streams (Founder decision, Option D). Stream A items move ONLY
on real-world evidence; Stream B proceeds autonomously unless a gate fires
(observable-behavior or strategy change).

## Stream A — Product Discovery (Founder-owned, evidence-gated)

| Initiative | Owner | Depends on | Gate | Effort | Risk | User impact |
|---|---|---|---|---|---|---|
| Deployment + first cohort (First Light) | Founder | DEPLOYMENT.md, playbook | — | days | low | unlocks everything |
| Weekly Corner Note (email) | Founder→eng | claim-rate evidence, email infra | YES | 3–5d | med | high (customer) |
| Deal momentum parity (nudge) | Founder→eng | E1/E2 evidence | YES | 0.5d | low | med (merchant) |
| Maker face/logo surfaces | Founder→eng | identity-emotion decision | YES | 1–2d | low | high (emotional) |
| Orders / "how do I buy?" | Founder→eng | the verbatim, ADR-007 | YES | weeks | high | decisive |
| Durable notifications backend | Founder→eng | evidence of need | YES | 3–5d | med | med |
| Server-side visit persistence | Founder→eng | measurement decision | YES | 1–2d | low | (learning) |
| Entity-card consolidation | eng | observed card convergence | no | 1–2d | low | none (velocity) |

## Stream B — Platform Evolution (Engineering-owned, autonomous)

| Initiative | Depends on | Gate | Effort | Risk | User impact |
|---|---|---|---|---|---|
| Public street search (Cap-02 authorized, deferred) | — | no | 1–2d | low | high — NOW BUILDING |
| Variants & options UI on product detail | Cap-01 endpoints (exist) | no | 1–2d | low | med (merchant) |
| Cold-boot e2e race | — | no | 0.5d | none | (reliability) |
| Dark-mode audit on brand pages (#23) | — | no | 1d | low | low-med |
| Focus-visible audit (#24) + axe totality (#25) | — | no | 1d | none | med (a11y) |
| Responsive images srcset (#16) + aspect audit (#17) | — | no | 1d | low | low (perf) |
| Lighthouse pass (#28) | — | no | 1–2d | med | low (perf) |
| Grid virtualization (1000+ products) | real catalogs that size | no | 2d | med | future |

Numbered items reference the original Stream-B inventory below (kept for history).

---

# UI Advancement Roadmap (original Stream B inventory)

Polish that is independent of customer validation: every item below stays
valuable no matter what the interviews change. No new workflows, no commerce
assumptions, no product hypotheses. Architecture unchanged.

Classification key — Effort: S (≤½d) M (1–2d) L (3d+) · Visibility: how fast a
stranger notices · Risk: blast radius if wrong.

## The inventory (28 items)

| # | Improvement | Effort | Visibility | Risk | Deps | Demo | Test |
|---|---|---|---|---|---|---|---|
| 1 | Branded error page (404/500 today = default Nuxt) | S | high | low | — | ✅ | e2e |
| 2 | Favicon + theme-color (none exist — generic tab) | S | high | none | — | ✅ | e2e |
| 3 | robots.txt (missing) | S | low | none | — | ✅ | smoke |
| 4 | `html lang` on all pages | S | low | none | — | — | e2e |
| 5 | Copy-link visible feedback everywhere (label swap ✓) | S | med | low | — | ✅ | ui |
| 6 | Image error fallback (broken URL → branded placeholder) | S | med | low | — | ✅ | ui |
| 7 | Skip-to-content link on public pages | S | low | none | #14 | — | axe |
| 8 | Home filters: keep stale items while revalidating (no skeleton flash) | S | high | low | — | ✅ | e2e |
| 9 | Card enter transitions, `prefers-reduced-motion` respected | M | med | low | — | ✅ | ui |
| 10 | Button press micro-states (active scale via tempo tokens) | S | med | low | — | ✅ | — |
| 11 | Sticky Home header + filters on scroll | S | med | low | — | ✅ | e2e |
| 12 | Jump-to-unread smooth-scroll polish (offset under sticky header) | S | low | low | #11 | ✅ | — |
| 13 | Brand-palette contrast guard (merchant picks #ff0 → auto-legible fg) | M | med | med | — | ✅ | ui |
| 14 | Extract PublicShell (header/footer now copy-pasted ×5, max-w drift 2xl/4xl) | M | med | med | — | — | e2e |
| 15 | Storefront hero mobile polish (engage row wrap, spacing) | S | med | low | — | ✅ | e2e |
| 16 | Responsive images: srcset/sizes on feed + shelf | M | low | low | — | — | — |
| 17 | Aspect-ratio audit (spark page max-h-96 variable → reserved ratio) | S | low | low | — | — | — |
| 18 | Public-page share buttons: one idiom, one component | S | low | low | #14 | — | ui |
| 19 | Workspace page-header consistency (title/subtitle/actions pattern) | M | med | low | — | ✅ | — |
| 20 | Products grid → card layout with photos (list is text-first today) | M | high | low | — | ✅ | e2e |
| 21 | Workspace skeleton coverage audit (every lazy fetch has one) | S | med | low | — | — | ui |
| 22 | Mobile nav: fifth-slot transition polish | S | low | low | — | ✅ | — |
| 23 | Dark-mode audit on brand-scoped pages (token fallbacks) | M | med | med | — | ✅ | — |
| 24 | Focus-visible audit across DS interactive states | M | low | low | — | — | axe |
| 25 | Axe e2e on ALL routes (today: subset) | M | low | none | — | — | e2e |
| 26 | Home "load more" (feed caps at 48 silently) | M | med | low | — | ✅ | int |
| 27 | Reduced-motion + tempo-token compliance audit in DS | S | low | low | #9 | — | ui |
| 28 | Lighthouse pass: font loading, payload trim, preconnect | M | low | med | — | — | smoke |

Excluded on validation grounds (correctly out of Stream B): logo upload
surface, search, notifications, pagination-as-infinite-scroll, any new
merchant workflow.

## The batches

### Batch 1 · First Impressions (2–3 days) — items 1–6 (+4)
**Objective:** the ten-second stranger test — branded tab, branded errors, no
dead-image ugliness, visible feedback on every copy action.
Screens: every route (error/favicon/lang), Home, storefront, all four
merchant pages. Components: `app/error.vue` (new), `PublicImg` (new),
`useCopy` (new). Demo value: high — before/after is instant. User value:
trust and orientation at every dead end. Risk: low (additive).

### Batch 2 · Motion & Presence (2–3 days) — items 8–12, 21, 22
**Objective:** the product feels alive under the hand — no flash-of-skeleton
on filter switches, sticky context, tactile buttons, motion that respects
reduced-motion. Screens: Home, workspace. Risk: low.

### Batch 3 · Public Maturity (3–4 days) — items 13–18
**Objective:** the shells strangers actually visit converge on one polished
skeleton (PublicShell), legible on any brand palette, sized right on any
phone. Risk: medium (shared-shell refactor touches five pages; e2e guards).

### Batch 4 · Workspace Craft (2–3 days) — items 19, 20, 23
**Objective:** the merchant side looks like the product it is — photo-first
product cards, consistent page headers, dark-mode confidence. Risk: low.

### Batch 5 · Deep Quality (3–5 days) — items 24–28
**Objective:** the invisible floor — axe on every route, focus states, feed
growth past 48 items, Lighthouse targets. Risk: low-medium.

Every batch: production quality, demoable, tested, inside the existing
architecture, shipped through the standard flow with a semver tag.
