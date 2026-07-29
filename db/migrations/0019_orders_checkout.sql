-- Migration 0019 — Checkout saga + the immutable Order (Commerce Foundation C3;
-- ADR-007 §4/§5). The attempt is the saga's memory (K1: replays resume, never
-- duplicate); the order is a frozen promise record (O1) with an append-only
-- timeline (grant-immutable). Cross-domain ids BY VALUE throughout (boundary law).

-- ————————————————————————————————————————————— checkout_attempts (saga state)
CREATE TABLE checkout_attempts (
  id             uuid PRIMARY KEY,
  attempt_key    uuid NOT NULL UNIQUE,        -- the idempotency spine (A7-2)
  buyer_id       uuid NOT NULL,               -- visitor identity (the street's buyer)
  cart_id        uuid NOT NULL,
  business_id    uuid NOT NULL,
  store_id       uuid NOT NULL,
  step           text NOT NULL DEFAULT 'started'
                   CHECK (step IN ('started','reserving','reserved','authorizing','authorized','placing','placed','compensating','failed')),
  contact        jsonb NOT NULL DEFAULT '{}',  -- { name, email } — PII, masked in logs
  delivery       jsonb NOT NULL DEFAULT '{}',  -- address snapshot or pickup/digital marker
  quote          jsonb NOT NULL DEFAULT '{}',  -- frozen line snapshots + totals at begin
  reservation_ids jsonb NOT NULL DEFAULT '[]',
  auth_ref       text,
  failure_code   text,
  order_id       uuid,
  expires_at     timestamptz NOT NULL,         -- K3: attempt TTL ≤ reservation TTL
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempts_buyer ON checkout_attempts (buyer_id, created_at DESC);

-- ————————————————————————————————————————————— orders (the immutable promise record)
CREATE TABLE orders (
  id             uuid PRIMARY KEY,
  order_number   text NOT NULL,               -- human-friendly, per-store sequence
  attempt_key    uuid NOT NULL UNIQUE,        -- the last gate: one order per attempt, forever
  business_id    uuid NOT NULL,
  store_id       uuid NOT NULL,
  buyer_id       uuid NOT NULL,
  buyer_contact  jsonb NOT NULL,              -- frozen snapshot (PII)
  delivery       jsonb NOT NULL,              -- frozen snapshot (PII)
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  shipping_minor bigint NOT NULL DEFAULT 0,
  total_minor    bigint NOT NULL CHECK (total_minor >= 0),
  currency       char(3) NOT NULL,
  state          text NOT NULL DEFAULT 'placed'
                   CHECK (state IN ('placed','payment_pending','payment_failed','confirmed','in_fulfillment','partially_fulfilled','fulfilled','completed','cancelled')),
  placed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, order_number)
);
CREATE INDEX idx_orders_business ON orders (business_id, placed_at DESC);
CREATE INDEX idx_orders_buyer ON orders (buyer_id, placed_at DESC);

CREATE TABLE order_lines (
  order_id       uuid NOT NULL REFERENCES orders (id),
  line_no        smallint NOT NULL,
  variant_id     uuid NOT NULL,               -- by value
  product_id     uuid NOT NULL,               -- by value
  title          text NOT NULL,               -- frozen snapshot (O1)
  option_label   text,
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  quantity       int NOT NULL CHECK (quantity > 0),
  reservation_id uuid,                        -- by value into Operations
  line_state     text NOT NULL DEFAULT 'open'
                   CHECK (line_state IN ('open','reserved','committed','in_fulfillment','fulfilled','cancelled','returned')),
  PRIMARY KEY (order_id, line_no)
);

-- append-only: the order's diary (O3 — externally caused entries cite evidence)
CREATE TABLE order_timeline (
  id             uuid PRIMARY KEY,
  order_id       uuid NOT NULL REFERENCES orders (id),
  entry_type     text NOT NULL,               -- 'placed' | 'payment' | 'note' | consumed-fact kinds
  message        jsonb NOT NULL DEFAULT '{}', -- render data, PII-free
  actor          jsonb NOT NULL,
  evidence_event_id uuid,                     -- the consumed event, when externally caused
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_timeline_order ON order_timeline (order_id, occurred_at);

-- per-store human order numbers (the counter is orders-owned state)
CREATE TABLE order_counters (
  store_id  uuid PRIMARY KEY,
  next_no   bigint NOT NULL DEFAULT 1
);
