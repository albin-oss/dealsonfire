-- Migration 0021 — Shipping & Fulfillment (Commerce Foundation C6; ADR-006 shipping
-- module v1; ORR-corrected definition of done). One profile per store (flat rate,
-- free-over, pickup, handling days); fulfillment cases group order lines by method;
-- the ship-by promise is SNAPSHOTTED onto the immutable order at confirm (ADR-007
-- PromiseSnapshot — the date the keystone's aging path enforces).

CREATE TABLE shipping_profiles (
  id              uuid PRIMARY KEY,
  business_id     uuid NOT NULL,
  store_id        uuid NOT NULL UNIQUE,        -- by value; v1: one profile per store
  handling_days   int  NOT NULL DEFAULT 3 CHECK (handling_days BETWEEN 0 AND 60),
  flat_rate_minor bigint NOT NULL DEFAULT 0 CHECK (flat_rate_minor >= 0),
  free_over_minor bigint CHECK (free_over_minor >= 0),
  pickup_enabled  boolean NOT NULL DEFAULT false,
  currency        char(3) NOT NULL DEFAULT 'EUR',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipping_profiles_business ON shipping_profiles (business_id);

CREATE TABLE fulfillment_cases (
  id              uuid PRIMARY KEY,
  business_id     uuid NOT NULL,
  order_id        uuid NOT NULL,               -- by value (Orders is another domain)
  store_id        uuid NOT NULL,
  method          text NOT NULL CHECK (method IN ('ship','pickup','digital')),
  state           text NOT NULL DEFAULT 'open'
                    CHECK (state IN ('open','packed','dispatched','ready','collected','granted','closed')),
  tracking_carrier text,
  tracking_ref    text,
  parcel_media_id uuid,                        -- the wrapping-paper moment (optional, never demanded)
  packed_at       timestamptz,
  dispatched_at   timestamptz,
  handed_over_at  timestamptz,                 -- pickup collection / digital grant instant
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cases_order ON fulfillment_cases (order_id);
CREATE INDEX idx_cases_business_open ON fulfillment_cases (business_id) WHERE state IN ('open','packed','ready');

CREATE TABLE fulfillment_case_lines (
  case_id   uuid NOT NULL REFERENCES fulfillment_cases (id),
  line_no   smallint NOT NULL,
  quantity  int NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (case_id, line_no)
);

-- ————— line-level kind snapshot (digital lines grant instantly; frozen at placement)
ALTER TABLE order_lines ADD COLUMN fulfillment_kind text NOT NULL DEFAULT 'physical'
  CHECK (fulfillment_kind IN ('physical','digital','service'));

-- ————— the promise snapshot + aging clock + hold release on the order (ADR-007
-- header fields written once at confirm; aging_stage is the keystone's ratchet)
ALTER TABLE orders ADD COLUMN promise_ship_by timestamptz;
ALTER TABLE orders ADD COLUMN delivery_method text NOT NULL DEFAULT 'ship'
  CHECK (delivery_method IN ('ship','pickup','digital'));
ALTER TABLE orders ADD COLUMN aging_stage smallint NOT NULL DEFAULT 0
  CHECK (aging_stage BETWEEN 0 AND 3);
ALTER TABLE orders ADD COLUMN hold_released_at timestamptz;
CREATE INDEX idx_orders_aging ON orders (promise_ship_by)
  WHERE state IN ('confirmed','in_fulfillment','partially_fulfilled') AND aging_stage < 3;
CREATE INDEX idx_orders_hold ON orders (state) WHERE hold_released_at IS NULL AND state IN ('fulfilled','partially_fulfilled','completed');
