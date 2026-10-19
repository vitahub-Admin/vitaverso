-- App de clientes (Mi Vitahub) · Productos sugeridos en el carrito ("Completa tu pedido")
-- Se administran desde pro.vitahub.mx (/admin-upsell-app). Idempotente.

CREATE TABLE IF NOT EXISTS customer_app_upsell (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  BIGINT NOT NULL UNIQUE,
  product_id  BIGINT,
  title       TEXT NOT NULL,
  note        TEXT,                         -- texto corto: "Ideal para dormir mejor"
  position    INTEGER NOT NULL DEFAULT 100, -- menor = primero
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_app_upsell_active_idx
  ON customer_app_upsell (position)
  WHERE active = TRUE;

ALTER TABLE customer_app_upsell ENABLE ROW LEVEL SECURITY;
