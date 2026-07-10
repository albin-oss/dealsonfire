-- Migration 0007 — OPS-001A hardening (REVIEW-OPS-001 M-1 / D-39).
-- Ghost identity becomes a PERSISTED fact: `system_authored` is true only for
-- system-created defaults and is cleared by the first merchant-authored change.
-- Forward-only (0006 stays untouched — the 0002 review-fix precedent).
-- Backfill: every existing home-kind active default was system-authored by construction
-- (Location.createGhost is the only writer of is_default=true in Batch 1).

ALTER TABLE locations ADD COLUMN system_authored boolean NOT NULL DEFAULT false;

UPDATE locations SET system_authored = true WHERE is_default AND kind = 'home';
