# LS-5 CERTIFICATION — Threads Between Things

**Increment:** LS-5 (Living Street) · **Branch:** `increment/ls-5-threads` · **Date:** 2026-09-01
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## §0 gate — the previous release was verified first
LS-8 was NOT released when this directive arrived (its sweep died with the prior session, v1.51.0 untagged). Per the directive's own §0, LS-5 was held: LS-8's sweep was rerun clean, v1.51.0 released and verified (tag ≡ merge `9246aba` ≡ origin/main), and only then did LS-5 begin. Evidence classes at authorization: **[REAL COHORT] none** (cohort still awaits the Founder's two actions), **[FOUNDER WALK]** the LS-8 onboarding walkthrough, **[DEMO/SEEDED]** the eight-shop world, **[AUTOMATED]** the suites. No class was merged.

## Was LS-5 actually next?
Structural dead-end inspection (no real cohort, so structural + browser evidence, labelled as such): the product and deal pages ended at "More from this store" and a generic home link — a stranger arriving from SEO on one maker's thing had no honest route to a DIFFERENT maker, and no route from the thing to the person behind it. Both are dead-ends LS-5 names directly. Search and lanes already work (LS-2/LS-3 shipped); content volume is the standing bottleneck but is a Founder/cohort action, not an engineering increment. So LS-5 is the right engineering next step — and it doubles as scaffolding the cohort will fill.

## Relationship types shipped
- **VOICE** — the maker's latest published spark under the thing. thing → person → story: DOF's structural differentiator from commodity marketplaces. Absent when the maker hasn't spoken.
- **NEARBY** — other makers' products from the same LS-3 search lane (the subject's own words decide the lane; the subject's own store is excluded; one item per store; max three). Cross-merchant by construction, diversity as a hard rule.

## Relationship types rejected/deferred (admission law)
- **Shared-search-intent**: sample far too small; would be inference dressed as fact.
- **Follow-graph ("also followed")**: no real distinct-person volume — shipping it from seeded relationships would fake a social signal (explicitly forbidden). Deferred until real cohort volume.
- **Embeddings / LLM similarity / vector search / collaborative filtering**: rejected outright for LS-5 — none can answer "why are these connected?" in a sentence a buyer trusts.

## Architecture / complexity delta
One CHECK-widening migration (0035, source `'thread'`) — **no new table, no read model, no service**. `server/utils/threads.ts` composes existing facts: the LS-2 FTS product index (verbatim expression twin) and the LS-3 lane registry. One public endpoint, one component (`StreetThreads.vue`) on two pages, four telemetry-source lines. Preferred-small delta achieved.

## Laws proven (hostile suite — 5 scenarios, [AUTOMATED])
Never threads to itself or its own store through nearby; one-per-store diversity (no monopoly); held/draft stores appear in NO thread (voice and nearby), including a hold that lands AFTER publication — the visibility conjunction is repeated per query, never a parallel copy; a held SUBJECT threads to nothing (no oracle through the thread door); sparse worlds return absent threads, never filler, never the current item; bad subjects 422; thread arrivals record `source=thread` with no identity minted (LS-1 law).

## Visible advancement & cross-merchant proof ([BROWSER])
From Oak & Understory's Understory Bench, Nearby surfaced The Reset (Clean Slate) and Night Bus (Pixel & Paper) — two OTHER makers in the shared Home & light lane, with a lane link to keep wandering — and clicking through reached a different maker's product. The voice thread carried the maker's own spark. Region/heading/list semantics verified via the accessibility tree; headings name the relationship ("{maker}, in their own words"; "Nearby on the street — {lane}"), never a generic "Related products".

## Sparse-world honesty
Real-data check: the Lavender Blanket's Nearby is correctly **null** — no other maker sells wool — while its voice thread is present. No recommendation beats a dishonest one.

## Telemetry / privacy
Reuses `attention_facts`; `source='thread'` is the only new vocabulary. The named consumer is LS5a: does a thread arrival lead to a second distinct discovery within the hour? No new store, no dwell tracking, 90-day law untouched.

## Performance
Bounded per-page queries: one subject resolve, one voice select, one lane-membership probe, one neighbor select (DISTINCT ON store). All ride existing indexes (FTS GIN, listing/store btrees). No N+1, no projection. Watch-trigger recorded only if a future lane count or catalogue size makes the per-lane probe loop costly.

## The experience-director question — does DOF feel bigger?
Yes, in the specific way the directive asked for: from one bench you meet the person who made it (their words) and then step to a *different maker* in the same corner of the street. The realization it plants is "there are people and stories behind these things," not "here are more products." It adds no algorithmic feel because there is no algorithm — only the maker's voice and the street's geography.

## Weakest of FIND / UNDERSTAND / WANDER / SHARE / RETURN
FIND (SEO shipped), UNDERSTAND (direct-entry context shipped), WANDER (lanes + threads now), SHARE (link previews shipped) are all served. **RETURN is the weakest** — nothing yet gives a stranger a reason to come back tomorrow. That points at LS-6, but only real cohort behaviour can confirm people discover successfully yet fail to return.

**STOP after release** — LS-6 is not begun; it is a recommendation pending evidence.
