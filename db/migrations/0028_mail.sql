-- 0028 — C12-1 The Letters Arrive (Launch Foundations).
-- Two stores, each owning ONE irreducible truth (C12 PE review §A3/Part 8):
--
--   mail_journal — the §7 journal for outbound letters. Consumers compose and
--     journal INSIDE their transaction; the driver speaks to the provider
--     OUTSIDE any transaction and settles the outcome. One row per logical
--     letter: (consumer, dedup_ref, recipient) — dedup_ref is the domain
--     event id for notification letters, the recovery-token id for identity
--     letters. Send truth lives HERE and in the provider's idempotency window;
--     it is never duplicated into a facts table.
--
--   mail_bounces — irreducible delivery-outcome facts from the provider
--     webhook (bounce/complaint). Suppression is DERIVED from these rows,
--     never stored. Dedup by the provider's event id (webhook replays land
--     exactly once).
--
-- Retention (manifest): operational exhaust — journal rows and bounce facts
-- are hard-deleted after 12 months (opportunistic, in the driver).

CREATE TABLE mail_journal (
  id           uuid PRIMARY KEY,
  consumer     text NOT NULL,
  dedup_ref    uuid NOT NULL,
  recipient    citext NOT NULL,
  subject      text NOT NULL,
  body         text NOT NULL,
  -- critical letters (identity + money movement) are exempt from derived
  -- suppression and alarm when they bounce (PE review §A: never silent)
  critical     boolean NOT NULL DEFAULT false,
  state        text NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending', 'sent', 'suppressed', 'failed')),
  attempts     int NOT NULL DEFAULT 0,
  provider_ref text,
  last_error   text,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consumer, dedup_ref, recipient)
);

CREATE INDEX idx_mail_journal_pending ON mail_journal (updated_at) WHERE state = 'pending';
CREATE INDEX idx_mail_journal_provider_ref ON mail_journal (provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE mail_bounces (
  id                uuid PRIMARY KEY,
  provider_event_id text NOT NULL UNIQUE,
  provider_ref      text,
  recipient         citext NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('bounce', 'complaint')),
  -- permanent outcomes (hard bounce, complaint) drive derived suppression;
  -- transient (soft) bounces are recorded but never suppress
  permanent         boolean NOT NULL DEFAULT true,
  occurred_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mail_bounces_recipient ON mail_bounces (recipient) WHERE permanent;
