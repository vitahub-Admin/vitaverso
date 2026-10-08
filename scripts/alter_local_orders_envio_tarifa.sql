-- ─────────────────────────────────────────────────────────────
-- Venta de consultorio: la tarifa de envío que eligió el paciente
--
-- El costo del envío dejó de ser una regla fija nuestra: lo deciden las tarifas de
-- Shopify (envío estándar en CDMX, envío nacional, DHL Express…) y el paciente
-- elige una con su dirección. Se guarda lo elegido:
--
--   { "handle": "...", "titulo": "Envío Nacional", "precio": 99, "expres": false }
--
-- `handle` es el identificador de la tarifa en Shopify; al pagar se vuelve a
-- consultar y se confirma que siga existiendo con el mismo precio.
--
-- NULL = el paciente todavía no eligió (o tuvo que volver a elegir porque cambió lo
-- que se envía). Un pedido con algo que enviar y sin tarifa no se puede pagar.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE local_orders
  ADD COLUMN IF NOT EXISTS envio_tarifa jsonb;
