-- 0029 — C12-2 Locks for Strangers (Launch Foundations, increment 2).
-- Three stores, each owning one irreducible truth (C12-2 readiness review):
--
--   rate_limit_buckets — durable fixed-window counters behind the RateLimiter
--     seam. Keys are HMAC digests of (scope, normalized address/principal):
--     RAW IPs ARE NEVER PERSISTED. IPv6 normalizes to /64 before hashing so
--     in-prefix rotation cannot evade a budget. Atomic upsert increments;
--     expired windows are deleted opportunistically on write.
--
--   webauthn_challenges — one-time ceremony state (retires recorded debt
--     D-40e / the in-memory store). Challenge HASHED at rest; nullable user
--     binding (authentication ceremonies are legitimately anonymous);
--     consumption is DELETE … RETURNING — take IS consume, atomically; a
--     consumed or expired ceremony finds nothing; parallel ceremonies are
--     independent rows.
--
--   abuse_reports — the safety intake (report → record → operator → decision
--     → enforcement → audit). CLOSED subject vocabulary, closed reasons,
--     bounded note (treated as sensitive: people paste PII into free text).
--     One reporter cannot flood one subject: unique (subject_type,
--     subject_ref, reporter_id). Different reporters on the same subject
--     remain independent rows.

CREATE TABLE rate_limit_buckets (
  key_hmac     text NOT NULL,
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 1,
  PRIMARY KEY (key_hmac, window_start)
);

CREATE TABLE webauthn_challenges (
  id             uuid PRIMARY KEY,
  ceremony_id    text NOT NULL UNIQUE,
  challenge_hash text NOT NULL,
  user_id        uuid,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE abuse_reports (
  id           uuid PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('store', 'product', 'deal', 'spark', 'order')),
  subject_ref  uuid NOT NULL,
  reason       text NOT NULL CHECK (reason IN ('counterfeit', 'scam', 'offensive', 'dangerous', 'stolen_content', 'never_arrived', 'other')),
  note         text CHECK (char_length(note) <= 1000),
  -- pseudonymous visitor id or authenticated user id — never contact details
  reporter_id  uuid NOT NULL,
  reporter_kind text NOT NULL CHECK (reporter_kind IN ('visitor', 'user')),
  state        text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved', 'dismissed')),
  resolved_at  timestamptz,
  resolved_by  uuid,
  resolution   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_ref, reporter_id)
);

CREATE INDEX idx_abuse_reports_open ON abuse_reports (created_at) WHERE state = 'open';
