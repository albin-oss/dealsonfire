-- LS-5 — threads join the attention vocabulary (CHECK widening only).
-- source 'thread': a view that ARRIVED through a thread door (maker's voice,
-- nearby-on-the-street). The named consumer: do threads extend discovery —
-- does one opened thing lead to a second? Nothing else is recorded.

ALTER TABLE attention_facts DROP CONSTRAINT attention_facts_source_check;
ALTER TABLE attention_facts ADD CONSTRAINT attention_facts_source_check CHECK (
  source IN ('home', 'shops', 'storefront', 'search', 'direct', 'lane', 'thread'));
