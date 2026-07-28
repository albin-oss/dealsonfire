-- Migration 0017 — Orders domain: platform-machinery quartet + Cart (Commerce Foundation C1;
-- ADR-007 §4; COMMERCE_ARCHITECTURE §4.1). The quartet is a byte-mirror of 0006's shapes
-- (D-22). Carts are buyer-owned working documents: no reservations ever (A7-3), prices are
-- display hints re-quoted on read (C2), one active cart per (buyer, store) (C1).

-- ————————————————————————————————————————————— orders_domain_events
CREATE TABLE orders_domain_events (
  id             uuid PRIMARY KEY,
  business_id    uuid,
  aggregate_type text NOT NULL,
  aggregate_id   uuid NOT NULL,
  sequence       bigint NOT NULL,
  event_type     text NOT NULL,
  schema_version smallint NOT NULL DEFAULT 1,
  payload        jsonb NOT NULL,
  actor          jsonb NOT NULL,
  correlation_id uuid,
  causation_id   uuid,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, aggregate_id, sequence)
);
CREATE INDEX idx_orders_events_business ON orders_domain_events (business_id, occurred_at);
CREATE INDEX idx_orders_events_type ON orders_domain_events (event_type, occurred_at);

-- ————————————————————————————————————————————— orders_outbox_events (operational · windowed 7d)
CREATE TABLE orders_outbox_events (
  id              uuid PRIMARY KEY,
  domain_event_id uuid NOT NULL REFERENCES orders_domain_events (id),
  partition_key   uuid NOT NULL,
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','dead')),
  attempts        smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_outbox_pending ON orders_outbox_events (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_orders_outbox_pending_partition ON orders_outbox_events (partition_key, seq) WHERE status = 'pending';

-- ————————————————————————————————————————————— orders_event_deliveries (idempotency ledger)
CREATE TABLE orders_event_deliveries (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL REFERENCES orders_domain_events (id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- ————————————————————————————————————————————— orders_audit_logs (ledger · month-partitioned)
CREATE TABLE orders_audit_logs (
  id            uuid NOT NULL,
  business_id   uuid,
  actor         jsonb NOT NULL,
  command       text NOT NULL,
  sensitivity   text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal','sensitive')),
  target        jsonb NOT NULL DEFAULT '{}',
  before_digest jsonb NOT NULL DEFAULT '{}',
  after_digest  jsonb NOT NULL DEFAULT '{}',
  context       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_orders_audit_business ON orders_audit_logs (business_id, created_at DESC);
CREATE TABLE orders_audit_logs_default PARTITION OF orders_audit_logs DEFAULT;

CREATE FUNCTION orders_audit_logs_ensure_partition(month date) RETURNS void AS $$
DECLARE
  p_start date := date_trunc('month', month)::date;
  p_end   date := (date_trunc('month', month) + interval '1 month')::date;
  p_name  text := 'orders_audit_logs_' || to_char(p_start, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = p_name) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF orders_audit_logs FOR VALUES FROM (%L) TO (%L)', p_name, p_start, p_end);
  END IF;
END $$ LANGUAGE plpgsql;

SELECT orders_audit_logs_ensure_partition((date '2026-07-01' + (n || ' month')::interval)::date)
  FROM generate_series(0, 11) AS n;

-- ————————————————————————————————————————————— carts (the buyer's working document)
-- Cross-domain ids (store, business, variant, product) are BY VALUE — never FKs
-- (ADR-003 boundary law): a cart line must never block a merchant's catalog
-- operation, and Orders may not reach into Commerce/Merchant tables structurally.
CREATE TABLE carts (
  id          uuid PRIMARY KEY,
  buyer_kind  text NOT NULL DEFAULT 'visitor' CHECK (buyer_kind IN ('visitor','user')),
  buyer_id    uuid NOT NULL,           -- visitor id (the street's buyer identity; claimable)
  business_id uuid NOT NULL,
  store_id    uuid NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','merged','abandoned')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()  -- the abandonment clock (blueprint §5.2)
);
-- C1: one active cart per (buyer, store)
CREATE UNIQUE INDEX uq_carts_active_buyer_store ON carts (buyer_kind, buyer_id, store_id) WHERE status = 'active';
CREATE INDEX idx_carts_abandonment ON carts (updated_at) WHERE status = 'active';

-- lines purge WITH their cart explicitly (retention sweep) — no CASCADE (ADR-004 rule 12)
CREATE TABLE cart_lines (
  cart_id           uuid NOT NULL REFERENCES carts (id),
  variant_id        uuid NOT NULL,
  product_id        uuid NOT NULL,
  quantity          int NOT NULL CHECK (quantity > 0 AND quantity <= 99),
  -- display hints only (C2): what the buyer saw when the line landed; truth is
  -- re-quoted on read, and these keep the line honest if the catalog row is rewritten
  title_seen        text NOT NULL DEFAULT '',
  option_label_seen text,
  price_seen_minor  bigint,
  currency_seen     char(3),
  added_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, variant_id)
);
