# POST-COMMERCE STRATEGIC REVIEW

**Status:** For Founder decision · 2026-08-08
**Author:** The engineering organization, writing as Founder / CPO / marketplace strategist / growth leader / Principal Engineer / merchant / buyer / investor
**Question under review:** *What should we build next to create the most business value for DOF?*
**Method:** Three full-repository surveys (documentation corpus, user-facing surfaces, backend domains) conducted for this review, cross-checked against the campaign records. Implementation was judged from code, never from documentation.

---

## PART 1 — CURRENT PLATFORM REALITY

### A. Production-capable (certified or test-dense, works today)

- **The complete money path, C1–C11.** Cart → re-quoted checkout → saga with named compensations → real Stripe destination charges (Payment Element, 3DS-capable) → capture at confirmation → double-entry ledger (L1–L3 recompute-clean) → fulfillment cases (ship/pickup/digital, partial dispatch) → returns adjudication → cancellations/refunds (cause-keyed, bounded) → disputes with freeze/resolution policy → risk limits with human resume → payout river (fulfillment-evidence hold release → eligibility gates → period-idempotent sweep → real Stripe payouts on connected accounts → paid/failed webhooks → retry with key rotation → crash recovery → reconciliation with payout identity matching). Externally certified against a real Stripe test-mode account in C10 (GO, v1.41.0) and live-validated in C11 (two real payouts, replay protection, crash recovery, dispute freeze — five certification repairs committed).
- **Honesty note on C11:** the live validation is complete through the payout river, but **formal closure is pending** — `C11_EXTERNAL_CERTIFICATION.md` is unwritten, `increment/c11-payouts` sits 9 commits ahead of `main` unmerged, and v1.43.0 is untagged. The interruption happened mid-drill (dispute-won resolution). Closure is mechanical, not architectural.
- **Merchant genesis.** Ignite (6-beat ceremony, resumable saga over 5 kernel commands, handle ledger with atomic claim), product authoring (conversational composer, full edit page), store editor with live preview, the orders bench, the money story on Settings.
- **Platform substrate.** Per-domain event/outbox/delivery/audit quartets (33 registered event types, CI-locked), exactly-once outbox dispatch with dead-lettering, partitioned audit logs, idempotency store, keyset pagination, masked-404 gate classes, data-constitution CI gates, 638 vitest cases + 54 Playwright specs + 5 structural sweeps.
- **Identity (password path).** Argon2id, enumeration-proof by construction, rolling+absolute session expiry, step-up windows, recovery tokens.
- **SSR + structured data on public pages.** OG/Twitter meta, Product JSON-LD, canonical URLs, share sheet.

### B. Built but incomplete (real code, load-bearing gaps)

| Capability | What exists | The gap |
|---|---|---|
| **Notifications** | 14 outbox consumers, ~21 well-written letters, exactly-once ledger | **`SandboxMailer` is the only implementation. No email has ever left the machine.** Order confirmations, payout letters, dispute deadlines, password resets — all go to a log line. A "we'll tell you the moment it ships" promise exists in three places with **no dispatch letter behind it**. |
| **Passkeys** | Full WebAuthn stack, 4 endpoints | `MemoryChallengeStore` — broken on any multi-instance/serverless deploy (recorded debt D-40e). |
| **Rate limiting** | Sliding-window limiter, sensible per-endpoint budgets | Per-instance in-memory Map — **effectively decorative on Vercel**. |
| **Trust enforcement** | `enforcement_hold` checked in 20+ public reads; suspension cascade policy | **Nothing can ever set a hold.** No buyer report endpoint, no admin command, and the `standing_changed` event that drives the cascade has no emitter. Fully built, fully unreachable. |
| **Search** | Polished combobox, recent searches, keyboard support | Four `ILIKE '%q%'` queries, 5 results each, no ranking, no results page. |
| **Social primitives** | Fire/save/follow, anonymous-first, optimistic UI, live counts | Every signal is a `count(*)` displayed back to its author. **Nothing feeds ranking, notification, or recommendation.** |
| **Buyer identity** | Visitor cookie + claim-into-account at register | Orders are lost with cleared cookies; `guest_tokens` machinery is dormant. Registered debt (FOUNDER_REVIEW_C6_C9 §9.2). |
| **Workspace** | Shell, nav schema (14 modules), companion sentence, momentum | **7 of 14 modules are labeled mockups** (`WorkspaceComingSoon`): analytics, coupons, customers, inventory, marketing, returns, shipping. The promised Opportunity Card / posture engine (UX-WORKSPACE-001) never shipped. |
| **Ops** | 10 derived alarm kinds, 5 API endpoints, runbooks | **No operator UI.** Operators work by curl. Acceptable at cohort scale; a ceiling soon after. |
| **SEO** | SSR, JSON-LD, robots.txt | **No sitemap of any kind.** Crawlers can enumerate exactly one page of 60 shops. For a marketplace of independent storefronts this is the single cheapest unrealized growth asset. |
| **Store handles** | 4-state ledger (reserved/active/redirect/quarantined), one-hop redirect reads | Only `active` has a writer. Rename→redirect and reservation flows unbuilt. |

### C. Designed but not implemented (constitution exists, no code)

- **The entire ADR-005 Ignite engine:** Proposal Protocol, Autonomy Ledger, Moment Ledger, Import Dossiers, Recovery Journeys, Surface-Level de-escalation, personas, the Copilot. What shipped is the genesis flow plus one port (`IgniteIntelligence`) holding a keyword-table stub. **There is zero AI in the repository** — no SDK dependency, no model call. What *did* ship is the AI governance layer: `AIProvenance` invariants, R-class refusals compiled into composables, `ai_agent` principals. Rails without trains.
- **Discovery as a capability** (BCA C10, Release 3): ranking, browse, taxonomy. Today's street is `ORDER BY published_at DESC` by design ("recency is the product" was right for First Light; it is not a marketplace).
- **Commerce sub-capabilities CS2–CS5:** pricing engine, offer substrate (deals+coupons unified), collections, managed inventory postures. (Deals shipped as a *story* pointing at a product — deliberately not an offer; `sale_amount` on variants exists separately and is unlinked.)
- **Administration / Moderation domains**; the reviews system; the Notification domain proper; Analytics domain / Pulse; Media domain (a port + Blob adapter shipped instead); custom domains (one `citext` column, a capability row, zero code paths).

### D. Planned / deferred (explicitly, with records)

- RELEASE-001 X-1…X-14 exclusions (multi-currency, PayPal/ACH, store builder/themes, public API, custom staff roles…). C17 Advertising named-and-deferred. Gift cards / subscriptions / exchanges / CRM as registered seams. DAC7/VAT marketplace-of-record flagged for counsel "before C12/launch". Legal keystone pages (terms/returns/impressum) — an open launch gate with a Founder wording gate. Production launch gates G-3…G-11 of RELEASE-001 (pen test, SAQ-A attestation, load, DR drill, PII audit, a11y audit) unmet.

### E. Missing but strategically important (no design, no code, no register entry)

1. **Behavioral telemetry.** No page-view, impression, or click event is recorded anywhere. There is no data from which analytics, ranking, or recommendations could later be built. *This is the most consequential absence in the platform*, because it silently blocks three programs at once (discovery ranking, merchant analytics, AI).
2. **A buyer acquisition/retention loop of any kind.** No digest, no follow-notification, no sitemap enumeration, no referral (the last by constitutional law — see Part 13).
3. **Abuse intake.** No way for anyone to report anything.
4. **A landing/"why DOF" page.** `/` is the merchant workspace; anonymous buyers get the raw stream with a dismissible intro card.
5. **Reviews/reputation** (deliberately deferred, but its absence shapes the buyer trust story at the product decision point).
6. **Consolidated debt register.** Debt truth lives in at least four documents; `TECHNICAL_DEBT.md` stops at Module 1.

---

## PART 2 — THE BUYER TEST

Walking a completely new buyer through launch day:

| Step | Verdict | Evidence |
|---|---|---|
| **Arrive** | **Weak.** | No landing page. `/home` opens on a chronological stream with a dismissible intro. There is no "what is this place, why should I care" moment, no hero, no editorial, no categories. With a small cohort the street feels alive; with an empty region it renders an empty state and nothing else. |
| **Understand DOF** | **Confusing.** | The intro card is the entire explanation. Deals are *stories*, not discounts — nothing tells a buyer that; the name "Deals On Fire" sets an expectation the product deliberately subverts and never addresses. |
| **Discover something interesting** | **Empty — the weakest link in the platform.** | Discovery = reverse chronology + a following filter. Search is a substring dropdown with no results page. No categories, no browse, no "popular this week", no cross-store recommendations of any kind (the only "more like this" is three unranked items from the same shelf). An interested buyer has no second click. |
| **Trust the merchant** | **Ordinary.** | Storefront has story/promise/follower count — good bones. But no reviews, no sale count, no "fulfils on time" evidence, single product image. The trust machinery (standing, holds) is invisible where a buyer decides. |
| **Explore products** | **Basic.** | Product page is honest and well-made (JSON-LD, promise, availability) but single-image, no gallery, no Q&A, in-store search absent, no pagination on shelves. |
| **Engage** | **Good primitives, no consequence.** | Fire/save/follow work anonymously with optimistic UI — genuinely nice. But saving a deal changes nothing afterwards; following produces a badge, never a letter; engagement never improves what the buyer sees next. |
| **Buy** | **Strong. Differentiated.** | Anonymous-first checkout, visible money math, honest failure copy, no account wall, no upsells. This is the calmest checkout in the industry segment. |
| **Follow the order** | **Strong — the flagship.** | The order page (letters, timeline, "Meanwhile, in the workshop" sparks) is SX-1, the signature experience — the one screen a competitor would have to rebuild their ethos to copy. **But: the buyer never receives a single email** (sandbox mailer), and the promised dispatch notification does not exist as a letter at all. The flagship is invisible unless the buyer thinks to come back on their own. |
| **Return (to the platform)** | **Absent.** | Nothing calls a buyer back: no mail, no digest, no push, no new-since-your-visit letter. Retention currently equals "bookmarked the tab." |

**Summary:** DOF's buyer experience is an hourglass — wide, differentiated excellence at the transaction and post-purchase waist, and near-emptiness at both discovery (top) and retention (bottom). Commerce is strong; commerce has little value if buyers cannot discover things worth buying, and cannot be reminded that the place exists.

---

## PART 3 — THE MERCHANT TEST

| Step | Verdict |
|---|---|
| **Discover DOF → join → Ignite** | **Excellent.** The five-minute business is real. Ignite is the best-built surface in the product and lands the PDS-001 promise. |
| **Create products → publish** | **Excellent.** Conversational composer, advisory drafts, honest readiness. |
| **Attract buyers** | **Cliff.** After "Doors open," DOF offers: a share button. No SEO enumeration of their store, no place in any ranking (there is no ranking), no deal surfaces beyond the stream, no promotional tools, no way to be found by intent (search is substring over titles). |
| **Make first sale** | **Luck-dependent.** First sale depends entirely on the organic reach of a reverse-chronological stream. |
| **Fulfill → get paid** | **Excellent.** The bench, the promise clock, the money story, honest payout letters (unsent — see mailer). |
| **Understand performance** | **Nothing.** Four counters, one templated sentence, a 6-row activity list. **No views, no visitors, no conversion, no traffic source, no trend** — and no data collected from which any of it could be derived. A merchant with 500 visitors and no sales learns *nothing at all*. The `/analytics` nav row is a labeled mockup. |
| **Grow** | **Nothing.** Momentum nudges ("post a spark") are the entire growth toolkit. Coupons, marketing, customers: mockups. |

**The direct answer:** DOF today *allows* someone to create a store — superbly. It does not yet *help them become successful*. The help stops at the exact moment the merchant's anxiety starts: the silence after publishing. The merchant experience corpus (MERCHANT_DAILY_RHYTHM's 90-second visit, the receipts-not-points motivation system) is designed and waiting — but there are no receipts to show, because nothing measures the street.

---

## PART 4 — THE MARKETPLACE FLYWHEEL

> merchant joins → creates interesting inventory → buyers discover it → buyers engage → engagement improves discovery → merchants receive demand → merchants create more → more buyers arrive

| Link | State | Evidence |
|---|---|---|
| Merchant joins | **STRONG** | Ignite. |
| Creates interesting inventory | **STRONG** | Authoring, sparks, deals-as-stories. |
| Buyers discover it | **WEAK** | Recency-only stream, no search page, no browse, no sitemap. |
| Buyers engage | **PARTIAL** | Primitives live and pleasant; anonymous-first lowers friction. |
| Engagement improves discovery | **ABSENT** | No signal feeds any ordering. The projection registry that would power this has **zero projections registered**. |
| Merchants receive demand (and see it) | **ABSENT** | No telemetry, no analytics, no demand signal reaches the merchant. |
| Merchants create more | **PARTIAL** | Momentum nudges only; works when demand exists to echo. |
| More buyers arrive | **ABSENT** | No SEO enumeration, no mail, no sharing loop beyond a copy-link button. |

**Verdict: DOF does not yet have a flywheel — it has a well-machined crank** (merchant → inventory) **connected to nothing.** Three links are absent, and all three are absent for the same root cause: *the platform observes nothing about attention.* No impressions, no views, no click-throughs. Ranking, analytics, and acquisition loops all starve on the same missing data.

---

## PART 5 — DOF DIFFERENTIATION

**What is genuinely distinct today (defensible, shipped):**

1. **The voice and its enforcement.** The copy-truth law, the workshop vocabulary, banned words ("payable", "RMA", "processing"), letters instead of statuses. This is real product surface area, enforced in reviews, and Amazon/Shopify/Etsy structurally cannot adopt it without rebuilding their register.
2. **The Workshop Wait (SX-1).** The order page that turns waiting into connection — sparks from the maker's bench while your parcel is made. Uncopyable without the sparks substrate + the voice.
3. **Calm, anonymous-first commerce.** No account walls, no urgency manufacturing, no dark patterns — a checkout that respects people, structurally.
4. **Five-minute genesis.** Ignite's ceremony, resumable saga, no dead ends.
5. **Trust machinery in the substrate.** Escrow-shaped money, honest failure paths, audit immutability — invisible but real.
6. **Deals as stories.** A deliberate refusal of the coupon-site identity — a deal points at a real thing at its real price with a maker's words around it.

**Where the identity is NOT yet expressed:** the street itself. The metaphor promises a *living place* — stalls, faces, conversations, things happening. What renders is a reverse-chronological list. The community-driven-discovery pillar of PDS-001 (the one that makes "social commerce OS" true rather than aspirational) has primitives but no loop. Sparks and deals — the two most differentiating capabilities per PDS-001 — shipped **without any architecture document** and stopped at "exists."

**The honest differentiation audit against PDS-001's eight pillars:** two are shipped machinery (trust substrate, five-minute business), one is half-real (calm/beautiful default), and five are prose (opportunity-first, conversation-to-commerce loops, AI copilot, network loops, community discovery).

**The moat, if DOF builds it:** *the street that knows you* — community-signal-driven discovery of small makers, in a calm voice, connected to a workshop you can watch. Nobody in the market owns "discovery of small makers you'll actually trust, without the algorithmic screaming." Etsy has the inventory but sells attention back to sellers as ads; TikTok has the discovery energy but none of the trust or calm; Shopify has no discovery at all. That empty quadrant is DOF's.

---

## PART 6 — AI OPPORTUNITY REVIEW

**Ground truth:** zero AI exists in the repo. What exists is exceptional *readiness*: clean ports (`IgniteIntelligence`, authoring/identity intelligence), provenance invariants, R-class refusal composables, `ai_agent` principals, and a constitution (ADR-005) that is ahead of the industry on AI governance.

**AI that would create real product advantage (ordered):**

1. **Discovery ranking & semantic search** — *the highest-leverage and least glamorous.* At DOF's scale, embeddings + pgvector over products/sparks/deals gives semantic search and "more like this" across stores without a data-hungry recommender. This is AI that makes the *marketplace* better, not a feature that demos well. Prerequisite: the telemetry and search foundation (Part 10).
2. **Photo-first authoring** — photo → title/description/attributes draft behind the existing authoring port. Directly serves the Grandma Test and inventory quality (which discovery then amplifies). Small, contained, honest (provenance already modeled).
3. **Ignite intelligence** — replace the 40-keyword stub behind the existing port. Improves the already-best moment; incremental, not transformative.
4. **Trust & spam screening** — new-merchant content anomaly signals feeding a *moderation queue* (per ADR-002-A: proposals, never automatic takedown). Becomes necessary the day the street is open and discoverable; worthless before there's an intake to feed.
5. **Business Companion / Pulse sentences** — genuinely differentiating *later*, but it requires the analytics data that doesn't exist yet. AI summarizing nothing is nothing.

**AI that would merely be an impressive demo (refuse for now):** a chat panel ("Ask DOF anything"); AI-written sparks/deals (violates the merchant-signed-words law); autonomous pricing; the full ADR-005 proposal engine + Autonomy Ledger (Release-5 scale machinery with no operating data to propose from); AI-generated storefront themes.

**Strategic note:** DOF's AI constitution is a real asset — but constitutions don't compound; data does. Every month without telemetry is a month the future AI has nothing to learn from.

---

## PART 7 — GROWTH READINESS

| Mechanism | State |
|---|---|
| Repeat visits | **Absent.** No mail (sandbox), no digest, no push, no new-for-you letter. |
| Sharing | **Minimal.** Share sheet + copy link; OG cards good on the pages that have images. No share loops, no embeds. |
| Merchant acquisition | **Untested.** Ignite converts superbly once someone arrives; nothing brings them. |
| Buyer acquisition | **Absent.** No sitemap; crawlers can reach 60 shops max. No SEO enumeration of products/deals/sparks. |
| Organic content | **Real but invisible.** Sparks/deals/stories are exactly the content SEO and social distribution want — none of it is enumerable or distributed. |
| Network effects | **Not yet** (see Part 4). |
| SEO | **Half-built.** SSR + JSON-LD exist (rare and valuable); enumeration and internal linking absent. |
| Social distribution | **Manual only.** |
| Retention / habit | **Design exists** (daily rhythm, corner, following) — **no trigger exists** (nothing ever contacts anyone). |

**Biggest missing loops, in order of cheapness × impact:**
1. **Sitemap + SEO enumeration** (days of work, permanent compounding asset — every storefront and product a landing page).
2. **Real mail transport** (unlocks 21 already-written letters + order confirmations — table stakes, not even growth).
3. **The follow → letter loop** ("Rosa put something new on her shelf") — the first true retention trigger, and it uses only existing events.
4. **The weekly street/corner digest** (planned in ROADMAP.md Stream A, unbuilt).
5. **Impression/view telemetry** — not itself a loop, but the fuel for ranking and for merchants' demand signal.

---

## PART 8 — PROGRAM OPTIONS

Derived from the repository's actual state, five candidates:

### P1 — Launch Foundations (C12, redefined)
**Problem:** DOF cannot be put in front of the public at all: no real mail, decorative rate limiting, serverless-broken passkey challenges, dev-identity mode, no legal pages, no abuse intake, no backup drill, buyer orders die with cookies.
**Business value:** existential — everything else is theoretical until this lands. **Buyer value:** their order confirmation actually arrives; their orders survive; someone can act if they're scammed. **Merchant value:** their letters send; the platform is safe to stake a business on. **Differentiation:** none directly (but honesty *is* the brand, and unsent "we'll tell you" promises violate the copy-truth law today). **Dependencies:** none; unlocks everything. **Engineering complexity:** low-moderate (adapters behind existing ports; legal pages; a report endpoint + admin hold command; drills). **Operational complexity:** low. **Marketplace impact:** enables the market to exist. **If delayed:** no launch, no learning, and the certification-grade money machinery ages unused. **Increments: 2–3.**

### P2 — The Living Street (Discovery & Demand)
**Problem:** buyers cannot find anything; engagement feeds nothing; merchants are invisible after publishing; the platform observes no attention.
**Business value:** turns the crank into a flywheel; makes launch *mean* something. **Buyer value:** a second click — search that answers, a street with judgment (recency × life × diversity), shelves by kind, "more like this." **Merchant value:** discoverability + the first demand signals (views/impressions surfaced honestly). **Differentiation:** this is where "community-driven discovery" stops being prose — signals from fires/saves/follows finally matter. **Dependencies:** P1's mail for the follow-letter; the dormant projection registry finally earns its keep. **Engineering complexity:** moderate (pg FTS/trgm, telemetry table + ingestion, ranked feed as a projection, taxonomy-lite; no new infrastructure). **Operational complexity:** moderate (ranking is a tuning liability; mitigated by keeping recency as a visible voice). **Marketplace impact:** highest of any option — repairs three broken flywheel links. **If delayed:** launch strands the first merchant cohort exactly as the original M7 gate warned ("launching before Discovery exists strands early merchants"). **Increments: 5–7.**

### P3 — Merchant Evidence & Growth (Pulse v1)
**Problem:** merchants learn nothing after publishing; the workspace's promise ("sentences before charts") has no data behind it.
**Business value:** merchant retention; the platform's supply side stops churning in silence. **Buyer value:** indirect (better-tended shops). **Merchant value:** highest of any option — views, conversion, best-sellers, weekly note. **Differentiation:** receipts-not-points motivation, the Business Companion identity. **Dependencies:** hard-blocked by telemetry (P2 collects it) and mail (P1). **Complexity:** moderate. **Marketplace impact:** strengthens supply retention but does not create demand. **If delayed:** merchants publish into silence a while longer — tolerable *only if* discovery is meanwhile creating actual demand to report. **Increments: 3–4.**

### P4 — Trust & Reputation
**Problem:** no reviews, no reporting, unreachable enforcement, buyer trust at the decision point rests on the merchant's own words.
**Business value:** conversion + safety at scale. **Dependencies:** order volume for verified-purchase reviews to exist; intake minimum belongs in P1. **Complexity:** moderate-high (reputation is adversarial). **If delayed:** fine at cohort scale — dangerous at open scale. **Increments: 3–5.**

### P5 — AI Ignite & Companion (R5-lite)
**Problem:** the "AI-first" promise is a keyword table.
**Business value:** demo-brilliant, press-friendly; real cold-start value in authoring/Ignite. **Dependencies:** none technically (ports exist) — but its two highest-value applications (discovery ranking, companion sentences) depend on P2's data. **If delayed:** nothing degrades; the ports keep it cheap to add later. **Increments: 2–3 (contained) or 8+ (ADR-005 proper).**

---

## PART 9 — PRIORITIZATION

Scores 1–10; higher = better (for Implementation Risk and complexity-sensitive axes, higher = *more favorable*, i.e. lower risk).

| Axis | P1 Launch Foundations | P2 Living Street | P3 Merchant Evidence | P4 Trust & Reputation | P5 AI Ignite |
|---|---|---|---|---|---|
| Business Value | 10 | 9 | 7 | 6 | 5 |
| Buyer Impact | 6 | 10 | 3 | 7 | 3 |
| Merchant Impact | 7 | 8 | 10 | 5 | 6 |
| Flywheel Impact | 4 | 10 | 6 | 5 | 4 |
| Differentiation | 3 | 9 | 7 | 5 | 6 |
| Growth Potential | 5 | 10 | 6 | 4 | 4 |
| Technical Readiness | 10 | 8 | 5 (blocked on telemetry) | 6 | 7 |
| Implementation Risk (favorable) | 9 | 7 | 7 | 5 | 6 |
| Time to Value | 10 | 7 | 6 | 4 | 6 |
| **Total** | **64** | **78** | **57** | **47** | **47** |

**Rank: P2 Living Street › P1 Launch Foundations › P3 Merchant Evidence › P4 ≈ P5.**

P1 scores below P2 in total but is **sequentially prior** — it is a gate, not a program (see Part 11). P3 follows P2 naturally because P2 collects the very data P3 reports. P4's intake minimum moves into P1; the rest waits for volume. P5 waits for data, then rides on P2/P3's rails.

---

## PART 10 — RECOMMENDED NEXT PROGRAM

### The Living Street — Discovery & Demand

**One sentence:** make the street a place where things get *found* — by intent (search), by wandering (a ranked, living feed), by scent (recommendations), and by the outside world (SEO) — and let every signal a buyer gives improve the street while giving merchants their first honest evidence of demand.

**Why this one, without hedging:** Commerce is done and certified; the constraint on DOF's value has moved. Every serious walk of the platform — buyer test, merchant test, flywheel audit, differentiation audit — converges on the same emptiness: *attention is neither earned, observed, nor rewarded.* The original roadmap's own launch gate (M7: "launching before Discovery exists strands early merchants") says this; the PDS's moat (community-driven discovery) requires it; the merchants' cliff (Part 3) is downstream of it; the future AI (Part 6) starves without the data it collects. It is the only program that repairs three flywheel links at once, and it is buildable now — the substrate it needs (events, projections, engagement primitives, SSR) already exists, most of it dormant.

**Program objective:** a buyer who arrives with intent finds a real answer; a buyer who arrives idle finds a living street worth a second click; a merchant who publishes is found within days and can *see* that they were found.

**Business outcome:** the first measurable flywheel turn — organic search landings → storefront visits → engagement signals → improved placement → merchant-visible demand. Concretely: every product/store/deal/spark enumerable by crawlers; search that answers intent; a feed where placement is earned; impressions/views flowing into a merchant-visible counter.

**Buyer outcome:** discovery stops being empty — search page with ranked results, a street with judgment and voices, shelves by kind, "more from the street like this," and a follow that finally *does something* (the new-on-the-shelf letter).

**Merchant outcome:** discoverability + the first receipts: "142 people saw your shelf this week; 9 followed." The silence after "Doors open" ends.

**Major capabilities (high-level increment sequence):**
1. **Eyes and ears** — behavioral telemetry (impression/view/click events, privacy-respecting, no third parties) + full SEO enumeration (sitemap index: stores/products/deals/sparks; internal linking; WebSite+SearchAction JSON-LD). The data collection every later increment (and program) stands on.
2. **Search that answers** — Postgres FTS + trigram, a real `/search` results page with type facets, ranked by relevance × liveliness; the combobox becomes its door.
3. **The street learns judgment** — the ranked home feed as the platform's *first registered projection*: recency × engagement × diversity caps (no store dominates a page), with the chronological street preserved as an explicit voice ("Latest"). Fixes the maker-card bump defect and the exactly-48 cursor bug in the same motion.
4. **Ways in** — taxonomy-lite (the categories the authoring advisor already infers, made browsable), shelves by kind, deals browse page (the endpoint already exists unconsumed).
5. **Scent** — "more like this" within and across stores (co-engagement first; the embedding seam noted for the AI program).
6. **The street writes letters** — follow → new-listing/new-deal letters; the weekly corner note. (Consumes P1's mail transport; uses only existing events.)
7. **Demand receipts** — the honest minimum of merchant-visible attention numbers on the workspace (the bridge to the Merchant Evidence program).

**Explicit non-goals:** no personalization profiles (signals rank *things*, not *people*); no infinite-scroll engagement optimization; no ads or paid placement; no reviews (P4); no AI ranking models (the seams are cut, the models wait); no discount engine; no new domains — Discovery composes over commerce/catalog + engagement, in the composition-root pattern the street already uses.

**Dependencies:** Launch Foundations (Part 11) for mail + safety rails; taxonomy governance question (BCA-001 flagged it unowned — resolved here as taxonomy-*lite*, owned by catalog).

**Estimated size: 6 increments** (sequence above; 1 and 2 could land in parallel slices), each with the campaign discipline the commerce foundation proved: founder gate per increment, hostile review at the seams, honest copy throughout.

---

## PART 11 — C12 DECISION

**Answer: D + A — redefine C12, then execute it immediately, before the Living Street.**

C12 as inherited ("production hardening") is a grab-bag. Redefine it as **Launch Foundations**: the shortest honest path to *safe to put in front of strangers* —

1. Real mail transport behind `MailPort` (+ the missing dispatch letter — the copy-truth law demands it);
2. Durable rate limiting + WebAuthn challenge store (KV/Postgres adapters behind existing ports);
3. Retire dev-identity mode from every deployable path (the retrospective's own red line);
4. Legal keystone pages (terms/returns/impressum — Founder wording gate) + privacy-page truth pass;
5. Buyer accounts minimum: orders follow the person (claim machinery exists; finish the loop), email verification actually delivered;
6. Abuse intake minimum: a report endpoint + an operator hold command (the unreachable enforcement machinery gains its first two reachable ends);
7. Backup/restore drill, production env-var audit (TD-007), deploy checklist with webhook secrets;
8. C11 formal closure (certification document, merge, v1.43.0) — first, it is a day's work and the campaign's honest bookend.

**Why immediately and not alongside:** every item is either a legal/safety precondition or a single-adapter task behind an existing port — short, unambiguous, and blocking. Interleaving them with a product program would smear urgency across months. **Why not the old C12 wholesale:** load testing the street before the street is worth loading, and PCI attestation theater before a launch date, are effort spent on the wrong week's problem. The heavy formal gates (pen test, load pass, DR at scale, a11y audit) attach to the *public launch milestone* at the end of the Living Street, not to this runway.

**Estimated size: 2 increments.** Then the Living Street. Public launch gates close at its end, when there is a street worth opening.

---

## PART 12 — WHAT NOT TO BUILD (yet)

1. **The full ADR-005 AI engine (proposal protocol, autonomy ledger, copilots).** It is Release-5 machinery designed for a platform with operating data and volume. Built now it would propose from nothing, to no one. The ports keep it cheap to add at the right time; the governance layer is already ahead of need.
2. **Reviews & ratings.** Verified-purchase reviews require purchase volume; launched empty they become either a ghost town or an invitation to fabrication — both corrosive to the trust identity. Wait for order volume (post-Living-Street), then build it adversarially (P4).
3. **Coupons / discount engine / offers substrate (CS4) and C17 advertising.** DOF's deal identity is deliberately *not* discounts; a coupon engine now would blur the one identity decision that most distinguishes the street from a coupon site. Advertising monetization before organic discovery works would sell what doesn't yet exist.
4. **Messaging / discussions / communities.** Stranger-to-stranger surfaces demand moderation capacity (intake, queue, humans) DOF doesn't have. The merchant→buyer connection already has a working channel (sparks + order-page workshop wait). Build community after trust intake and volume exist.
5. **Store builder / themes / custom domains.** The brand-kit + handle system is enough for the founding cohort; a theme engine is a Shopify-shaped time sink that deepens the wrong differentiation. Custom domains (one column, zero code) wait for merchants who've outgrown the street — none exist yet.
6. **Multi-currency, additional payment methods, native apps, marketplace-wide cart.** Each multiplies surface area against the certified money core; none is asked for by the founding market (BE/EUR, cards+wallets, web).
7. **Projection-izing all reads / CQRS everywhere.** The registry earns its first projection with the ranked feed — and stops there until a second read genuinely hurts. Direct reads remain the law elsewhere.

---

## PART 13 — FOUNDER DECISIONS

Only what genuinely requires Founder judgment:

1. **Ratify the sequence:** C11 formal closure → Launch Foundations (redefined C12, 2 increments) → The Living Street (6 increments) → then Merchant Evidence. (Everything below assumes this.)
2. **The word-of-mouth law.** MOMENTS_WORTH_SHARING declares "word of mouth is the street's only growth engine *by law* — no ads, no referral mechanics." The Living Street's SEO/digest loops comply — but confirm whether this law also forbids, at launch: inviting the first cohort programmatically, referral-style "bring a maker" mechanics, or any paid acquisition experiment. This is a values boundary only the Founder can draw.
3. **Legal identity and market ratification.** Three entangled questions for counsel + Founder: (a) the terms/returns/impressum wording (open launch gate, Founder voice); (b) marketplace-of-record / DAC7 / VAT posture (flagged "before C12/launch" and still open); (c) formal ratification that the founding market is **Belgium/EUR** — the C11 certification hardened settlement law around it (`identity.country: 'be'`), and it should be a decided fact, not an inherited default.
4. **The buyer-facing name tension.** "Deals On Fire" promises discounts; the product deliberately sells *stories at honest prices*. Keep the name and reframe it on a landing page, or evolve the name before public launch — a brand decision with a deadline attached to the first stranger's visit.

Implementation details deliberately *not* asked: mail provider choice, KV store choice, search technology, taxonomy shape, ranking weights — engineering owns these under the existing laws.

---

## PART 14 — FINAL RECOMMENDATION

**CURRENT STATE.** DOF has a certified, production-grade commerce spine — money moves correctly, honestly, and recoverably, from checkout to real Stripe payouts — wrapped in the best-voiced merchant genesis and post-purchase experience in its segment. Around that spine: a discovery layer that is a chronological list, a growth layer that does not exist, a notification system that has never sent an email, and an AI story that is governance without intelligence. Roughly: **a five-star teller's window on an empty street.**

**BIGGEST PLATFORM GAP.** The platform is blind to attention. No impression, view, or click is recorded anywhere; engagement signals feed nothing; merchants see nothing; ranking and AI have nothing to learn from. One missing capability — behavioral telemetry feeding discovery — silently blocks the flywheel, the analytics promise, and the AI promise at once.

**BIGGEST BUSINESS OPPORTUNITY.** The empty quadrant nobody owns: *calm, community-signaled discovery of small makers you can trust* — Etsy's inventory without the ad-tax, TikTok's discovery energy without the screaming, backed by the workshop connection and copy-truth voice DOF has already shipped. The substrate (events, projections, engagement, SSR/JSON-LD) is built and mostly dormant; the moat is assembly, not invention.

**RECOMMENDED NEXT PROGRAM.** **The Living Street — Discovery & Demand** (6 increments), after a 2-increment **Launch Foundations** runway (redefined C12) and the mechanical formal closure of C11.

**WHY NOW.** Commerce is done — the constraint has moved to discovery, and every lens in this review (buyer walk, merchant cliff, flywheel audit, differentiation audit, AI readiness, the original M7 launch gate) lands on the same square. The program needs no new infrastructure, converts already-built dormant machinery into value, and every week of delay strands the founding merchants the commerce campaign was built to serve.

**WHAT COMES AFTER.** Merchant Evidence & Growth (Pulse v1) — reporting the demand the Living Street creates and measures; then Trust & Reputation as volume arrives; then AI behind the now-fed ports (semantic discovery, photo-first authoring, companion sentences). The formal launch gates (pen test, load, DR, a11y) close at the Living Street's end, on a street worth opening.

**TOP 3 FOUNDER DECISIONS.**
1. Ratify the sequence: C11 closure → Launch Foundations (C12 redefined) → The Living Street.
2. Engage counsel and settle legal identity: terms/returns/impressum wording, marketplace-of-record/DAC7 posture, and formal ratification of Belgium/EUR as the founding market.
3. Draw the growth-values boundary (scope of the word-of-mouth law) and resolve the name-versus-identity tension before the first stranger arrives.

---

*Sources: three full-repository surveys conducted 2026-08-08 (documentation corpus 86 docs; 33 app pages / 104 API routes; 6 domains / 27 migrations / 86 tables / 638+54 tests), the C1–C11 campaign records, and the live C11 certification evidence. Implementation was judged from code throughout; where documentation and code disagreed, code won.*
