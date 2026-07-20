-- Migration 0014 — deal engagement (Release 0.4, commerce-owned). Anonymous-first:
-- visitor_id is a long-lived cookie identity (claimable into a user later via the
-- identity claim seam). Idempotency lives in the schema: one reaction/save per
-- (deal, visitor), toggles are INSERT ON CONFLICT / DELETE detected-change.
CREATE TABLE deal_reactions (
  id           uuid PRIMARY KEY,
  deal_id      uuid NOT NULL REFERENCES deals (id) ON DELETE RESTRICT,
  business_id  uuid NOT NULL,
  visitor_id   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, visitor_id)
);
CREATE INDEX idx_deal_reactions_visitor ON deal_reactions (visitor_id, created_at DESC);

CREATE TABLE deal_saves (
  id           uuid PRIMARY KEY,
  deal_id      uuid NOT NULL REFERENCES deals (id) ON DELETE RESTRICT,
  business_id  uuid NOT NULL,
  visitor_id   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, visitor_id)
);
CREATE INDEX idx_deal_saves_visitor ON deal_saves (visitor_id, created_at DESC);
