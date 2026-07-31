-- C10 Slice 1 — the two-phase provider boundary (UPDATED_PAYMENT_LIFECYCLE §7).
-- Every provider-touching operation is journaled BEFORE the network call and
-- settled AFTER it, in separate short transactions. A crash between the phases
-- leaves a pending row the recovery driver re-drives under the same idempotency
-- key — convergence instead of drift. No Stripe request runs inside a tx.
--
-- States: pending (not yet settled — includes retryable provider errors),
--         succeeded (outcome recorded; a DECLINE is a succeeded operation whose
--         outcome is a failed intent), abandoned (a human-visible terminal stop:
--         the 24h order failure closes its pending capture ops this way).
CREATE TABLE provider_operations (
  id              uuid PRIMARY KEY,
  kind            text NOT NULL CHECK (kind IN ('authorize','capture','void','refund','transfer_reversal','payout')),
  provider        text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,          -- stable, domain-derived; Stripe converges on it
  attempt_key     text,                          -- authorize/capture correlation
  intent_id       uuid,
  provider_ref    text,
  order_id        uuid,
  business_id     uuid,
  amount_minor    bigint,
  currency        char(3),
  state           text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','succeeded','abandoned')),
  attempts        int  NOT NULL DEFAULT 0,
  last_error      text,
  detail          jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_provider_ops_pending ON provider_operations (created_at) WHERE state = 'pending';
CREATE INDEX idx_provider_ops_intent ON provider_operations (intent_id) WHERE intent_id IS NOT NULL;
