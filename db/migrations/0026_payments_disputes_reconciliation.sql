-- C10 Slice 4 — disputes, external reconciliation, risk limits (RM-C3/RM-H1/RM-H6).

-- ————— disputes: the record, the deadline, the frozen entitlement
CREATE TABLE payment_disputes (
  id                  uuid PRIMARY KEY,
  provider_dispute_id text NOT NULL UNIQUE,      -- dp_… — webhook replays converge here
  intent_id           uuid,
  order_id            uuid,                      -- by value
  business_id         uuid,
  amount_minor        bigint NOT NULL,
  currency            char(3) NOT NULL,
  reason              text,
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open','won','lost')),
  evidence_due_at     timestamptz,
  frozen_minor        bigint NOT NULL DEFAULT 0, -- holding → dispute_reserve at open
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_disputes_open ON payment_disputes (business_id) WHERE state = 'open';

-- ————— RM-M1: the provider's exact words, preserved for forensics
ALTER TABLE provider_events ADD COLUMN payload jsonb;

-- ————— external reconciliation (RM-H1): does Stripe agree with our books?
CREATE TABLE reconciliation_runs (
  id          uuid PRIMARY KEY,
  watermark   timestamptz NOT NULL,              -- provider activity processed THROUGH here
  matched     int NOT NULL DEFAULT 0,
  unmatched   int NOT NULL DEFAULT 0,
  state       text NOT NULL DEFAULT 'running' CHECK (state IN ('running','complete','failed')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE reconciliation_items (
  id                uuid PRIMARY KEY,
  run_id            uuid NOT NULL,
  provider_txn_id   text NOT NULL UNIQUE,        -- balance transaction id — replay-idempotent
  kind              text NOT NULL,               -- charge | refund | payout | fee | other
  amount_minor      bigint NOT NULL,
  currency          char(3) NOT NULL,
  occurred_at       timestamptz NOT NULL,
  matched_intent_id uuid,
  state             text NOT NULL DEFAULT 'matched' CHECK (state IN ('matched','unmatched','explained')),
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recon_unmatched ON reconciliation_items (created_at) WHERE state = 'unmatched';

-- ————— risk limits (approved dispute-loss policy §4–5): the pause is a state,
-- the resume is a HUMAN's audited act
ALTER TABLE merchant_payment_profiles ADD COLUMN risk_paused_at timestamptz;
ALTER TABLE merchant_payment_profiles ADD COLUMN risk_pause_reason text;
