-- Migration 0001 — Merchant Kernel (BLUEPRINT-001 §2, Final Recommendations §2)
-- Conventions: uuid v7 app-generated PKs; text+CHECK statuses (A5); timestamptz;
-- business_id leads every business-scoped composite index (shard key, ADR-001 §14).

CREATE EXTENSION IF NOT EXISTS citext;

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ————————————————————————————————————————————— merchant_accounts (§2.1)
CREATE TABLE merchant_accounts (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL UNIQUE,           -- Identity ref; integrity by contract, no cross-domain FK
  display_name  text NOT NULL,
  preferences   jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deactivated')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE TRIGGER trg_merchant_accounts_updated BEFORE UPDATE ON merchant_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— businesses (§2.2)
CREATE TABLE businesses (
  id               uuid PRIMARY KEY,
  business_type    text NOT NULL CHECK (business_type IN ('individual','registered')),
  display_name     text NOT NULL,
  profile          jsonb NOT NULL DEFAULT '{}',
  trust_level      text NOT NULL DEFAULT 'unverified'
                     CHECK (trust_level IN ('unverified','identity_verified','business_verified','banking_verified')),
  scale_tier       text NOT NULL DEFAULT 'starter'
                     CHECK (scale_tier IN ('starter','growth','established','enterprise')),
  standing         text NOT NULL DEFAULT 'good'
                     CHECK (standing IN ('good','flagged','restricted','suspended','banned')),
  standing_context jsonb NOT NULL DEFAULT '{}',
  tax_settings     jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  deleted_at       timestamptz
);
CREATE INDEX idx_businesses_bad_standing ON businesses (standing) WHERE standing <> 'good';
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— store_handles (§2.18 — HandleService ledger)
CREATE TABLE store_handles (
  handle             citext PRIMARY KEY,
  store_id           uuid,
  status             text NOT NULL CHECK (status IN ('reserved','active','redirect','quarantined')),
  redirect_to_handle citext REFERENCES store_handles (handle),
  reserved_until     timestamptz,
  quarantined_until  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_store_handles_store ON store_handles (store_id) WHERE store_id IS NOT NULL;
CREATE TRIGGER trg_store_handles_updated BEFORE UPDATE ON store_handles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— stores (§2.3) — status ⊥ enforcement_hold (ADR §7.2)
CREATE TABLE stores (
  id                uuid PRIMARY KEY,
  business_id       uuid NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
  handle            citext NOT NULL UNIQUE,
  name              text NOT NULL,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','live','paused','archived','closed','deleted')),
  enforcement_hold  text NOT NULL DEFAULT 'none'
                      CHECK (enforcement_hold IN ('none','under_review','suspended')),
  pause_context     jsonb,
  policies          jsonb NOT NULL DEFAULT '{}',
  completion_score  smallint NOT NULL DEFAULT 0 CHECK (completion_score BETWEEN 0 AND 100),
  completion_detail jsonb NOT NULL DEFAULT '{}',
  settings          jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  published_at      timestamptz,
  closed_at         timestamptz,
  deleted_at        timestamptz
);
CREATE INDEX idx_stores_business_status ON stores (business_id, status);
CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— brand_kits (§2.4 — VO semantics: whole-row replace)
CREATE TABLE brand_kits (
  id            uuid PRIMARY KEY,
  business_id   uuid NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
  owner_type    text NOT NULL CHECK (owner_type IN ('store','business')),
  owner_id      uuid NOT NULL,
  name          text NOT NULL,
  logo_media_id uuid,
  palette       jsonb NOT NULL DEFAULT '{}',
  typography    jsonb NOT NULL DEFAULT '{}',
  voice         jsonb NOT NULL DEFAULT '{}',
  ai_provenance jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id)
);
CREATE INDEX idx_brand_kits_business ON brand_kits (business_id);
CREATE TRIGGER trg_brand_kits_updated BEFORE UPDATE ON brand_kits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— storefront_configs (§2.5)
CREATE TABLE storefront_configs (
  id                uuid PRIMARY KEY,
  store_id          uuid NOT NULL UNIQUE REFERENCES stores (id) ON DELETE RESTRICT,
  business_id       uuid NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
  theme_key         text NOT NULL,
  draft_config      jsonb NOT NULL DEFAULT '{}',
  published_config  jsonb,
  published_version int NOT NULL DEFAULT 0,
  custom_domain     citext UNIQUE,
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_storefront_configs_updated BEFORE UPDATE ON storefront_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— staff_memberships (§2.6 — humans AND ai_agents)
CREATE TABLE staff_memberships (
  id             uuid PRIMARY KEY,
  business_id    uuid NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
  principal_type text NOT NULL CHECK (principal_type IN ('user','ai_agent')),
  principal_id   uuid NOT NULL,
  roles          text[] NOT NULL,
  store_scope    uuid[],
  ai_policy      jsonb,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended','revoked')),
  invited_by     uuid REFERENCES staff_memberships (id),
  invited_at     timestamptz,
  accepted_at    timestamptz,
  revoked_at     timestamptz,
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, principal_type, principal_id)
);
-- Exactly-one-Owner invariant (ADR-001 §5.1), enforced by the database itself:
CREATE UNIQUE INDEX idx_one_owner_per_business ON staff_memberships (business_id)
  WHERE 'owner' = ANY (roles) AND status = 'active';
CREATE INDEX idx_staff_by_principal ON staff_memberships (principal_id, status);
CREATE TRIGGER trg_staff_memberships_updated BEFORE UPDATE ON staff_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— capabilities (§2.7 — the Registry; global, seeded)
CREATE TABLE capabilities (
  key                  text PRIMARY KEY,
  description          text NOT NULL,
  required_trust_level text NOT NULL
                         CHECK (required_trust_level IN ('unverified','identity_verified','business_verified','banking_verified')),
  required_scale_tier  text NOT NULL
                         CHECK (required_scale_tier IN ('starter','growth','established','enterprise')),
  required_permissions text[] NOT NULL DEFAULT '{}',
  dependencies         text[] NOT NULL DEFAULT '{}',
  default_available    boolean NOT NULL DEFAULT false,
  version              int NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_capabilities_updated BEFORE UPDATE ON capabilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— business_entitlements (§2.8)
CREATE TABLE business_entitlements (
  id             uuid PRIMARY KEY,
  business_id    uuid NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
  capability_key text NOT NULL REFERENCES capabilities (key),
  source         text NOT NULL CHECK (source IN ('tier','subscription','grant','promotion')),
  granted_by     jsonb NOT NULL DEFAULT '{}',
  granted_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, capability_key, source)
);
CREATE INDEX idx_entitlements_live ON business_entitlements (business_id) WHERE revoked_at IS NULL;
CREATE TRIGGER trg_business_entitlements_updated BEFORE UPDATE ON business_entitlements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— domain_events (§2.16 — append-only; see DECISIONS D-02)
CREATE TABLE domain_events (
  id             uuid PRIMARY KEY,
  business_id    uuid,
  aggregate_type text NOT NULL,
  aggregate_id   uuid NOT NULL,
  sequence       bigint NOT NULL,
  event_type     text NOT NULL,
  schema_version smallint NOT NULL DEFAULT 1,
  payload        jsonb NOT NULL,
  actor          jsonb NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, aggregate_id, sequence)   -- optimistic-concurrency guard
);
CREATE INDEX idx_domain_events_business ON domain_events (business_id, occurred_at);
CREATE INDEX idx_domain_events_type ON domain_events (event_type, occurred_at);

-- ————————————————————————————————————————————— outbox_events (§2.17 — transactional outbox)
CREATE TABLE outbox_events (
  id              uuid PRIMARY KEY,
  domain_event_id uuid NOT NULL REFERENCES domain_events (id),
  partition_key   uuid NOT NULL,                    -- = business_id: per-business ordering
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','dead')),
  attempts        smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_pending ON outbox_events (status, next_attempt_at) WHERE status = 'pending';

-- ————————————————————————————————————————————— event_deliveries (§2.18 — consumer idempotency)
CREATE TABLE event_deliveries (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL REFERENCES domain_events (id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- ————————————————————————————————————————————— audit_logs (§2.15 — append-only, month-partitioned)
CREATE TABLE audit_logs (
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
  PRIMARY KEY (id, created_at)                      -- partition key must be in the PK
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_audit_business ON audit_logs (business_id, created_at DESC);
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

CREATE FUNCTION audit_logs_ensure_partition(month date) RETURNS void AS $$
DECLARE
  p_start date := date_trunc('month', month)::date;
  p_end   date := (date_trunc('month', month) + interval '1 month')::date;
  p_name  text := 'audit_logs_' || to_char(p_start, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = p_name) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)', p_name, p_start, p_end);
  END IF;
END $$ LANGUAGE plpgsql;

-- Initial 12 months of partitions; ops (or the dispatch task) extends via audit_logs_ensure_partition.
SELECT audit_logs_ensure_partition((date '2026-07-01' + (n || ' month')::interval)::date)
  FROM generate_series(0, 11) AS n;

-- ————————————————————————————————————————————— request_idempotency_keys (DECISIONS D-01)
CREATE TABLE request_idempotency_keys (
  idempotency_key text NOT NULL,
  endpoint        text NOT NULL,
  actor_key       text NOT NULL,
  request_hash    text NOT NULL,
  response_status int,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idempotency_key, endpoint, actor_key)
);
CREATE INDEX idx_idempotency_expiry ON request_idempotency_keys (created_at);
