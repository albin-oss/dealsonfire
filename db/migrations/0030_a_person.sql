-- 0030 — C12-3 "A Person, and a Proven Recovery" (Launch Foundations, final).
--
--   email_changes — THE authoritative state machine for changing the address
--     an account answers to (the C12 PE review's account-takeover law). One
--     row per change attempt: pending → completed (new address proved
--     possession) → optionally reverted (the OLD address holds a bounded
--     72-hour reversal capability). No controller may interpret "pending"
--     for itself — this row is the only truth.
--
--   consent_facts — append-only. A consent is a FACT that happened, never a
--     mutable boolean pretending history didn't. Withdrawal or re-acceptance
--     appends; effective consent derives deterministically as the latest
--     fact per (user, document). Documents/versions live in code
--     (contracts/legal), not in a CMS.
--
--   user_recovery_tokens grows two purposes: 'email_change_new' (possession
--     proof of the incoming address) and 'email_change_revert' (the old
--     address's 72h reversal key). Same store, same hashing, same
--     consume-once law — no second token mechanism.

ALTER TABLE user_recovery_tokens DROP CONSTRAINT user_recovery_tokens_purpose_check;
ALTER TABLE user_recovery_tokens ADD CONSTRAINT user_recovery_tokens_purpose_check
  CHECK (purpose IN ('password_reset', 'email_verify', 'email_change_new', 'email_change_revert'));

CREATE TABLE email_changes (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  old_email         citext NOT NULL,
  new_email         citext NOT NULL,
  state             text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'completed', 'reverted', 'superseded')),
  -- the old address's bounded reversal window, set when the change COMPLETES
  revert_expires_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  resolved_at       timestamptz
);

CREATE INDEX idx_email_changes_user ON email_changes (user_id, created_at DESC);
-- one live attempt per account: a new request supersedes, never races
CREATE UNIQUE INDEX uq_email_changes_pending ON email_changes (user_id) WHERE state = 'pending';

CREATE TABLE consent_facts (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  document_id  text NOT NULL,
  version      text NOT NULL,
  action       text NOT NULL CHECK (action IN ('accepted', 'acknowledged', 'withdrawn')),
  surface      text NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_facts_user_doc ON consent_facts (user_id, document_id, occurred_at DESC);
