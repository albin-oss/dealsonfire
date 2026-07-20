-- Migration 0013 — Deals, the SOCIAL half (Release 0.3). A Deal is a shareable promotion
-- story over one published product on one channel. Deliberately carries NO price effect:
-- ADR-002 §12's value strategy arrives with CS4 Offers (an offer_id column joins then —
-- the seam, named now). Public visibility = deal published ∧ the product's visibility
-- conjunction (VISIBILITY_CONTRACT §1) — a deal can never leak a hidden product.
CREATE TABLE deals (
  id            uuid PRIMARY KEY,
  business_id   uuid NOT NULL,   -- merchant-owned: integrity by contract (ADR-004 rule 12)
  product_id    uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  channel_id    uuid NOT NULL,   -- the store; merchant-owned, no FK by design
  headline      text NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 90),
  story         text CHECK (story IS NULL OR char_length(story) <= 600),
  status        text NOT NULL DEFAULT 'published' CHECK (status IN ('published','ended')),
  published_at  timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deals_business ON deals (business_id, published_at DESC);
CREATE INDEX idx_deals_channel_live ON deals (channel_id) WHERE status = 'published';
CREATE INDEX idx_deals_product ON deals (product_id);
