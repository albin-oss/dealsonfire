-- Migration 0003 — ADR-004 C1 (ADR-003 W1): event envelope traceability.
-- correlation_id = the request/workflow that started it all (enters at the edge).
-- causation_id   = the event/command directly causing this one (consumers chain it).
-- Nullable + additive (ADR-004 rule 18): pre-existing events simply have no trace.
ALTER TABLE domain_events ADD COLUMN correlation_id uuid;
ALTER TABLE domain_events ADD COLUMN causation_id uuid;
