# LIVING STREET — PHASE 2 RETROSPECTIVE

**Status:** CLOSURE · 2026-09-04 · judges LS-1…LS-8 from the repository as it stands at v1.54.0
**Method:** attacked as a product, from the browser and the code — not a summary of the certifications.

The Living Street set, in ship order: LS-1 attention (v1.47.0) · LS-2 search (v1.48.0) · LS-3 lanes (v1.49.0) · LS-4 street pulse (v1.50.0) · LS-8 findability, pulled forward (v1.51.0) · LS-5 threads (v1.52.0) · LS-6 return journey (v1.53.0) · LS-7 demand receipts (v1.54.0). Eight increments, eight releases, one machine-integrity fix (the async-exit-hook exit-code lie), zero new domains, and — across the whole phase — 5 new tables (attention_facts, rm_street_pulse, and the CHECK-widenings that added no tables) plus one registered projection.

## Part 1 — the thirteen questions

**1. Before Living Street, a stranger could:** land on a chronological feed of deals/sparks, open a storefront, open a product/deal/spark, add to cart, check out as a guest, and (C12) create an account. Discovery was one river, newest-first, and a substring dropdown that matched titles only. There was no way to search stories, wander by theme, see what was worth noticing, follow a thread, or find DOF from Google.

**2. A stranger can now do, that was impossible before LS-1:** search the street in natural words and typos across names *and* the makers' own story text (LS-2); wander by lane without typing (LS-3); read a shared "what's worth noticing right now" pulse beside chronology (LS-4); step from a thing to the person who made it and to a *different* maker nearby (LS-5); return and be told, honestly, what changed at the shops they follow (LS-6); and arrive from Google/an unfurled link onto a real, contextual page (LS-8).

**3. A merchant can now understand, that was impossible before LS-1:** whether the Street brought anyone (people vs glances), through which door, what caught the most attention, what people searched to find them, what people cared enough to do (follow/save/fire), and whether anyone came back — in sentences, not charts (LS-1 seed → LS-7 receipts).

**4. Genuinely complete promises:** the *mechanisms* of all eight are complete and law-bound — search-that-understands, wanderable lanes, an explainable non-popularity pulse, cross-merchant threads, a refresh-safe return read, honest demand receipts, and enumerable-but-safe findability. Each carries a hostile suite; each honors the visibility law (held content vanishes everywhere, instantly, from one read).

**5. Structurally complete but unvalidated by real humans:** *all six behaviors* — FIND, UNDERSTAND, WANDER, SHARE, RETURN, MERCHANT-LEARN. Every one is built and test-proven; none has met a real stranger or a real maker. This is the phase's single honest caveat and it applies everywhere.

**6. Assumptions resting only on demo/seed/founder data:** that the lane word-lists match how people actually describe things; that the pulse's freshness/people weights produce a street people enjoy; that threads extend sessions; that the return moment brings anyone back; that a maker finds the receipt sentences true and useful. All are plausible and none is measured.

**7. Unnecessary complexity that crept in:** essentially none — the phase's discipline held. The closest call was the exposure-bias question in LS-4, correctly *deferred* to measurement (LS4b) rather than built into ranking. Nothing was over-built.

**8. Complexity successfully avoided:** no recommendation engine, no embeddings/vector search, no OpenSearch, no analytics warehouse/BI dashboard, no notification platform/inbox, no personalization profiles, no new services/queues. LS-5 and LS-7 in particular shipped with *zero* new tables by composing existing facts.

**9. Load-bearing primitives (change = program decision):** `attention_facts` + the beacon (LS-1) — every later increment reads it; the visitor cookie + `identity_claims`; the LS-2 FTS/trigram index expressions (reused verbatim by lanes AND threads); the LS-3 lane registry (reused by threads and sitemap); the `ProjectionRegistry` + `rm_street_pulse`; the last-visit watermark; the C12 mail journal, enforcement_hold read-set, and masked-404 law that all of discovery inherits.

**10. Replaceable furniture:** the fixed pulse weights and half-life; the lane word-lists; the k-anonymity threshold (3); trigram vs a future fuzzy method; the sitemap's flat shape; the demand-receipt sentence copy; per-store daily rollups if aggregation ever needs them. All swappable behind their reads.

**11. Technical debts with concrete watch-triggers:** pulse rebuild is a full recompute on the cron clock → per-store incremental build when the recompute exceeds the tick; sitemap is one flat file → sitemap-index + monthly children past ~10k URLs; demand receipts scan attention_facts per request → daily rollup if the 7-day scan slows; lane word-lists are hand-tended → tend them from LS1b/c real vocabulary; the LS-6 discovery email is deferred → build opt-in when counsel policy lands; the session-mode dev server blocks seeded-merchant login → dev-only friction, not production.

**12. Should NOT get more engineering until real-user evidence exists:** ranking weights (LS-4), lane taxonomy (LS-3), thread relationship types beyond voice+nearby (LS-5 deferred follow-graph/similarity), and the demand-receipt sentence set (LS-7). Tuning any of these on demo data would be fitting to noise.

**13. What Phase 2 taught us about DOF:** (a) the honest version of almost every discovery feature needed *no new machinery* — the facts were already there, and the work was restraint about which claims the rows earn. (b) The recurring ceiling was never code — from LS-4 onward every increment concluded "the limit is content volume and real behavior." (c) Verifying the verifier matters: the phase's most important bug was the sweep's exit-code lie, caught only by a deliberate-failure probe. (d) DOF's differentiator is real and now expressible in the product: thing → **person** → story → another maker, which no commodity marketplace naturally does.

## The six behaviors

| Behavior | Verdict |
|---|---|
| FIND | **BUILT + UNVALIDATED** — FTS/trigram search + a real /search page + SEO findability; no real query stream yet. |
| UNDERSTAND | **BUILT + UNVALIDATED** — direct-entry context, maker voice, honest cues; no real stranger has been asked "what is this?". |
| WANDER | **BUILT + UNVALIDATED** — lanes + cross-merchant threads + the pulse; momentum proven in-browser, not with people. |
| SHARE | **BUILT + UNVALIDATED** — canonical + OG/Twitter + JSON-LD previews; no real share observed. |
| RETURN | **BUILT + UNVALIDATED** — since-you-were-here from followed shops; on-site only (email deferred); no real return measured. |
| MERCHANT-LEARN | **BUILT + UNVALIDATED** — demand receipts in sentences; proven on staged data, unmet by a real maker. |

No behavior is BUILT + VALIDATED, because there is no cohort evidence. None is NOT BUILT or merely PARTIAL. The Street is complete in mechanism and unmet by reality.

## Part 2 — the five-minute Street test (walked at v1.54.0, demo world)

**Verdict: ~3.5 of 5 minutes.** The *mechanism* invites the full five — Home offers a shared pulse and a chronology toggle; a storefront reads as a person ("Soft things, made slowly.", follow-value, meet-the-maker); a product page opens with a strong hero, an evocative maker line, cross-merchant "Nearby on the street" threads *with imagery*, and a same-shop shelf; lanes, search, return, and receipts all connect. Discovery momentum is real and dead-ends are rare. What stops the fifth minute is **content, not mechanism**: with ~8–11 shops a wanderer reaches the edge of the world and knows it.

**Product-mechanism limitations (real, worth fixing):** Street *store* cards are text-only (no logo/hero) and read database-ish next to the image-rich product cards — the card could derive imagery more aggressively. Otherwise the mechanisms are sound.

**Content/supply limitations (NOT mechanism — do not "fix" in code):** the same default tagline ("warm and personal — like a note tucked into the parcel") repeats across Ignite-created demo shops; product images are generic stock placeholders; "New maker" tags nearly everything because the world is young; only a handful of shops exist. Every one of these dissolves with real makers and real photos — they are exactly what the cohort and merchant recruitment bring.

Personality: **yes, recognizable** — calm, warm, anti-dashboard, "no algorithm; just today," the maker as hero. DOF does not feel like Etsy/Amazon/Instagram. The voice is present in copy and restraint.

## Closure verdict

**Living Street LS-1…LS-8 is COMPLETE in mechanism and formally CLOSED.** It is finished enough to leave alone: further discovery engineering should wait for cohort evidence, because tuning on demo data fits noise. The phase delivered the whole discovery + merchant-learning loop with unusual restraint and honesty, and its own findings point the next dollar not at more discovery machinery but at **inhabitants and the one place the product is still thin — the Store a maker actually builds, and the content (Flicks, richer Deals) that fills the Street.**
