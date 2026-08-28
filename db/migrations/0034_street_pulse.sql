-- LS-4 — rm_street_pulse: the first registered read model (ADR-004 rule 16).
--
-- DERIVED discovery state, never a source of truth: one row per visible feed
-- subject, carrying the distinct-PEOPLE evidence the pulse score reads. The
-- ProjectionRegistry owns this table from here on (shadow rebuild + atomic
-- swap, version-stamped comment); this migration only makes its first deploy
-- constitutional (manifest-first, migration-created). Score is computed at
-- READ time from these columns — scoring-law changes need no rebuild, only a
-- version bump when the SCHEMA changes.
--
-- The counting law (manipulation resistance by construction):
--   people_7d  = DISTINCT identified visitors who acted INTENTIONALLY
--                (follow/save/fire/search-click/lane-click, 7 days)
--   stops_7d   = DISTINCT identified visitors who viewed (meaningful views)
--   glances_7d = raw impressions — EXPOSURE only, never positive evidence
-- One visitor hammering a thing forever counts as ONE person. Anonymous
-- traffic can never become people.

CREATE TABLE rm_street_pulse (
  subject_type text NOT NULL CHECK (subject_type IN ('store', 'product', 'deal', 'spark')),
  subject_id   uuid NOT NULL,
  store_id     uuid NOT NULL,
  published_at timestamptz NOT NULL,
  people_7d    int NOT NULL DEFAULT 0,
  stops_7d     int NOT NULL DEFAULT 0,
  glances_7d   int NOT NULL DEFAULT 0,
  built_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_type, subject_id)
);
CREATE INDEX idx_rm_street_pulse_store ON rm_street_pulse (store_id);
CREATE INDEX idx_rm_street_pulse_fresh ON rm_street_pulse (published_at DESC);
