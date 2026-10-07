-- ─────────────────────────────────────────────────────────────
-- Venta de consultorio: cobro por el checkout de Shopify
--
-- shopify_draft_id : el pedido borrador de Shopify con el que se está cobrando
--                    esta venta. Sirve para dos cosas: antes de crear otro
--                    borrador se mira si el anterior ya se pagó (si no, el
--                    paciente podría pagar dos veces), y para borrar el viejo
--                    cuando el pedido cambia.
-- monto_cobrado    : lo que se le cobró de verdad. En pruebas es un monto fijo
--                    chico sin importar el total del pedido; la comisión del
--                    profesional se acredita en esa misma proporción.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE local_orders
  ADD COLUMN IF NOT EXISTS shopify_draft_id text,
  ADD COLUMN IF NOT EXISTS monto_cobrado    numeric(10,2);
