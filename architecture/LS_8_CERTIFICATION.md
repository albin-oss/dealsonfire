# LS-8 CERTIFICATION — The Street Is Findable (+ Reality Track)

**Increment:** LS-8, pulled forward of LS-5 per the LS-4 governing finding (content volume and reality are the bottleneck, not machinery) · **Branch:** `increment/ls-8-findable` · **Date:** 2026-08-29
**Verdict:** **GO — unconditional** (sweep recorded at merge)

## Track B — findability

**Sitemap** (`/sitemap.xml`): live unheld stores, their published products and live deals, published sparks, non-empty lanes, `/home`, `/shops`. Real `<lastmod>`; no invented changefreq/priority. Deliberately absent: held/draft/deleted entities (the EXISTING visibility conjunction — no SEO copy of enforcement), account/token/recovery surfaces, `/search` and query permutations, legal placeholders (NOT APPROVED banner = not index-worthy), empty lanes (thinness law). **Scale law documented in the file**: flat sitemap below ~10k URLs; past that, sitemap index + per-entity children partitioned by month. Live: 73 URLs at dev volume. 5-minute shared cache — a hold falls out within one cache breath, and the hostile suite proves a fresh read excludes it immediately.

**Robots** (`/robots.txt`, served dynamically for the absolute Sitemap line): protects account/cart/checkout/order/auth/token/search surfaces — explicitly a courtesy, never access control (authorization law already guards every listed path).

**Canonicals**: stores/products/deals/sparks/home/shops already carried them; lanes now do too. `/search` stays `noindex`; empty lanes emit `noindex` while remaining useful to wanderers.

**Structured data** (derived from authoritative facts only, nothing fabricated): Organization + WebSite + a truthful SearchAction (the `/search` page is real) on `/home`; Organization per storefront (name, the maker's own words, canonical, image); ItemList on `/shops`; the existing Product/Offer JSON-LD untouched. No ratings, reviews, availability claims, or shipping promises invented.

**Link previews**: product/store/deal/spark OG+Twitter meta already existed (one SEO voice, `public-seo.ts`); lanes gained theirs. Verified crawler-visible on direct fetch: og:title carries the real name + maker words, canonical correct, JSON-LD present.

**Hostile suite (5 scenarios, [AUTOMATED])**: draft products, held stores, and held stores' products absent; a hold applied AFTER a sitemap read is gone on the next read (same law, nothing SEO-side to go stale); token/search/account/recovery/legal URLs never candidates; malicious merchant names (`<script>`, `&`, quotes) cannot break the XML — names never enter it and URLs are escaped; empty lanes absent, populated lanes present.

## Track A — reality

**Cohort checklist** (full table in the runbook): everything ENGINEERING is DONE or already proven; what remains is FOUNDER-only — the 5-minute sender-domain DNS action (exact steps written), the pilot framing sentences, an operator assignment, and the host choice for a deployed environment.

**Reality Ledger**: `contracts/learning/seed-registry.ts` (dev-demo's eight deterministic principals) + learning section **R0** — every readout now opens with the seeded/real split (live dev: 8 of 10 stores seeded; Marta, Pen & Co., and walkthrough shops are founder-walk). Binding law recorded: dev-demo seeding never runs against cohort/production environments; founder walks are CONTROLLED/DEMO, never REAL COHORT.

**Exposure-bias honesty (Founder correction §6)**: documented as a watch item in the pulse module header — distinct-person counting stops one person becoming a crowd but does NOT correct exposure bias. Learning section **LS4b** measures people-per-glance, sample-guarded at ≥50 impressions so tiny ratios can't mislead. Measurement for judgment; the production formula does not consume it.

**Merchant onboarding walkthrough ([BROWSER], fresh maker, stopwatch)**: zero → store public + product public ≈ **3 minutes** (Ignite, 5 inputs); + first spark ≈ **4–5 minutes total**. No blockers found — launch honors a custom name, drafts self-save, nothing dead-ends. Frictions recorded as cohort observation targets, none fixed (per scope law): (1) the proposal preview's URL footer shows the stale generated handle after typing a custom name — display-only (launch used `grain-grip` correctly) but it contradicts the maker at the commitment moment; (2) the question-3 placeholder is knitting-themed whatever you sell; (3) a photo-less first product misses the chronological "New things" voice (which requires an image) while appearing on The Street — inconsistent visibility for day-one makers.

**End-to-end reality proof**: a shop created through the real flow appeared, within one cron tick, in the sitemap, the "New on the street" lane, and on The Street with three cards (spark voice, debut, product) — capped at exactly the per-store diversity limit, cues truthful (`fresh` + `new_maker`).

**Observation card**: 10 behavior-first questions in the runbook.

## Privacy & performance

No pixels, retargeting, affiliates, or third-party anything (word-of-mouth law upheld). Sitemap generation: five queries at dev volume behind a 5-minute shared cache; metadata is rendered from data already on the page. No new infrastructure.

## LS-5 decision gate (defined, not implemented)

LS-5 Threads is justified by cohort evidence of: dead-ending after opening something · repeated view→search loops · manual same-shop navigation · lane→item→back→item loops · "what else is like this?" verbatims. Weak search → improve search; weak content → recruit makers; confusion → comprehension work; weak return → LS-6; merchant evidence hunger → LS-7.
