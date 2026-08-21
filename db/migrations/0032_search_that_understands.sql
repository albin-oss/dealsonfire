-- LS-2 — search that understands the street (indexes only; no new tables).
--
-- PostgreSQL-native: full-text vectors for word/stem matching (singular/plural,
-- word order), pg_trgm for typo rescue on names/titles. Every expression here
-- is repeated VERBATIM by street-search.ts — an index that doesn't serve the
-- real query is decoration. Weighting law: what a thing IS CALLED (A) beats
-- what is SAID ABOUT it (B) beats the longer story around it (C).
-- Visibility is enforced in the queries (status/hold/deleted), never here:
-- indexes cover all rows so a store coming back from a hold is instantly
-- findable again without a reindex.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- stores: the name is the strongest handle a stranger has
CREATE INDEX idx_fts_stores_name ON stores
  USING gin (to_tsvector('english', name));
CREATE INDEX idx_trgm_stores_name ON stores
  USING gin (lower(name) gin_trgm_ops);

-- brand voice: tagline (B) + story/promise (C) — the maker's own words are
-- discovery language ("candles that smell like somewhere")
CREATE INDEX idx_fts_brand_voice ON brand_kits
  USING gin ((
    setweight(to_tsvector('english', coalesce(voice->>'tone', '')), 'B') ||
    setweight(to_tsvector('english', coalesce(voice->>'story', '')), 'C') ||
    setweight(to_tsvector('english', coalesce(voice->>'promise', '')), 'C')
  ));

-- products: title (A) + the plain description content (B)
CREATE INDEX idx_fts_products ON products
  USING gin ((
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', coalesce(description->>'content', '')), 'B')
  ));
CREATE INDEX idx_trgm_products_title ON products
  USING gin (lower(title) gin_trgm_ops);

-- deals: headline (A) + story (B)
CREATE INDEX idx_fts_deals ON deals
  USING gin ((
    setweight(to_tsvector('english', headline), 'A') ||
    setweight(to_tsvector('english', coalesce(story, '')), 'B')
  ));

-- sparks: the body IS the content (B — a spark is all voice)
CREATE INDEX idx_fts_sparks ON sparks
  USING gin (to_tsvector('english', body));
