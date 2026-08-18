-- Agrega columna de idempotencia para email de prescripción
-- NULL = no enviado aún, TIMESTAMPTZ = marca de cuándo se envió (o se reclamó el envío)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS protocol_email_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Índice para la condición WHERE protocol_email_sent_at IS NULL
-- (acelera el UPDATE atómico que usa el webhook)
CREATE INDEX IF NOT EXISTS orders_protocol_email_sent_at_null
  ON orders (order_id)
  WHERE protocol_email_sent_at IS NULL;
