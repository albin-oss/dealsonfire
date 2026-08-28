-- LS-3 — lanes join the attention vocabulary (no new tables).
--
-- lane_view: someone stepped into a lane (query column carries the lane id —
-- a bounded slug, same retention/privacy law as search text).
-- lane_click: they chose a thing from inside it. Source 'lane' marks views
-- that arrived through lane doors. CHECK widening is additive: every existing
-- row still satisfies the new constraints.

ALTER TABLE attention_facts DROP CONSTRAINT attention_facts_event_type_check;
ALTER TABLE attention_facts ADD CONSTRAINT attention_facts_event_type_check CHECK (
  event_type IN ('feed_impression', 'store_view', 'product_view', 'deal_view', 'spark_view',
                 'search', 'search_click', 'lane_view', 'lane_click'));

ALTER TABLE attention_facts DROP CONSTRAINT attention_facts_source_check;
ALTER TABLE attention_facts ADD CONSTRAINT attention_facts_source_check CHECK (
  source IN ('home', 'shops', 'storefront', 'search', 'direct', 'lane'));

ALTER TABLE attention_facts DROP CONSTRAINT attention_shape;
ALTER TABLE attention_facts ADD CONSTRAINT attention_shape CHECK (
  (event_type IN ('search', 'lane_view') AND query IS NOT NULL AND subject_id IS NULL)
  OR (event_type NOT IN ('search', 'lane_view') AND subject_type IS NOT NULL AND subject_id IS NOT NULL));
