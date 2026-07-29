-- Migration 0020 — Payments domain (Commerce Foundation C4; ADR-008; AMENDMENT-001).
-- The PSP moves the money; this schema owns the truth about the money (A8-1):
-- intents with append-only facts, a double-entry ledger whose balances are cached
-- sums (L1–L3, grant-immutable entries), the webhook dedupe ledger, and the
-- connected-account profile. Quartet is the D-22 byte-mirror.

-- ————————————————————————————————————————————— payments quartet
CREATE TABLE payments_domain_events (
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
CREATE INDEX idx_payments_events_business ON payments_domain_events (business_id, occurred_at);
CREATE INDEX idx_payments_events_type ON payments_domain_events (event_type, occurred_at);

CREATE TABLE payments_outbox_events (
  id              uuid PRIMARY KEY,
  domain_event_id uuid NOT NULL REFERENCES payments_domain_events (id),
  partition_key   uuid NOT NULL,
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','dead')),
  attempts        smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_outbox_pending ON payments_outbox_events (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_payments_outbox_pending_partition ON payments_outbox_events (partition_key, seq) WHERE status = 'pending';

CREATE TABLE payments_event_deliveries (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL REFERENCES payments_domain_events (id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

CREATE TABLE payments_audit_logs (
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
CREATE INDEX idx_payments_audit_business ON payments_audit_logs (business_id, created_at DESC);
CREATE TABLE payments_audit_logs_default PARTITION OF payments_audit_logs DEFAULT;

CREATE FUNCTION payments_audit_logs_ensure_partition(month date) RETURNS void AS $$
DECLARE
  p_start date := date_trunc('month', month)::date;
  p_end   date := (date_trunc('month', month) + interval '1 month')::date;
  p_name  text := 'payments_audit_logs_' || to_char(p_start, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = p_name) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF payments_audit_logs FOR VALUES FROM (%L) TO (%L)', p_name, p_start, p_end);
  END IF;
END $$ LANGUAGE plpgsql;

SELECT payments_audit_logs_ensure_partition((date '2026-07-01' + (n || ' month')::interval)::date)
  FROM generate_series(0, 11) AS n;

-- ————————————————————————————————————————————— payment_intents (P1–P4)
CREATE TABLE payment_intents (
  id            uuid PRIMARY KEY,
  attempt_key   uuid NOT NULL UNIQUE,          -- P4: one intent per attempt, forever
  order_id      uuid,                          -- by value; set at placement
  business_id   uuid NOT NULL,
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  captured_minor bigint NOT NULL DEFAULT 0 CHECK (captured_minor >= 0),
  refunded_minor bigint NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0),
  currency      char(3) NOT NULL,
  state         text NOT NULL DEFAULT 'created'
                  CHECK (state IN ('created','authorized','requires_action','failed','captured','voided')),
  provider      text NOT NULL CHECK (provider IN ('sandbox','stripe')),
  provider_ref  text,                          -- Stripe PaymentIntent id — token, never PAN
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- P2: captures never exceed authorization; refunds never exceed captures
  CONSTRAINT chk_capture_within_auth CHECK (captured_minor <= amount_minor),
  CONSTRAINT chk_refund_within_capture CHECK (refunded_minor <= captured_minor)
);
CREATE INDEX idx_intents_business ON payment_intents (business_id, created_at DESC);
CREATE INDEX idx_intents_order ON payment_intents (order_id) WHERE order_id IS NOT NULL;

-- append-only provider-fact timeline (P3: every state change cites a fact)
CREATE TABLE payment_facts (
  id            uuid PRIMARY KEY,
  intent_id     uuid NOT NULL REFERENCES payment_intents (id),
  kind          text NOT NULL CHECK (kind IN ('authorized','declined','captured','voided','refunded','webhook')),
  amount_minor  bigint,
  provider_event_id text,
  detail        jsonb NOT NULL DEFAULT '{}',
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_facts_intent ON payment_facts (intent_id, occurred_at);

-- ————————————————————————————————————————————— the money ledger (L1–L3)
CREATE TABLE ledger_accounts (
  id            uuid PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('psp_clearing','merchant_holding','merchant_payable','platform_fees','psp_fee_expense','refund_liability','dispute_reserve')),
  business_id   uuid,                          -- null for platform-level accounts
  currency      char(3) NOT NULL,
  balance_minor bigint NOT NULL DEFAULT 0,     -- cached sum of entries (S2/L3; recompute-gated)
  UNIQUE (kind, business_id, currency)
);

CREATE TABLE ledger_entries (
  id          uuid PRIMARY KEY,
  posting_id  uuid NOT NULL,                   -- balanced group: sum(delta) per posting = 0 (L1)
  account_id  uuid NOT NULL REFERENCES ledger_accounts (id),
  delta_minor bigint NOT NULL CHECK (delta_minor <> 0),
  cause       jsonb NOT NULL DEFAULT '{}',     -- { intent_id, order_id, kind } — refs, never PII
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_entries_account ON ledger_entries (account_id, created_at);
CREATE INDEX idx_ledger_entries_posting ON ledger_entries (posting_id);

-- ————————————————————————————————————————————— webhook dedupe ledger (A8-7 layer 4)
CREATE TABLE provider_events (
  provider     text NOT NULL,
  event_id     text NOT NULL,
  intent_ref   text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- ————————————————————————————————————————————— connected-account profile (CONNECT_FUNDS_FLOW §5)
CREATE TABLE merchant_payment_profiles (
  business_id      uuid PRIMARY KEY,
  provider         text NOT NULL DEFAULT 'stripe',
  provider_account text,                       -- acct_… ref, by value
  charges_enabled  boolean NOT NULL DEFAULT false,
  payouts_enabled  boolean NOT NULL DEFAULT false,
  onboarding_state text NOT NULL DEFAULT 'none' CHECK (onboarding_state IN ('none','started','submitted','complete')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
