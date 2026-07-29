-- Migration 0022 — Cancellations (Commerce Foundation C8; ADR-007 §5 cancellation
-- rows). The request is a fact on the order; the DECISION owner depends on how far
-- the promise travelled (open case = automatic; packed/dispatched = the merchant).
ALTER TABLE orders ADD COLUMN cancel_requested_at timestamptz;
ALTER TABLE orders ADD COLUMN cancel_reason text;
