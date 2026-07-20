-- ============================================================
-- DOF LEARNING LEDGER (Release 1.4)
--
-- The smallest trustworthy readout of what is actually happening,
-- so the next release is selected by evidence rather than intuition.
-- Run via `npm run learning` (read-only transaction) or any psql.
--
-- HONESTY CONTRACT
-- • Aggregates only — no emails, no raw visitor ids, no PII in output.
-- • DOF persists NO visits/views/impressions (watermarks are cookies).
--   "Return activity" is therefore a PROXY: distinct calendar days on
--   which a visitor performed any engagement write.
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
