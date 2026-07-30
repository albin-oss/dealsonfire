-- Migration 0023 — Returns (Commerce Foundation C9; ADR-006 returns module,
-- CDC-001 §2.3 choreography). The ReturnCase is Operations-owned physical truth;
-- the RESOLUTION is the decision (no duplicate approvals); returns APPEND to the
-- order's story — they never rewrite or rewind it (ADR-007 law).
CREATE TABLE return_cases (
  id             uuid PRIMARY KEY,
  business_id    uuid NOT NULL,
  order_id       uuid NOT NULL,               -- by value (Orders is another domain)
  store_id       uuid NOT NULL,
  state          text NOT NULL DEFAULT 'requested'
                   CHECK (state IN ('requested','authorized','resolved','declined')),
  reason_code    text NOT NULL CHECK (reason_code IN ('not_as_described','damaged','wrong_item','changed_mind','other')),
  buyer_comment  text,
  instructions   text,                        -- the maker's return instructions, their words
  tracking_ref   text,                        -- manual return tracking (buyer-entered)
  disposition    text CHECK (disposition IN ('restock','discard')),
  refund_minor   bigint CHECK (refund_minor >= 0),
  resolved_without_return boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_returns_order ON return_cases (order_id);
CREATE INDEX idx_returns_business_open ON return_cases (business_id) WHERE state IN ('requested','authorized');

CREATE TABLE return_case_lines (
  case_id  uuid NOT NULL REFERENCES return_cases (id),
  line_no  smallint NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (case_id, line_no)
);
