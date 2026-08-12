-- ─────────────────────────────────────────────────────────────
-- product_catalog
-- Catálogo de variantes sincronizado desde Shopify.
-- Incluye componente principal (custom.compuesto_principal).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_catalog (
  variant_id    bigint PRIMARY KEY,
  product_id    bigint NOT NULL,
  title         text,          -- nombre del producto
  variant_title text,          -- "500mg / 60 caps" (null si es Default Title)
  sku           text,
  price         numeric(10,2),
  componente    text,          -- nombre del componente principal (texto plano)
  synced_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_product_id  ON product_catalog (product_id);
CREATE INDEX IF NOT EXISTS idx_product_catalog_componente  ON product_catalog (componente);
CREATE INDEX IF NOT EXISTS idx_product_catalog_sku         ON product_catalog (sku);

-- ─────────────────────────────────────────────────────────────
-- protocols
-- Carritos preseteados por componente.
-- components: [{ componente, label, items: [{ variant_id, product_id, title, sku }] }]
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS protocols (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  owner_id    bigint,          -- afiliado que lo creó (null = global/admin)
  is_public   boolean DEFAULT false,
  components  jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_protocols_owner_id ON protocols (owner_id);
