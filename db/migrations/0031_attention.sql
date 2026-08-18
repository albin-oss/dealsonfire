-- LS-1 (Living Street): the attention layer. One append-only table of passive
-- attention facts — what the street was SHOWN and what people STOPPED FOR —
-- distinct by law from engagement facts (explicit acts: follow/save/fire live
-- in their own tables and are never re-recorded here).
--
-- Privacy posture (the no-tracking-by-default law holds):
--  - visitor_id attaches ONLY when the dof_visitor cookie already exists from
--    an engagement act — the beacon NEVER mints identity; anonymous rows are
--    "glances", never "people"
--  - no raw IPs, no user agents, no fingerprints
--  - retention 90 days, enforced on the cron clock (bounded batches)
--
-- Every event type has a NAMED consumer (LIVING_STREET_PROGRAM_PLAN §6):
--  feed_impression → ranking must separate shown from wanted (LS-4)
--  *_view + source → merchant demand receipts (LS-7), related discovery (LS-5)
--  search          → the street's real vocabulary; zero-result gaps (LS-2)
--  search_click    → the only honest relevance judgment (LS-2)

CREATE TABLE attention_facts (
  id           uuid PRIMARY KEY,
  event_type   text NOT NULL CHECK (event_type IN (
                 'feed_impression', 'store_view', 'product_view',
                 'deal_view', 'spark_view', 'search', 'search_click')),
  -- what was attended to (null for 'search' — the query is the subject)
  subject_type text CHECK (subject_type IN ('store', 'product', 'deal', 'spark')),
  subject_id   uuid,
  -- denormalized owner so demand receipts read one index, not four joins
  store_id     uuid,
  -- where attention came from: the street answer to "what brought them here"
  source       text NOT NULL CHECK (source IN (
                 'home', 'shops', 'storefront', 'search', 'direct')),
  -- pseudonymous, pre-existing only; NULL = anonymous glance
  visitor_id   uuid,
  -- search events only: normalized (lowercased, trimmed, ≤ 80 chars) query
  -- text and whether the street had an answer
  query        text CHECK (query IS NULL OR char_length(query) <= 80),
  had_results  boolean,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  -- subject events carry a subject; search events carry a query
  CONSTRAINT attention_shape CHECK (
    (event_type = 'search' AND query IS NOT NULL AND subject_id IS NULL)
    OR (event_type <> 'search' AND subject_type IS NOT NULL AND subject_id IS NOT NULL)
  )
);

-- the consumers' three doors: by subject (related discovery), by owner
-- (demand receipts), by vocabulary (search work); retention sweeps by time
CREATE INDEX idx_attention_subject ON attention_facts (subject_type, subject_id, occurred_at DESC);
CREATE INDEX idx_attention_store   ON attention_facts (store_id, occurred_at DESC) WHERE store_id IS NOT NULL;
CREATE INDEX idx_attention_search  ON attention_facts (event_type, occurred_at DESC) WHERE event_type IN ('search', 'search_click');
CREATE INDEX idx_attention_sweep   ON attention_facts (occurred_at);
