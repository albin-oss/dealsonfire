# LIVING STREET — PROGRAM PLAN (Phase 2)

**Status:** ACTIVE · 2026-08-18 · operating mode: audit → smallest increment → build → browser-demo → hostile → sweep → Founder review → continue unless a real gate fires.
**Kept deliberately lean.** The foundation corpus exists; this document only steers.

## 1. Product objective

Make DOF feel alive. A stranger arrives, understands the street in one glance, finds something worth stopping for, follows threads, returns, and finds it meaningfully different. Attention — not commerce — is the bottleneck.

## 2. Current discovery reality (audited 2026-08-18, from code)

- **Search**: `ILIKE '%q%'` over four entity names only (no story/tagline text), top-5 per group, dropdown-only — **no results page**, no index that can serve it, no recording of what people looked for.
- **Feed**: five-branch UNION, strictly `published_at DESC` (the chronological law), keyset-paged, filters (All/Following/Saved) and voices (Deals/Updates/New things/Shops & makers), last-visit watermark + "you're caught up".
- **Browse**: `/shops` hard-capped at 60, newest-first, no facets. `products.category_path` exists but is read by nothing.
- **Engagement facts**: follow/save/fire keyed by pseudonymous `visitor_id`, live `count(*)` reads, no denormalized counters.
- **Telemetry**: none, by recorded law ("DOF persists NO visits/views/impressions") — with the successor already named in `ROADMAP.md` ("server-side visit persistence — GATED").
- **Ranking**: refused everywhere, deliberately.
- **Projections**: `ProjectionRegistry` + `rm_` convention + replay machinery exist, **zero registered**.
- **SEO**: canonicals + Product JSON-LD on product/deal pages, robots.txt; **no sitemap**, no Organization/ItemList JSON-LD.

## 3. Biggest buyer frictions

1. Search that misses ("lavender" finds the blanket only if the title says so; no page to see more than 5; typos find nothing).
2. No way to wander — no lanes, no "food / home / art / under €20 / fresh today"; the only path is the one feed.
3. Nothing connects — a product page dead-ends; no "more from this shop's neighbors", no related threads.
4. Returning is underpowered — "N new from shops you follow" exists, but nothing says *what* changed or why it's worth coming back.

## 4. Biggest merchant frictions

1. Total demand blindness: a maker cannot know anyone looked. (Momentum shows follows/fires — explicit acts only.)
2. New shops get one debut card in the feed, then sink under chronology; nothing ever resurfaces them.
3. No demand vocabulary: makers can't hear what strangers searched for and didn't find.

## 5. Signals already available (reuse, never duplicate)

Follow, fire, save (visitor-keyed facts) · cart/checkout/purchase (orders) · publication times (deals/sparks/listings/stores — freshness) · brand story/promise text · follows-graph (`store_follows`) · last-visit watermark cookies · `identity_claims` visitor↔account linkage.

## 6. Signals that must be introduced (each with its named consumer)

| Signal | Named consumer — the decision it improves |
|---|---|
| feed impression | LS-4 ranking must separate "was shown" from "was wanted"; without it, ranking rewards position, not interest |
| store / product / deal / spark view (with source surface) | merchant demand receipts ("people found me, via the feed"); LS-5 related discovery |
| search query (normalized, bounded) | LS-2 relevance work targets REAL vocabulary; zero-result queries = the street's missing words |
| search result click | the only honest relevance judgment for LS-2 |

Nothing else. Cart/purchase/follow/save/fire stay where they are — the telemetry layer reads them, never re-records them.

## 7. Proposed increment sequence (engineering-owned boundaries)

- **LS-1 — Attention** *(this increment)*: the `attention_facts` layer (batch beacon, pseudonymous, bounded retention) + its first honest consumers: a demand sentence in merchant momentum, the zero-result search moment for buyers, and street-level learning sections.
- **LS-2 — Search that understands the street**: Postgres FTS + trigram over names AND story/tagline/body text, a real `/search` page (grouped, paged), informed by LS-1 vocabulary. No OpenSearch, no embeddings.
- **LS-3 — Lanes (taxonomy-lite browse)**: derived lanes (food/home/art/gifts…, "fresh today", "under €X", "new shops") from existing product/store data — zero merchant homework; lanes on `/shops` and home.
- **LS-4 — The street moves (honest ranking)**: first registered projection (`rm_street_pulse`); ranking as an explainable, *additional* lens — the chronological law stays as a voice, never silently replaced; explicit diversity floor so new makers surface.
- **LS-5 — Threads (related discovery)**: same-shop, same-lane, followed-also-followed, "fresh nearby" on product/deal/spark/store pages.
- **LS-6 — The return journey**: "since you were last here" built from watermark + follows + attention; follow digests ride the C12 mail journal.
- **LS-7 — Demand receipts**: complete the merchant evidence sentences (found me / brought them / cared about / returned). No dashboards.
- **LS-8 — The street is findable**: sitemap, Organization/ItemList JSON-LD, held/thin content excluded, enforcement_hold respected everywhere.

Cohort findings reorder this sequence the day they exist.

## 8. Explicit non-goals

No generic analytics platform, warehouse, or dashboards · no third-party trackers, fingerprinting, raw IPs, or cross-site anything · no opaque/AI ranking in Phase 2 · no OpenSearch/vector search · no marketplace mega-taxonomy or merchant admin homework · no engagement-maximizing objectives · no duplication of the C12 inheritance list (mail journal, webhook invariant, guest_tokens, recovery tokens, boot gates, consent facts, durable rate limits, masked-404, enforcement_hold reads, visitor identity, engagement facts, chronological feed, search entities, storefront surfaces).

## 9. Risks

1. **Telemetry poisoning** (bot inflation of views/demand receipts) → rate limits, batch caps, existence-validated subjects, DISTINCT-visitor aggregation, anonymous events counted as "glances" never "people".
2. **Privacy drift** → no cookie minting on passive reads (the no-tracking-by-default law holds); identity attaches only where a visitor cookie already exists; 90-day retention enforced by sweep; events carry no query-string PII beyond the bounded search text.
3. **Ranking eroding trust** → LS-4 ships as an additional explainable lens with the chronological voice intact; popularity capped by a diversity floor.
4. **Invisible-infrastructure drift** → every increment names its buyer-visible surface before build starts (LS-1's are the zero-result moment + demand sentence).
5. **Tiny-cohort vanity metrics** → aliveness copy shows only above honest floors; no fabricated liveliness.

## 10. Success measures

- A named real query that failed under substring search returns the right thing after LS-2 (vocabulary drawn from LS-1 facts, not invented).
- Zero-result rate on real searches falls between LS-2 and LS-6.
- A brand-new shop is reachable within two wanders (lane → shop, or related → shop) without search, after LS-3/LS-5.
- A merchant can read, in one sentence, that people found them and what brought them (LS-1 start, LS-7 complete).
- Return rate of engaged visitors (existing learning proxy) rises after LS-6; the cohort confirms strangers understand Sparks and follow something within a first visit.
- Every increment demoed in the browser as a stranger journey; sweep green; released under the PR/tag law.
