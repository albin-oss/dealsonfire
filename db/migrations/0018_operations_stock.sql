-- Migration 0018 — Operations Batch 2: the stock spine + Reservations (Commerce
-- Foundation C2; ADR-006 §4/§0.3; BLUEPRINT-003; CDC-001 §2.2 frozen contracts).
-- StockItem is ADR-002 §7's InventoryRecord, homed in Operations (the ratified
-- amendment). The ledger is append-only (grant-immutable); on_hand is its cached
-- sum (S2 law — the recompute gate proves it). Untracked is the DEFAULT tracking
-- mode: most reservations are recorded no-op claims (uniform interface — Orders
-- never branches on tracking mode).

CREATE TABLE stock_items (
  id            uuid PRIMARY KEY,
  business_id   uuid NOT NULL,
  variant_id    uuid NOT NULL,                -- Commerce id BY VALUE (no FK — boundary law)
  location_id   uuid NOT NULL REFERENCES locations (id),  -- same-domain FK
  tracking_mode text NOT NULL DEFAULT 'untracked' CHECK (tracking_mode IN ('untracked','tracked')),
  on_hand       int  NOT NULL DEFAULT 0 CHECK (on_hand >= 0),  -- cached ledger sum (S2)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, location_id)
);
CREATE INDEX idx_stock_items_business ON stock_items (business_id);
CREATE INDEX idx_stock_items_location ON stock_items (location_id) WHERE tracking_mode = 'tracked';

-- append-only: every physical fact is one reason-coded, cause-referenced line
CREATE TABLE stock_ledger (
  id            uuid PRIMARY KEY,
  business_id   uuid NOT NULL,
  stock_item_id uuid NOT NULL REFERENCES stock_items (id),
  delta         int  NOT NULL CHECK (delta <> 0),
  reason        text NOT NULL CHECK (reason IN ('received','adjusted','sold','returned','damaged','counted')),
  cause_ref     jsonb NOT NULL DEFAULT '{}',   -- e.g. { reservation_id, order_line_id }
  actor         jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_ledger_item ON stock_ledger (stock_item_id, created_at);

-- Reservations (CDC-001 §2.2, frozen): idempotent on order_line_id; TTL-bound;
-- untracked/digital claims carry a NULL stock_item_id (the recorded no-op claim).
CREATE TABLE reservations (
  id            uuid PRIMARY KEY,
  order_line_id uuid NOT NULL UNIQUE,          -- the natural idempotency key
  business_id   uuid NOT NULL,
  variant_id    uuid NOT NULL,                 -- by value
  stock_item_id uuid REFERENCES stock_items (id),
  quantity      int  NOT NULL CHECK (quantity > 0 AND quantity <= 999),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','committed','released','expired')),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_active_item ON reservations (stock_item_id) WHERE status = 'active';
CREATE INDEX idx_reservations_expiry ON reservations (expires_at) WHERE status = 'active';
