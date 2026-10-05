-- ─────────────────────────────────────────────────────────────
-- Venta de consultorio: códigos de descuento de Shopify
--
-- La columna `descuento` ya existía (el monto). Faltaba guardar CUÁL código lo
-- generó: cuando un paciente escribe preguntando por qué pagó lo que pagó, o
-- cuando hay que entender por qué un cupón de un solo uso ya no sirve, el monto
-- solo no alcanza.
--
-- La comisión del profesional NO se toca con el descuento: se calcula sobre el
-- subtotal sin descontar. El descuento lo absorbe Vitahub, no el profesional.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE local_orders
  -- El código tal cual lo escribió el paciente, en mayúsculas.
  ADD COLUMN IF NOT EXISTS descuento_codigo text,
  -- Qué price rule de Shopify lo respalda, para poder vencerlo al cobrar y
  -- para rastrearlo desde el admin sin tener que buscar por nombre.
  ADD COLUMN IF NOT EXISTS descuento_price_rule_id bigint;

-- Para responder "¿qué cupones se usaron en nuestro checkout?" sin escanear
-- la tabla entera.
CREATE INDEX IF NOT EXISTS idx_local_orders_descuento_codigo
  ON local_orders (descuento_codigo) WHERE descuento_codigo IS NOT NULL;
