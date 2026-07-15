-- Migration 0012 — Listings (VISIBILITY_CONTRACT; CER-001 CS1 minimal core; BLUEPRINT-002
-- §2.4 reduced to the publishing journey). One row per (product, channel); channel_id is
-- the store (1:1 today — §0.4 seam, multi-channel adds rows not columns). Deliberately
-- deferred from full §2.4: per-channel overrides, visibility tiers, collections.
CREATE TABLE listings (
  id            uuid PRIMARY KEY,
  business_id   uuid NOT NULL,   -- merchant-owned concept: integrity by contract, no cross-domain FK (ADR-004 rule 12)
  product_id    uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  channel_id    uuid NOT NULL,   -- the store; merchant-owned: no FK by design (ADR-004 rule 12)
  status        text NOT NULL DEFAULT 'published' CHECK (status IN ('published','unpublished','ended')),
  published_at  timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel_id)                          -- V2: one listing per product×channel
);
CREATE INDEX idx_listings_channel_published ON listings (channel_id) WHERE status = 'published';
CREATE INDEX idx_listings_business ON listings (business_id);
CREATE INDEX idx_listings_product ON listings (product_id);

-- ——— Backfill: the honest cutover (UX-PUBLISH-001 §5-PR-1). The interim shelf rule made
-- every non-archived, priced product public on its business's store(s); this migration
-- records that SAME reality as explicit published listings, so no live storefront loses
-- a product when the shelf switches to listing truth. Idempotent via ON CONFLICT.
INSERT INTO listings (id, business_id, product_id, channel_id, status, published_at)
SELECT gen_random_uuid(), p.business_id, p.id, s.id, 'published', now()
FROM products p
JOIN stores s ON s.business_id = p.business_id AND s.deleted_at IS NULL AND s.status <> 'deleted'
WHERE p.status <> 'archived' AND p.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.price_amount > 0)
ON CONFLICT (product_id, channel_id) DO NOTHING;
