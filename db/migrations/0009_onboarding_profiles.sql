-- Migration 0009 — Merchant onboarding discovery profile (CAP-R1-MER-002). A first-class,
-- editable, VERSIONED profile keyed by the person (user_id) — NOT coupled to auth and NOT
-- FK'd across domains (ADR-004 rule 12); an orphan reconciler handles user deactivation.
-- Extensible via the jsonb answers column; auditable via the merchant audit log (no new
-- domain events — discovery is private preference, not a published fact).
CREATE TABLE onboarding_profiles (
  user_id      uuid PRIMARY KEY,
  answers      jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  version      bigint NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_onboarding_status ON onboarding_profiles (status);
