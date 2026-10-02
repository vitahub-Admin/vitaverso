-- ─────────────────────────────────────────────────────────────
-- Venta de consultorio: pago único
--
-- La venta dejó de ser "solo lo que el profesional entrega en mano": ahora
-- cobra el protocolo completo en una sola operación — lo que se entrega ahí
-- mismo, lo que se envía desde el CEDIS, y el envío.
--
-- Cada ítem lleva adentro cómo se entrega (`entrega`: "mano" | "envio"), que es
-- lo que define de qué depósito sale en BaseLinker y qué tiene que preparar el
-- operario.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE local_orders
  -- Costo de envío cobrado al paciente. Gratis a partir de cierto monto.
  ADD COLUMN IF NOT EXISTS envio numeric(10,2) NOT NULL DEFAULT 0,
  -- Lo devuelve Stripe al confirmarse el pago: el profesional nunca lo pide.
  -- Sirve para mandarle el correo con su compra y sus indicaciones de toma.
  ADD COLUMN IF NOT EXISTS patient_email text;
