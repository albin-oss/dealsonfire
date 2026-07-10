-- Migration 0005 — Product aggregate persistence (BLUEPRINT-002 §2.1–2.3, manifest-first
-- per ADR-004 C6 — entries land in contracts/data/manifest.json in the same change).
-- NOTE (deviation from IMP-COM-001B's "option tables"): options are a jsonb VO document on
-- products per the FROZEN BLUEPRINT-002 §2.1 decision — option integrity is enforced inside
-- the aggregate transaction and options are never queried relationally.

-- ————————————————————————————————————————————— products (aggregate · permanent · tombstone · P0)
CREATE TABLE products (
  id               uuid PRIMARY KEY,
  business_id      uuid NOT NULL,  -- tenant key; NO cross-domain FK (merchant owns businesses; reconciliation per ADR-004 rule 24)
  title            text NOT NULL,
  description      jsonb,
  fulfillment_kind text NOT NULL CHECK (fulfillment_kind IN ('physical','digital','service')),
  category_path    text,           -- OPAQUE CategoryReference (K3): format-checked in domain, semantics are Taxonomy's
  attributes       jsonb NOT NULL DEFAULT '{}',
  options          jsonb NOT NULL DEFAULT '[]',  -- Option VO list (BLUEPRINT §2.1)
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  ai_provenance    jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX idx_products_business_status ON products (business_id, status, updated_at DESC);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— product_variants (aggregate children)
CREATE TABLE product_variants (
  id             uuid PRIMARY KEY,
  product_id     uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  business_id    uuid NOT NULL,  -- denormalized shard key on every row (kernel precedent)
  sku            text NOT NULL,
  option_values  jsonb NOT NULL DEFAULT '{}',
  price_amount   bigint NOT NULL CHECK (price_amount >= 0),
  price_currency char(3) NOT NULL,
  sale_amount    bigint CHECK (sale_amount >= 0),
  sale_starts_at timestamptz,
  sale_ends_at   timestamptz,
  kind_data      jsonb,
  position       smallint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_variants_business_sku UNIQUE (business_id, sku),           -- I4's business-wide big brother
  CONSTRAINT uq_variants_product_options UNIQUE (product_id, option_values), -- I3's survive-bugs line (rule 23)
  CONSTRAINT chk_variant_sale_window CHECK (
    (sale_amount IS NULL AND sale_starts_at IS NULL AND sale_ends_at IS NULL)
    OR (sale_amount IS NOT NULL AND sale_starts_at IS NOT NULL AND sale_ends_at IS NOT NULL
        AND sale_starts_at < sale_ends_at AND sale_amount < price_amount)
  )
);
CREATE INDEX idx_variants_product ON product_variants (product_id, position);
CREATE INDEX idx_variants_business ON product_variants (business_id);
CREATE TRIGGER trg_product_variants_updated BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ————————————————————————————————————————————— product_media (aggregate children)
CREATE TABLE product_media (
  id             uuid PRIMARY KEY,
  product_id     uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  business_id    uuid NOT NULL,
  media_id       uuid NOT NULL,  -- cross-domain ref → media.asset (reconciliation declared in manifest)
  render_variant text,
  variant_id     uuid REFERENCES product_variants (id) ON DELETE RESTRICT,
  role           text NOT NULL DEFAULT 'gallery' CHECK (role IN ('gallery','hero','swatch')),
  alt_text       text,
  position       smallint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- I6's survive-bugs line: one attachment per (asset, scope); scope = variant or product-level
CREATE UNIQUE INDEX uq_product_media_attachment ON product_media
  (product_id, media_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_product_media_product ON product_media (product_id, position);
