-- Migration 0004 — Commerce platform-machinery instances (D-22: one implementation,
-- per-domain tables; ADR-003 §3 / ADR-004 rule 15). Shapes mirror the merchant twins
-- exactly, including the D-15 seq column and the D-02 partitioning exception.

-- ————————————————————————————————————————————— commerce_domain_events
-- (event · permanent · never-delete · unpartitioned per D-02: the per-aggregate sequence
-- UNIQUE is the optimistic-concurrency guard and cannot include a partition key)
CREATE TABLE commerce_domain_events (
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
CREATE INDEX idx_commerce_events_business ON commerce_domain_events (business_id, occurred_at);
CREATE INDEX idx_commerce_events_type ON commerce_domain_events (event_type, occurred_at);

-- ————————————————————————————————————————————— commerce_outbox_events (operational · windowed 7d)
CREATE TABLE commerce_outbox_events (
  id              uuid PRIMARY KEY,
  domain_event_id uuid NOT NULL REFERENCES commerce_domain_events (id),
  partition_key   uuid NOT NULL,
  seq             bigint GENERATED ALWAYS AS IDENTITY,  -- D-15: total insertion order, never uuid
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','dead')),
  attempts        smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_commerce_outbox_pending ON commerce_outbox_events (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_commerce_outbox_pending_partition ON commerce_outbox_events (partition_key, seq) WHERE status = 'pending';

-- ————————————————————————————————————————————— commerce_event_deliveries (idempotency ledger)
CREATE TABLE commerce_event_deliveries (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL REFERENCES commerce_domain_events (id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- ————————————————————————————————————————————— commerce_audit_logs (ledger · month-partitioned)
CREATE TABLE commerce_audit_logs (
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
CREATE INDEX idx_commerce_audit_business ON commerce_audit_logs (business_id, created_at DESC);
CREATE TABLE commerce_audit_logs_default PARTITION OF commerce_audit_logs DEFAULT;

CREATE FUNCTION commerce_audit_logs_ensure_partition(month date) RETURNS void AS $$
DECLARE
  p_start date := date_trunc('month', month)::date;
  p_end   date := (date_trunc('month', month) + interval '1 month')::date;
  p_name  text := 'commerce_audit_logs_' || to_char(p_start, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = p_name) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF commerce_audit_logs FOR VALUES FROM (%L) TO (%L)', p_name, p_start, p_end);
  END IF;
END $$ LANGUAGE plpgsql;

SELECT commerce_audit_logs_ensure_partition((date '2026-07-01' + (n || ' month')::interval)::date)
  FROM generate_series(0, 11) AS n;
