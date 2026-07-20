-- Migration 0015 — store follows (Release 0.4, merchant-owned: the store is the thing
-- being followed). Same anonymous-first visitor identity as deal engagement.
CREATE TABLE store_follows (
  id           uuid PRIMARY KEY,
  store_id     uuid NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
  business_id  uuid NOT NULL,
  visitor_id   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, visitor_id)
);
CREATE INDEX idx_store_follows_visitor ON store_follows (visitor_id, created_at DESC);
