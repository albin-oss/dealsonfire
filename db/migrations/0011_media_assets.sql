-- Migration 0011 — media_assets registry (UX-AUTHOR-002 §D Media Port). The PERMANENT
-- half of the media seam: the durable media_id → url fact that product_media (and later
-- brand kits, sparks) resolve against. The storage backend (Vercel Blob today, the C9
-- Media capability later) is the swappable half behind the platform MediaPort — this
-- table survives that swap unchanged. Platform-owned (like request_idempotency_keys):
-- media is cross-capability by nature. No cross-domain FK (business_id by contract).
CREATE TABLE media_assets (
  id            uuid PRIMARY KEY,
  business_id   uuid NOT NULL,
  url           text NOT NULL,
  content_type  text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_assets_business ON media_assets (business_id, created_at DESC);
