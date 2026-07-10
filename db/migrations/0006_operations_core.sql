-- Migration 0006 — Operations Batch 1 (OPS-001-BLUEPRINT §3; ADR-006/BLUEPRINT-003 v1.1;
-- CDC-001). The Operations platform-machinery quartet (D-22 shapes, byte-mirrors of 0004)
-- plus `locations`. Stock tables land with Batch 2 (0007) — the OPS-001A brief splits the
-- blueprint's single migration per batch; forward-only law makes the split safe.

-- ————————————————————————————————————————————— operations_domain_events
-- (event · permanent · never-delete · unpartitioned per D-02: the per-aggregate sequence
-- UNIQUE is the optimistic-concurrency guard and cannot include a partition key)
CREATE TABLE operations_domain_events (
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
CREATE INDEX idx_operations_events_business ON operations_domain_events (business_id, occurred_at);
CREATE INDEX idx_operations_events_type ON operations_domain_events (event_type, occurred_at);

-- ————————————————————————————————————————————— operations_outbox_events (operational · windowed 7d)
CREATE TABLE operations_outbox_events (
  id              uuid PRIMARY KEY,
  domain_event_id uuid NOT NULL REFERENCES operations_domain_events (id),
  partition_key   uuid NOT NULL,
  seq             bigint GENERATED ALWAYS AS IDENTITY,  -- D-15: total insertion order, never uuid
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','dead')),
  attempts        smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_operations_outbox_pending ON operations_outbox_events (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_operations_outbox_pending_partition ON operations_outbox_events (partition_key, seq) WHERE status = 'pending';

-- ————————————————————————————————————————————— operations_event_deliveries (idempotency ledger)
CREATE TABLE operations_event_deliveries (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL REFERENCES operations_domain_events (id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- ————————————————————————————————————————————— operations_audit_logs (ledger · month-partitioned)
CREATE TABLE operations_audit_logs (
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
CREATE INDEX idx_operations_audit_business ON operations_audit_logs (business_id, created_at DESC);
CREATE TABLE operations_audit_logs_default PARTITION OF operations_audit_logs DEFAULT;

CREATE FUNCTION operations_audit_logs_ensure_partition(month date) RETURNS void AS $$
DECLARE
  p_start date := date_trunc('month', month)::date;
  p_end   date := (date_trunc('month', month) + interval '1 month')::date;
  p_name  text := 'operations_audit_logs_' || to_char(p_start, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = p_name) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF operations_audit_logs FOR VALUES FROM (%L) TO (%L)', p_name, p_start, p_end);
  END IF;
END $$ LANGUAGE plpgsql;

SELECT operations_audit_logs_ensure_partition((date '2026-07-01' + (n || ' month')::interval)::date)
  FROM generate_series(0, 11) AS n;

-- ————————————————————————————————————————————— locations (aggregate · tombstone via status)
-- ADR-006 §3 kinds; BLUEPRINT-003 L1–L4. business_id is a cross-domain value ref (no FK).
-- The Ghost default (kind 'home', system-authored) is the ONLY writer of is_default=true.
CREATE TABLE locations (
  id                  uuid PRIMARY KEY,
  business_id         uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('home','store','warehouse','fulfillment_center','partner','temporary','popup')),
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  address             jsonb,
  pickup_instructions text CHECK (char_length(pickup_instructions) <= 500),
  operating_window    jsonb,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  is_default          boolean NOT NULL DEFAULT false,
  sequence            bigint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- L4/OPS-001 §2: time-boxed kinds must declare their window
  CONSTRAINT chk_locations_window CHECK (kind NOT IN ('popup','temporary') OR operating_window IS NOT NULL)
);
CREATE INDEX idx_locations_business ON locations (business_id, status);
-- L1's big brother: exactly one ACTIVE default per business, forever.
CREATE UNIQUE INDEX uq_locations_default ON locations (business_id) WHERE is_default AND status = 'active';
