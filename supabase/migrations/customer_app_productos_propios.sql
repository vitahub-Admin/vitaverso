-- App de clientes (Mi Vitahub) · Suplementos que el paciente toma y Vitahub no vende
-- Correr una vez en el SQL editor de Supabase ANTES de desplegar. Idempotente.
--
-- Se guardan en supplement_tracking como cualquier otro, con un id de variante
-- NEGATIVO (no existe en Shopify) para que tomas, racha y recordatorios funcionen igual.
--   custom       = true para estos productos
--   custom_name  = el nombre que puso el paciente
--   photo_path   = ruta de la foto en el bucket privado "customer-supplements"
--   matched_variant_id = si un admin lo asocia a un producto del catálogo (para el análisis)

ALTER TABLE supplement_tracking
  ADD COLUMN IF NOT EXISTS custom             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS custom_name        TEXT,
  ADD COLUMN IF NOT EXISTS photo_path         TEXT,
  ADD COLUMN IF NOT EXISTS matched_variant_id BIGINT;

CREATE INDEX IF NOT EXISTS supplement_tracking_custom_idx
  ON supplement_tracking (created_at DESC)
  WHERE custom = TRUE;

-- Bucket privado para las fotos (solo el backend lo lee y escribe con la service role;
-- la app las ve con URLs firmadas que vencen)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-supplements', 'customer-supplements', false, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
