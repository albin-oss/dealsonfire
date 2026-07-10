-- Migration 0008 — Identity domain (WP-R1-B1). The auth domain the 'session' adapter
-- fills. Quartet mirrors 0004/0006 (D-22). All secrets/tokens are stored HASHED
-- (sha-256 for opaque tokens, argon2id for passwords) — no reversible credential rests here.

-- ————————————————————————————————————————————— identity quartet
CREATE TABLE identity_domain_events (
  id             uuid PRIMARY KEY,
  business_id    uuid,              -- unused for identity; kept for envelope shape (D-22)
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
CREATE INDEX idx_identity_events_type ON identity_domain_events (event_type, occurred_at);

CREATE TABLE identity_outbox_events (
  id              uuid PRIMARY KEY,
  domain_event_id uuid NOT NULL REFERENCES identity_domain_events (id),
  partition_key   uuid NOT NULL,
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','dead')),
  attempts        smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_identity_outbox_pending ON identity_outbox_events (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_identity_outbox_pending_partition ON identity_outbox_events (partition_key, seq) WHERE status = 'pending';

CREATE TABLE identity_event_deliveries (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL REFERENCES identity_domain_events (id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

CREATE TABLE identity_audit_logs (
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
CREATE INDEX idx_identity_audit_actor ON identity_audit_logs (created_at DESC);
CREATE TABLE identity_audit_logs_default PARTITION OF identity_audit_logs DEFAULT;

CREATE FUNCTION identity_audit_logs_ensure_partition(month date) RETURNS void AS $$
DECLARE
  p_start date := date_trunc('month', month)::date;
  p_end   date := (date_trunc('month', month) + interval '1 month')::date;
  p_name  text := 'identity_audit_logs_' || to_char(p_start, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = p_name) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF identity_audit_logs FOR VALUES FROM (%L) TO (%L)', p_name, p_start, p_end);
  END IF;
END $$ LANGUAGE plpgsql;
SELECT identity_audit_logs_ensure_partition((date '2026-07-01' + (n || ' month')::interval)::date)
  FROM generate_series(0, 11) AS n;

-- ————————————————————————————————————————————— users (aggregate root)
CREATE TABLE users (
  id            uuid PRIMARY KEY,
  email         citext NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  display_name  text CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deactivated')),
  sequence      bigint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- one active account per email; deactivated emails free up (tombstone via status)
CREATE UNIQUE INDEX uq_users_email_active ON users (email) WHERE status = 'active';

-- password credential (argon2id encoded string; nullable — passkey-only users allowed)
CREATE TABLE user_credentials (
  user_id       uuid PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
  password_hash text NOT NULL,          -- argon2id encoded ($argon2id$v=19$...)
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- WebAuthn passkeys
CREATE TABLE user_passkeys (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  credential_id  text NOT NULL,          -- base64url; the authenticator's credential id
  public_key     bytea NOT NULL,
  counter        bigint NOT NULL DEFAULT 0,
  transports     text[] NOT NULL DEFAULT '{}',
  label          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  UNIQUE (credential_id)
);
CREATE INDEX idx_passkeys_user ON user_passkeys (user_id);

-- sessions (opaque token hashed at rest)
CREATE TABLE user_sessions (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  token_hash     text NOT NULL,          -- sha-256 of the opaque cookie value
  step_up_at     timestamptz,            -- last fresh re-auth (≤5min window is app logic)
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  rolling_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at     timestamptz,
  user_agent     text,
  UNIQUE (token_hash)
);
CREATE INDEX idx_sessions_user_active ON user_sessions (user_id) WHERE revoked_at IS NULL;

-- recovery + verification tokens (single-use, hashed)
CREATE TABLE user_recovery_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  token_hash  text NOT NULL UNIQUE,
  purpose     text NOT NULL CHECK (purpose IN ('password_reset','email_verify')),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recovery_user ON user_recovery_tokens (user_id, purpose) WHERE consumed_at IS NULL;

-- guest tokens (order-scoped in R1-B5; scope-generic here)
CREATE TABLE guest_tokens (
  id          uuid PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE,
  scope_type  text NOT NULL,
  scope_ref   uuid NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_guest_scope ON guest_tokens (scope_type, scope_ref);

-- claims: which guest-owned artifacts a user has claimed (idempotent)
CREATE TABLE identity_claims (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  claim_type   text NOT NULL,            -- 'ignite_draft' now; 'order' in R1-B5
  claim_ref    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_type, claim_ref)          -- an artifact is claimed by exactly one user, once
);
CREATE INDEX idx_claims_user ON identity_claims (user_id);
