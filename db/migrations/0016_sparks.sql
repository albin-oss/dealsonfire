-- Migration 0016 — Sparks (Release 0.6): the content layer. A Spark is a short public
-- update in the store's voice: body + optional photo (Media Port ref) + optional
-- product pointer (in-domain FK; the public read drops the card when the product is
-- hidden — the spark itself survives). Visible iff spark published ∧ store live.
CREATE TABLE sparks (
  id            uuid PRIMARY KEY,
  business_id   uuid NOT NULL,   -- merchant-owned: integrity by contract (ADR-004 rule 12)
  channel_id    uuid NOT NULL,   -- the store; merchant-owned, no FK by design
  body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  media_id      uuid,            -- media.asset ref (reconciliation declared in manifest)
  product_id    uuid REFERENCES products (id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted')),
  published_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sparks_business ON sparks (business_id, published_at DESC);
CREATE INDEX idx_sparks_channel_live ON sparks (channel_id, published_at DESC) WHERE status = 'published';

-- reactions: the Release-0.4 engagement discipline (UNIQUE key IS the idempotency guard)
CREATE TABLE spark_reactions (
  id           uuid PRIMARY KEY,
  spark_id     uuid NOT NULL REFERENCES sparks (id) ON DELETE RESTRICT,
  business_id  uuid NOT NULL,
  visitor_id   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (spark_id, visitor_id)
);
CREATE INDEX idx_spark_reactions_visitor ON spark_reactions (visitor_id, created_at DESC);
