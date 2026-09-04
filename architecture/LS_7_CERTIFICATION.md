# LS-7 CERTIFICATION — Demand Receipts

**Increment:** LS-7 (Living Street, merchant side) · **Branch:** `increment/ls-7-demand-receipts` · **Date:** 2026-09-04
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## Phase-0 audit findings
The workspace already had ONE demand sentence (LS-1's `attention_this_week` on Home: "N people stopped by … most came from the street feed"). `/analytics` was a coming-soon placeholder (`<WorkspaceComingSoon />`), the natural home for demand evidence with no data behind it. Of the five questions, only Q1 (did anyone find me) was answered; Q2–Q5 had the facts in `attention_facts`/engagement but no merchant read. `deal_saves` had never been surfaced anywhere. Merchant isolation pattern: `resolveAccess(tx, userId, businessId)` → masked NOT_FOUND. **Conclusion: LS-7 completes primarily by turning existing truth into merchant understanding, not by adding a subsystem — KEEP the LS-1 sentence (now a door), REUSE attention/engagement facts, REMOVE the `/analytics` placeholder, no new table.** No contradiction; work continued.

## What LS-7 can now answer (each sentence falsifies to named rows)
1. **Did anyone find me?** distinct `visitor_id` (people) vs NULL (glances) over `*_view` rows, 7d.
2. **What brought them?** `source` breakdown (people per door) + search **phrases** from `search_click` rows that clicked through to this shop.
3. **What caught attention?** the product/deal/spark with the most distinct viewers — **named only if still visible** now.
4. **What did they care enough to do?** follows / **saves (first time surfaced)** / fires, this week.
5. **Did anyone come back?** distinct visitors who viewed on ≥2 calendar days, 7d.

## What it deliberately refuses
- **Purchase → discovery attribution** (DEFERRED): the event chain doesn't prove a view caused a sale, so no such sentence.
- **Causation from sequence** ("search caused this purchase") — only "arrived from search" (a `search_click`) is claimed.
- **Percentages / up-N% / conversion rates / DAU-MAU / scoring** at cohort-zero — omitted, not faked.
- **Marketplace-wide unmet demand routed to a specific merchant** — a missing query is not this shop's opportunity; only phrases that actually clicked through to this shop are shown.

## Attribution & people-vs-glances law
`people = COUNT(DISTINCT visitor_id)` everywhere — one hammering visitor is one person (hostile-proven: 10 views → 1). A NULL visitor is a **glance**, never a person. Every merchant sentence is generated in ONE server-side model (`server/utils/demand-receipts.ts`); the UI renders strings and never computes them.

## Privacy / aggregation threshold
Merchant evidence is aggregate; no visitor/account/email/IP, no per-visitor trail, no new cookie. Search phrases are withheld below **SEARCH_MIN_PEOPLE = 3** distinct searchers (k-anonymity), so one person's query can't be reconstructed by a merchant. Hostile-proven: a 2-searcher phrase is withheld, a 3-searcher phrase shown.

## Historical-vs-current visibility decision
**Counts are historical** (attention facts are immutable — a view that happened, happened); **names are current-visibility-gated** (the "what caught attention" subject is NAMED only if it resolves to a currently-published, non-held, non-deleted thing). So a held/unpublished/deleted subject is never named in a receipt, while the fact that attention occurred is not retroactively erased. Documented; enforcement_hold not weakened. Hostile-proven.

## Merchant isolation
`GET /api/v1/workspace/demand` gates through `resolveAccess`; a caller who is not a member of the business gets the empty receipt, never another shop's evidence. Hostile-proven: a rival's two visitors are invisible in my receipt.

## Data sources / persistence
`attention_facts` (views, sources, search phrases), `store_follows` / `deal_saves` / `spark_reactions` / `deal_reactions` (care acts), publication times. **Zero migrations, zero new tables, no analytics platform** — bounded aggregation over already-indexed facts under the 90-day retention law.

## Merchant experience
`/analytics` → "What the Street noticed": the honest sentences first and largest, an optional doors/search breakdown only when it adds to the sentences, and kind empty states (glances-only; quiet-week with a "Post an update →" nudge, never punishing). Nav retitled "What people noticed", revealed at s1. Home keeps the LS-1 sentence and gains a "See what people noticed →" door (progressive disclosure).

## Low-data behaviour ([SQL] on real dev data + [AUTOMATED])
Populated receipt proven on staged real dev data: **8 people / 6 glances** (not conflated), doors home 6 / search 1 / shops 1, the phrase "lavender blanket" cleared k-anonymity (3 distinct), 1 returning visitor. Empty/quiet-week proven [BROWSER] as a real signed-in merchant. The 10-scenario hostile suite covers worlds A–H (new shop, glances-only, one visitor, top subject, held subject, care acts, returning, search origin, fabricated subjects, isolation).

## Hostile results
10/10 — every sentence falsified to rows; one-visitor-is-one-person; glances-never-people; fabricated subjects can't invent a title; held subject never named; k-anonymity threshold; merchant isolation; zero-data honest-empty.

## Performance
Six bounded, indexed, parallel aggregations per receipt, all scoped by `business_id` and windowed to 7 days (attention_facts has store_id + occurred_at indexes; engagement tables are business_id-scoped). No N+1, no per-card query, no projection. Watch-trigger: if `attention_facts` growth makes the 7-day scan slow, a per-store daily rollup is the first move — measured, not pre-built.

## Remaining workspace mockups after LS-7
Still coming-soon (unchanged, honest): Customers, Coupons, Inventory, Shipping, Returns, Marketing. Analytics is no longer a mockup. The Home "Continue where you left off" and rail "Opportunities" empty states remain teaching-only.

**STOP after release** — LS-8 not begun; per Founder direction the roadmap stands and the cohort proceeds in parallel, not as a gate.
