-- Migration 0002 — REVIEW-001 remediation
-- H-1/M-5: partition-serial claiming needs a total insertion order per table. UUIDv7 ids
-- are NOT monotonic within one millisecond (events appended in one transaction can sort
-- randomly), so ordering uses a DB-assigned identity sequence instead of the uuid.
ALTER TABLE outbox_events ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX idx_outbox_pending_partition ON outbox_events (partition_key, seq) WHERE status = 'pending';

-- L-5: staff roles are platform-defined; the DB now rejects unknown roles even via raw SQL.
-- Custom roles (Established tier, future) will extend this list by migration — deliberate friction.
ALTER TABLE staff_memberships ADD CONSTRAINT chk_staff_roles CHECK (
  array_length(roles, 1) >= 1
  AND roles <@ ARRAY['owner','manager','staff','support_agent','ai_assistant']::text[]
);
