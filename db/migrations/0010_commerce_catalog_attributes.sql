-- Migration 0010 — Commerce Catalog: business-scoped Attribute Sets + Brand References
-- (PROMPT-016, additive to Catalog Management). ADR-002 FROZEN: brand stays a product
-- *attribute*; brand_refs is a business's convenience pick-list, NOT a platform Brand entity.
-- Attribute sets are business-owned templates, taxonomy-agnostic (O2-1 untouched). No change
-- to products/variants. No cross-domain FK (business_id integrity by contract, ADR-004).
CREATE TABLE attribute_sets (
  id            uuid PRIMARY KEY,
  business_id   uuid NOT NULL,
  name          text NOT NULL,
  definitions   jsonb NOT NULL DEFAULT '[]',   -- [{ key, label, type, required, allowed_values? }]
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  sequence      bigint NOT NULL DEFAULT 0,      -- optimistic-concurrency guard
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE INDEX idx_attribute_sets_business ON attribute_sets (business_id) WHERE status = 'active';

CREATE TABLE brand_refs (
  id           uuid PRIMARY KEY,
  business_id  uuid NOT NULL,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE INDEX idx_brand_refs_business ON brand_refs (business_id);
