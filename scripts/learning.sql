-- ============================================================
-- DOF LEARNING LEDGER (Release 1.4)
--
-- The smallest trustworthy readout of what is actually happening,
-- so the next release is selected by evidence rather than intuition.
-- Run via `npm run learning` (read-only transaction) or any psql.
--
-- HONESTY CONTRACT
-- • Aggregates only — no emails, no raw visitor ids, no PII in output.
-- • Since LS-1, DOF persists bounded PASSIVE attention facts
--   (attention_facts: impressions/views/searches, 90-day retention,
--   never identity-minting — anonymous rows are glances, not people).
--   "Return activity" remains an engagement-write proxy; attention
--   sections are marked LS-1 and read the new table.
-- • Cross-sectional comparisons (story vs no-story, pulse vs none)
--   are CORRELATION. Nothing here establishes causation.
-- • Every definition lives in this file; changing one is a reviewed
--   code change, never a silent drift.
-- ============================================================

-- ——— shared definitions ————————————————————————————————————
-- engaging visitor : distinct visitor_id with ≥1 row in any of
--                    store_follows | deal_saves | deal_reactions | spark_reactions
-- possession holder: engaging visitor with ≥1 follow OR ≥1 save
--                    (fires alone are applause, not possession)
-- live store       : stores.status='live', no enforcement hold, not deleted
-- publication      : a published spark or deal (business-scoped)
-- active day proxy : one distinct date of engagement writes per visitor

-- @section E0 · Scale (read this first — it sizes every claim below)
SELECT
  (SELECT count(DISTINCT visitor_id) FROM (
     SELECT visitor_id FROM store_follows UNION SELECT visitor_id FROM deal_saves
     UNION SELECT visitor_id FROM deal_reactions UNION SELECT visitor_id FROM spark_reactions) v)::int AS engaging_visitors,
  (SELECT count(*) FROM stores WHERE status = 'live' AND enforcement_hold = 'none' AND deleted_at IS NULL)::int AS live_stores,
  (SELECT count(*) FROM sparks WHERE status = 'published')::int AS sparks_published,
  (SELECT count(*) FROM deals  WHERE status = 'published')::int AS deals_published,
  (SELECT count(*) FROM store_follows)::int AS follows,
  (SELECT count(*) FROM deal_saves)::int AS saves,
  (SELECT count(*) FROM identity_claims WHERE claim_type = 'visitor')::int AS corners_claimed;

-- @section E1 · Merchant momentum — do nudged merchants publish more?
-- Metric: publications per merchant, split by whether the merchant has
-- EVER had an actionable momentum fact (followers>0 OR an unsparked
-- on-store product). Cross-sectional; causation not established.
WITH pubs AS (
  SELECT business_id, published_at FROM sparks WHERE status = 'published'
  UNION ALL
  SELECT business_id, published_at FROM deals WHERE status = 'published'
), actionable AS (
  SELECT DISTINCT s.business_id FROM stores s
  WHERE EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id)
     OR EXISTS (SELECT 1 FROM listings l WHERE l.business_id = s.business_id AND l.status = 'published'
                AND NOT EXISTS (SELECT 1 FROM sparks sp WHERE sp.product_id = l.product_id AND sp.status = 'published'))
)
SELECT
  CASE WHEN a.business_id IS NOT NULL THEN 'actionable_facts' ELSE 'no_facts' END AS cohort,
  count(DISTINCT b.id)::int AS merchants,
  coalesce(round(avg(p.pub_count), 2), 0) AS avg_publications
FROM businesses b
LEFT JOIN actionable a ON a.business_id = b.id
LEFT JOIN (SELECT business_id, count(*)::int AS pub_count FROM pubs GROUP BY business_id) p ON p.business_id = b.id
GROUP BY 1 ORDER BY 1;

-- @section E2 · Merchant feedback — do merchants with earned payoff publish again sooner?
-- Metric: median hours between consecutive publications, split by whether
-- the merchant has EVER earned a fire or follower. Correlation only.
WITH pubs AS (
  SELECT business_id, published_at FROM sparks WHERE status = 'published'
  UNION ALL SELECT business_id, published_at FROM deals WHERE status = 'published'
), gaps AS (
  SELECT business_id,
         extract(epoch FROM published_at - lag(published_at) OVER (PARTITION BY business_id ORDER BY published_at)) / 3600 AS gap_hours
  FROM pubs
), earned AS (
  SELECT DISTINCT s.business_id FROM stores s
  WHERE EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id)
  UNION SELECT sp.business_id FROM spark_reactions r JOIN sparks sp ON sp.id = r.spark_id
  UNION SELECT d.business_id FROM deal_reactions r JOIN deals d ON d.id = r.deal_id
)
SELECT
  CASE WHEN e.business_id IS NOT NULL THEN 'has_earned_payoff' ELSE 'no_payoff_yet' END AS cohort,
  count(*) FILTER (WHERE g.gap_hours IS NOT NULL)::int AS publish_gaps_observed,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY g.gap_hours)::numeric, 1) AS median_gap_hours
FROM gaps g LEFT JOIN earned e ON e.business_id = g.business_id
WHERE g.gap_hours IS NOT NULL
GROUP BY 1 ORDER BY 1;

-- @section E3 · Merchant identity — do storied stores earn more follows?
-- Metric: follows per live store, split by presence of a non-empty brand story.
SELECT
  CASE WHEN coalesce(b.voice->>'story', '') <> '' THEN 'has_story' ELSE 'no_story' END AS cohort,
  count(DISTINCT s.id)::int AS live_stores,
  count(f.id)::int AS follows,
  round(count(f.id)::numeric / greatest(count(DISTINCT s.id), 1), 2) AS follows_per_store
FROM stores s
LEFT JOIN brand_kits b ON b.owner_type = 'store' AND b.owner_id = s.id
LEFT JOIN store_follows f ON f.store_id = s.id
WHERE s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
GROUP BY 1 ORDER BY 1;

-- @section E4 · Possession — does ownership deepen (multi-follow) and correlate with return?
-- Distribution of follows per ENGAGING visitor + active-day proxy by possession.
WITH engaging AS (
  SELECT visitor_id FROM store_follows UNION SELECT visitor_id FROM deal_saves
  UNION SELECT visitor_id FROM deal_reactions UNION SELECT visitor_id FROM spark_reactions
), per_visitor AS (
  SELECT e.visitor_id,
         (SELECT count(*) FROM store_follows f WHERE f.visitor_id = e.visitor_id)::int AS follows,
         (SELECT count(DISTINCT d) FROM (
            SELECT created_at::date d FROM store_follows WHERE visitor_id = e.visitor_id
            UNION SELECT created_at::date FROM deal_saves WHERE visitor_id = e.visitor_id
            UNION SELECT created_at::date FROM deal_reactions WHERE visitor_id = e.visitor_id
            UNION SELECT created_at::date FROM spark_reactions WHERE visitor_id = e.visitor_id) days)::int AS active_days
  FROM engaging e
)
SELECT
  CASE WHEN follows = 0 THEN '0 follows' WHEN follows = 1 THEN '1 follow'
       WHEN follows BETWEEN 2 AND 3 THEN '2–3 follows' ELSE '4+ follows' END AS bucket,
  count(*)::int AS visitors,
  round(avg(active_days), 2) AS avg_active_days_proxy
FROM per_visitor GROUP BY 1
ORDER BY min(follows);

-- @section E5 · Claim your corner — do possession-holders keep their corner?
-- eligible = engaging visitor with ≥1 follow OR ≥1 save (fires alone excluded).
WITH holders AS (
  SELECT visitor_id,
         EXISTS (SELECT 1 FROM store_follows f WHERE f.visitor_id = h.visitor_id) AS has_follows,
         EXISTS (SELECT 1 FROM deal_saves sv WHERE sv.visitor_id = h.visitor_id) AS has_saves
  FROM (SELECT visitor_id FROM store_follows UNION SELECT visitor_id FROM deal_saves) h
), claimed AS (
  SELECT claim_ref FROM identity_claims WHERE claim_type = 'visitor'
)
SELECT
  count(*)::int AS eligible_possession_holders,
  count(*) FILTER (WHERE c.claim_ref IS NOT NULL)::int AS claimed,
  round(100.0 * count(*) FILTER (WHERE c.claim_ref IS NOT NULL) / greatest(count(*), 1), 1) AS claim_rate_pct,
  count(*) FILTER (WHERE c.claim_ref IS NOT NULL AND h.has_follows)::int AS claims_with_follows,
  count(*) FILTER (WHERE c.claim_ref IS NOT NULL AND h.has_saves)::int AS claims_with_saves,
  count(*) FILTER (WHERE c.claim_ref IS NOT NULL AND h.has_follows AND h.has_saves)::int AS claims_with_both
FROM holders h LEFT JOIN claimed c ON c.claim_ref = h.visitor_id::text;

-- @section E6 · Content supply — does Home feel different each day?
WITH pubs AS (
  SELECT business_id, published_at, 'spark' AS kind FROM sparks WHERE status = 'published'
  UNION ALL SELECT business_id, published_at, 'deal' FROM deals WHERE status = 'published'
), gaps AS (
  SELECT extract(epoch FROM published_at - lag(published_at) OVER (PARTITION BY business_id ORDER BY published_at)) / 3600 AS gap_hours
  FROM pubs
)
SELECT
  (SELECT count(DISTINCT business_id) FROM pubs WHERE published_at > now() - interval '1 day')::int  AS merchants_active_1d,
  (SELECT count(DISTINCT business_id) FROM pubs WHERE published_at > now() - interval '7 days')::int AS merchants_active_7d,
  (SELECT count(DISTINCT business_id) FROM pubs WHERE published_at > now() - interval '30 days')::int AS merchants_active_30d,
  (SELECT round(count(*) FILTER (WHERE kind = 'spark')::numeric / greatest(count(DISTINCT business_id), 1), 1) FROM pubs)  AS sparks_per_publishing_merchant,
  (SELECT round(count(*) FILTER (WHERE kind = 'deal')::numeric / greatest(count(DISTINCT business_id), 1), 1) FROM pubs)   AS deals_per_publishing_merchant,
  (SELECT round(100.0 * count(DISTINCT s.id) FILTER (WHERE EXISTS (
       SELECT 1 FROM pubs p WHERE p.business_id = s.business_id AND p.published_at > now() - interval '7 days'))
     / greatest(count(DISTINCT s.id), 1), 1)
   FROM store_follows f JOIN stores s ON s.id = f.store_id)                                          AS followed_stores_fresh_7d_pct,
  (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_hours)::numeric, 1) FROM gaps WHERE gap_hours IS NOT NULL) AS median_publish_gap_hours;

-- @section LS1a · Attention — what the street was shown vs what people stopped for
-- (impressions vs views; people = DISTINCT known visitors, glances = anonymous rows)
SELECT
  event_type,
  count(*)                                                     AS facts,
  count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) AS people,
  count(*) FILTER (WHERE visitor_id IS NULL)                   AS glances
FROM attention_facts
WHERE occurred_at > now() - interval '7 days'
GROUP BY event_type
ORDER BY facts DESC;

-- @section LS1b · The street's vocabulary — what people search for (top 20, 30 days)
SELECT query, count(*) AS asked,
       count(*) FILTER (WHERE had_results = false) AS unanswered
FROM attention_facts
WHERE event_type = 'search' AND occurred_at > now() - interval '30 days'
GROUP BY query
ORDER BY asked DESC, query
LIMIT 20;

-- @section LS1c · The missing words — searches the street could not answer (30 days)
-- Each row is a gap: a real person looked for something and found nothing.
SELECT query, count(*) AS asked
FROM attention_facts
WHERE event_type = 'search' AND had_results = false
  AND occurred_at > now() - interval '30 days'
GROUP BY query
HAVING count(*) >= 2   -- twice = a pattern, once = a typo until proven otherwise
ORDER BY asked DESC, query
LIMIT 20;

-- @section LS1d · Doors — where attention enters from (views by source, 7 days)
SELECT source, count(*) AS views,
       count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) AS people
FROM attention_facts
WHERE event_type IN ('store_view', 'product_view', 'deal_view', 'spark_view')
  AND occurred_at > now() - interval '7 days'
GROUP BY source
ORDER BY views DESC;

-- @section LS2a · Search health — zero-result rate and click-through (30 days)
-- The two numbers that judge LS-2: how often the street had no answer, and how
-- often an answer was chosen. Vanity-free: both improve only when search improves.
SELECT count(*) FILTER (WHERE event_type = 'search') AS searches,
       round(100.0 * count(*) FILTER (WHERE event_type = 'search' AND had_results = false)
             / greatest(count(*) FILTER (WHERE event_type = 'search'), 1), 1) AS zero_result_pct,
       round(100.0 * count(*) FILTER (WHERE event_type = 'search_click')
             / greatest(count(*) FILTER (WHERE event_type = 'search' AND had_results = true), 1), 1) AS click_through_pct
FROM attention_facts
WHERE event_type IN ('search', 'search_click') AND occurred_at > now() - interval '30 days';

-- @section LS2b · What kind of thing search finds — clicked-entity distribution (30 days)
-- If one entity type never earns clicks, its results are noise in the groups.
SELECT subject_type, count(*) AS clicks
FROM attention_facts
WHERE event_type = 'search_click' AND occurred_at > now() - interval '30 days'
GROUP BY subject_type
ORDER BY clicks DESC;

-- @section LS3a · Lanes — entrances and follow-through (30 days)
-- A lane earns its place when people step in AND choose something inside.
SELECT v.query AS lane,
       count(*) FILTER (WHERE v.event_type = 'lane_view') AS entrances,
       count(*) FILTER (WHERE v.event_type = 'lane_click') AS chose_something
FROM attention_facts v
WHERE v.event_type IN ('lane_view', 'lane_click') AND v.occurred_at > now() - interval '30 days'
GROUP BY v.query
ORDER BY entrances DESC;

-- @section LS3b · New-maker reachability — do young shops get found through lanes? (30 days)
-- The LS-3 fairness promise: a shop under 30 days old should receive discovery
-- through lane doors, not only exact-name search.
SELECT count(*) FILTER (WHERE f.source = 'lane') AS via_lanes,
       count(*) FILTER (WHERE f.source = 'search') AS via_search,
       count(*) FILTER (WHERE f.source NOT IN ('lane', 'search')) AS via_other
FROM attention_facts f
JOIN stores s ON s.id = f.subject_id
WHERE f.event_type = 'store_view' AND f.subject_type = 'store'
  AND s.published_at > now() - interval '30 days'
  AND f.occurred_at > now() - interval '30 days';

-- @section LS4a · The street pulse — why each of the top items is there
-- The operator's "why is this here?": every factor visible, no dashboard.
-- fresh = the freshness term; people = distinct intentional actors (7d);
-- stops = distinct identified viewers; glances = raw exposure (never evidence).
SELECT rp.subject_type, left(rp.subject_id::text, 8) AS subject,
       round(exp(-extract(epoch FROM (now() - rp.published_at)) / 3600.0 / 72)::numeric, 3) AS fresh,
       rp.people_7d AS people, rp.stops_7d AS stops, rp.glances_7d AS glances,
       round((exp(-extract(epoch FROM (now() - rp.published_at)) / 3600.0 / 72)
              + 0.35 * ln(1 + rp.people_7d) + 0.10 * ln(1 + rp.stops_7d))::numeric, 3) AS score,
       s.enforcement_hold <> 'none' AS held_hidden_at_read
FROM rm_street_pulse rp JOIN stores s ON s.id = rp.store_id
ORDER BY score DESC
LIMIT 15;

-- @section R0 · Reality census — how much of this readout is synthetic?
-- The Reality Ledger (LS-8): stores split by seed-registry membership
-- (contracts/learning/seed-registry.ts — dev-demo's deterministic principals),
-- and behavioral facts attached to each class. Any number quoted from the
-- sections above must be read against this census: a report may never call
-- seeded activity "people". Cohort/production environments must contain ZERO
-- seeded stores (dev-demo never runs there).
WITH seeded AS (
  SELECT DISTINCT st.id FROM stores st
  JOIN staff_memberships sm ON sm.business_id = st.business_id
  WHERE sm.principal_id IN (
    '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888')
)
SELECT (SELECT count(*) FROM stores WHERE status = 'live') AS live_stores,
       (SELECT count(*) FROM seeded) AS seeded_stores,
       (SELECT count(*) FROM attention_facts f WHERE f.store_id IN (SELECT id FROM seeded)) AS facts_on_seeded,
       (SELECT count(*) FROM attention_facts f WHERE f.store_id IS NOT NULL AND f.store_id NOT IN (SELECT id FROM seeded)) AS facts_on_real;

-- @section LS4b · Exposure honesty — interest per unit of being-shown (30 days)
-- LS-4's distinct-person law stops one person becoming a crowd; it does NOT
-- correct exposure bias (a thing shown 10,000 times has more chances to earn
-- people than one shown 50 times). This readout exists so judgment can see
-- that bias; sample-guarded (≥50 impressions) so tiny ratios never mislead.
-- MEASUREMENT ONLY: the production ranking formula does not consume this.
SELECT rp.subject_type, left(rp.subject_id::text, 8) AS subject,
       rp.glances_7d AS impressions, rp.stops_7d AS viewers, rp.people_7d AS people,
       round(rp.people_7d::numeric / greatest(rp.glances_7d, 1), 4) AS people_per_glance
FROM rm_street_pulse rp
WHERE rp.glances_7d >= 50
ORDER BY people_per_glance DESC
LIMIT 15;

-- @section LS5a · Threads — does one opened thing lead to another? (30 days)
-- The only question threads answer to: views that ARRIVED through a thread
-- door, and whether those visitors kept going (any further identified act
-- or view afterward that day). No click-count vanity.
WITH thread_arrivals AS (
  SELECT f.visitor_id, f.subject_type, f.subject_id, f.occurred_at
  FROM attention_facts f
  WHERE f.source = 'thread' AND f.event_type IN ('store_view', 'product_view', 'deal_view', 'spark_view')
    AND f.occurred_at > now() - interval '30 days'
)
SELECT count(*) AS thread_arrivals,
       count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) AS people,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM attention_facts g
         WHERE g.visitor_id = thread_arrivals.visitor_id AND g.visitor_id IS NOT NULL
           AND g.occurred_at > thread_arrivals.occurred_at
           AND g.occurred_at < thread_arrivals.occurred_at + interval '1 hour'
           AND (g.subject_id IS DISTINCT FROM thread_arrivals.subject_id)
       )) AS continued_within_the_hour
FROM thread_arrivals;

-- @section LS6a · The return journey — do follows create return value? (30 days)
-- The honest return question: of visitors who FOLLOW something, how many came
-- back on a LATER calendar day and had genuine followed-shop change waiting?
-- Modest language: engaged pseudonymous visitors, not "users". Cookies are not
-- humans — this counts distinct visitor identities, stated as such.
WITH followers AS (
  SELECT DISTINCT visitor_id FROM store_follows WHERE visitor_id IS NOT NULL
),
return_days AS (   -- distinct calendar days each follower performed any engagement write
  SELECT visitor_id, count(DISTINCT d) AS active_days FROM (
    SELECT visitor_id, date_trunc('day', created_at) AS d FROM store_follows WHERE visitor_id IS NOT NULL
    UNION
    SELECT visitor_id, date_trunc('day', created_at) FROM deal_reactions WHERE visitor_id IS NOT NULL
    UNION
    SELECT visitor_id, date_trunc('day', created_at) FROM deal_saves WHERE visitor_id IS NOT NULL
    UNION
    SELECT visitor_id, date_trunc('day', created_at) FROM spark_reactions WHERE visitor_id IS NOT NULL
  ) acts WHERE visitor_id IN (SELECT visitor_id FROM followers) GROUP BY visitor_id
)
SELECT (SELECT count(*) FROM followers) AS following_visitors,
       count(*) FILTER (WHERE active_days >= 2) AS returned_on_a_later_day
FROM return_days;
