# LS-4 CERTIFICATION — The Street Moves

**Increment:** LS-4 (Living Street, first ranked voice) · **Branch:** `increment/ls-4-street-pulse` · **Date:** 2026-08-28
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## The constitutional question, answered honestly

Evidence available before ranking: **REAL USER SIGNAL: none** (the controlled cohort has not started — its two human preconditions remain with the Founder). CONTROLLED/DEMO SIGNAL: founder-walk attention facts and seeded engagement. STRUCTURAL FACT: distinct-visitor engagement tables, the LS-1 exposure law (SHOWN ≠ WANTED), the empty ProjectionRegistry built for this moment. NOT YET KNOWN: real vocabulary, real click distributions, whether ranked discovery changes wandering.

Therefore engagement-inferred "smart" ranking would be **evidence-starved fakery — refused**. What shipped is the sanctioned honest version: **freshness + distinct-people evidence + hard diversity + deterministic exploration**, with every constant named in one block (`PULSE`) and every excluded signal recorded with its reason (purchases: rich-get-richer; impressions: exposure ≠ interest; anonymous views: no identity, no vote; dwell/cursor: surveillance, unrecorded anyway).

## The product law upheld

Chronology survives untouched: Home carries a dual voice — **The Street** (shared pulse; deliberately NOT labeled "For You" because it is not personalization) beside **Newest** (the existing stream with all its filters and voices, byte-identical behavior). A cold or absent pulse degrades to chronology with an honest caption ("the street is still waking — showing newest").

## The first registered projection

`rm_street_pulse` — migration 0034, the manifest's first `read_model` (91-table ritual). Registered through the existing ProjectionRegistry: shadow build + atomic swap in one transaction, version-stamped comment, rebuilt on the existing cron clock. Derived state only; visibility is re-checked at read time, so an enforcement hold works instantly against a stale projection (pinned by test). Replay proven: two rebuilds → identical rows; no shadow residue; the suite also caught a real contract bug (fixed) — schemaSql index names must derive from the table name or the second rebuild collides.

## Ranking law

`score = e^(−age_hours/72) + 0.35·ln(1+people_7d) + 0.10·ln(1+stops_7d)` where people/stops are **distinct identified visitors**. One visitor hammering ten views and ten clicks counts once ([AUTOMATED]: people_7d = 1); twenty anonymous impressions count zero as evidence while honestly recorded as exposure. Log-damping caps compounding: the tenth admirer moves less than the first.

## Diversity & exploration

Result-set law, not score bonuses: ≤3 items per store per page, never two consecutive same-store, entity-type runs ≤2 ([AUTOMATED] under a 12-product merchant). Every 4th slot is an exploration slot for under-exposed or new subjects, newest first; **"New maker" is keyed to store age** (`stores.published_at`) so deleting/recreating content cannot reclaim it ([AUTOMATED]); under-exposure earns slots but never a label — a cue is a claim, and only evidence may claim.

## Truthful cues

At most ONE quiet cue per card: "People are stopping here" (≥3 distinct intentional people — never counts shown), "New maker" (store <30 days), "Fresh on the street" (<48h). The browser demo caught and killed a fabricated cue (under-exposed old shops briefly labeled "New maker") before ship.

## Merchant fairness (simulated A–G)

Established+loved: reachable, capped at 3, cannot monopolize. Excellent new merchant, zero history: on page one via exploration. Popular merchant's mediocre content: decays like anything else (freshness dominates; damped interest can't carry it). Strong small maker: present. Impression-gamer: gains exposure numbers that count for nothing. Inactive-but-formerly-strong: 7-day windows + 72h decay move the street past them. Multi-item merchant: interleaved, never consecutive.

## Privacy & performance

No new identifiers, cookies, retention, or trackers; the 90-day law untouched; the projection stores only counts (P0). Rebuild: ~64 ms at dev volume inside the cron tick; street read end-to-end 219 ms dev-server cold, candidate query sub-ms (61 rows). Watch-triggers recorded: incremental build when full recompute exceeds the cron budget; keyset candidates when the pool outgrows LIMIT 96.

## Sweep

Recorded at merge in the PR. Real catches en route, none reclassified: the shadow-index naming bug (replay test), the fabricated-cue bug (browser demo).

**STOP after this release** — LS-5 (relationships between things) awaits review against what LS-4 taught.
