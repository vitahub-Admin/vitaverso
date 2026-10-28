-- App de clientes (Mi Vitahub) · Descuentos de recompra del cliente
-- Cada fila es un cupón de Shopify (código de un uso) que el cliente ve en "Tus descuentos"
-- y puede elegir en el carrito de la app. Las reglas de cuándo y cuánto se otorga viven
-- en el backend (src/lib/descuentosClientes.js). Idempotente.

CREATE TABLE IF NOT EXISTS customer_discounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,                 -- se busca por el correo verificado del login
  code           TEXT NOT NULL UNIQUE,          -- código en Shopify (VR-XXXXXXXX)
  price_rule_id  BIGINT,
  tipo           TEXT NOT NULL DEFAULT 'monto' CHECK (tipo IN ('monto', 'porcentaje')),
  valor          NUMERIC(10,2) NOT NULL,        -- pesos o porcentaje (10 = 10%)
  minimo         NUMERIC(10,2),                 -- compra mínima para usarlo
  titulo         TEXT,                          -- "Por tu compra del 28 de octubre"
  origen         TEXT,                          -- orden | efectivo | manual
  origen_ref     TEXT,                          -- id de la orden o de la venta que lo generó
  starts_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at        TIMESTAMPTZ,                   -- sin fecha = no vence
  used_at        TIMESTAMPTZ,
  used_order     TEXT,
  email_sent_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origen, origen_ref)                   -- una compra genera como mucho un descuento
);

CREATE INDEX IF NOT EXISTS customer_discounts_email_idx ON customer_discounts (lower(email));

ALTER TABLE customer_discounts ENABLE ROW LEVEL SECURITY;
