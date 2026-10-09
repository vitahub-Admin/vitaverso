-- App de clientes · Fase 1
-- Correr una vez en el SQL editor de Supabase ANTES de desplegar la rama feat/app-clientes-fase1.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Cambios en supplement_tracking:
--   · user_id: dueño real del seguimiento (customer_app_users.id). Antes se usaba
--     shopify_customer_id y las cuentas sin Shopify quedaban todas en 0, compartiendo filas.
--   · Una sola fila por (usuario, variante): el ciclo vigente de ese suplemento.
--   · Estado: active, cantidad de frascos acumulados, fecha estimada de fin,
--     horarios de recordatorio y control de avisos de restock (dedupe y posponer).

ALTER TABLE supplement_tracking
  ADD COLUMN IF NOT EXISTS user_id               UUID REFERENCES customer_app_users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS active                BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS quantity              INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS end_date              DATE,
  ADD COLUMN IF NOT EXISTS last_order_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_times        TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS restock_notified_days INTEGER,
  ADD COLUMN IF NOT EXISTS restock_notified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_until         DATE;

-- Las cuentas nativas no tienen id de Shopify
ALTER TABLE supplement_tracking ALTER COLUMN shopify_customer_id DROP NOT NULL;

-- Backfill de user_id desde shopify_customer_id
UPDATE supplement_tracking t
   SET user_id = u.id
  FROM customer_app_users u
 WHERE t.user_id IS NULL
   AND t.shopify_customer_id IS NOT NULL
   AND u.shopify_customer_id = t.shopify_customer_id;

-- Filas huérfanas (sin usuario de la app) no sirven: no hay a quién avisar
DELETE FROM supplement_tracking WHERE user_id IS NULL;

-- Dejar una sola fila por (usuario, variante): la más reciente
DELETE FROM supplement_tracking t
 USING supplement_tracking newer
 WHERE t.user_id = newer.user_id
   AND t.shopify_variant_id = newer.shopify_variant_id
   AND (newer.updated_at, newer.id) > (t.updated_at, t.id);

-- Fecha de fin para las filas existentes
UPDATE supplement_tracking
   SET end_date = start_date + (duration_days * quantity)
 WHERE end_date IS NULL AND start_date IS NOT NULL AND duration_days IS NOT NULL;

-- Quitar los unique viejos (customer, variant, order) y poner el nuevo
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'supplement_tracking'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE supplement_tracking DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE supplement_tracking ALTER COLUMN user_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS supplement_tracking_user_variant_uq
  ON supplement_tracking (user_id, shopify_variant_id);

-- El cron de restock busca los activos que terminan pronto
CREATE INDEX IF NOT EXISTS supplement_tracking_active_end_idx
  ON supplement_tracking (end_date)
  WHERE active = TRUE;

-- ── Login propio con código por email ────────────────────────────────────────
-- Shopify deprecó las cuentas clásicas (feb-2026): la app ya no usa su login.
-- El cliente entra con un código de 6 dígitos que le llega al correo (igual que la
-- verificación de Vitahub Pro) y con ese correo verificado se hace el match con Shopify.

CREATE TABLE IF NOT EXISTS customer_app_login_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,          -- sha256, nunca el código en claro
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  consumed_at  TIMESTAMPTZ,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_app_login_codes_email_idx
  ON customer_app_login_codes (email, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_app_login_codes_ip_idx
  ON customer_app_login_codes (ip, created_at DESC);

-- Emails siempre en minúsculas para el match
UPDATE customer_app_users SET email = lower(trim(email)) WHERE email IS NOT NULL AND email <> lower(trim(email));

CREATE INDEX IF NOT EXISTS customer_app_users_email_idx
  ON customer_app_users (email);

-- Tabla interna: solo el backend (service role) la toca
ALTER TABLE customer_app_login_codes ENABLE ROW LEVEL SECURITY;
