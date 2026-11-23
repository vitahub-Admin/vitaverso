-- App de clientes (Mi Vitahub) · Una marca por TOMA, no por suplemento
-- Correr en el SQL editor de Supabase DESPUÉS de subir el backend compatible
-- (api/customer-app/intake sin upsert por (user_id, shopify_variant_id, taken_date)).
-- Idempotente: se puede volver a correr.
--
-- slot   = hora programada de la toma ("08:00", "21:30") o 'dia' (marca de todo el día:
--          versiones viejas de la app y suplementos sin horario)
-- source = desde dónde se marcó: app | notificacion | widget

ALTER TABLE supplement_intake
  ADD COLUMN IF NOT EXISTS slot   TEXT NOT NULL DEFAULT 'dia',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';

-- Quitar la regla vieja (una marca por suplemento por día), sin depender de su nombre
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'supplement_intake'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE supplement_intake DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS supplement_intake_toma_uq
  ON supplement_intake (user_id, shopify_variant_id, taken_date, slot);
