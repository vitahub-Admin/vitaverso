-- App de clientes (Mi Vitahub) · Notificaciones con historial, lectura y apertura
-- Correr una vez en el SQL editor de Supabase ANTES de desplegar. Idempotente.
--
-- customer_notification_campaigns: cada envío masivo (admin, webhook). Guarda a quién
--   se apuntó y cuántos se enviaron; leídas/abiertas se cuentan desde las notificaciones.
-- customer_notifications: el historial de cada cliente (lo que ve en la app).
--   read_at   = la vio en el listado de la app
--   opened_at = la tocó (desde el push o desde el listado)

CREATE TABLE IF NOT EXISTS customer_notification_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  url             TEXT,
  audience        JSONB NOT NULL DEFAULT '{}',   -- { tipo: "all" | "emails" | "especialista" | "usuario", ... }
  source          TEXT NOT NULL DEFAULT 'admin', -- admin | webhook
  evento          TEXT,                           -- etiqueta libre para agrupar (ej. "oferta-buen-fin")
  event_id        TEXT UNIQUE,                    -- idempotencia del webhook
  created_by      TEXT,                           -- admin que la mandó (customerId) o plataforma
  recipients      INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  no_token_count  INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_notification_campaigns_created_idx
  ON customer_notification_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS customer_notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES customer_app_users(id) ON DELETE CASCADE,
  campaign_id  UUID REFERENCES customer_notification_campaigns(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  data         JSONB NOT NULL DEFAULT '{}',      -- { type: "admin_message" | "restock" | ..., url?, variantId? }
  push_status  TEXT,                             -- sent | no_token | failed
  read_at      TIMESTAMPTZ,
  opened_at    TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,                      -- la borró de su listado (se conserva para métricas)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_notifications_user_idx
  ON customer_notifications (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS customer_notifications_campaign_idx
  ON customer_notifications (campaign_id);

ALTER TABLE customer_notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notifications ENABLE ROW LEVEL SECURITY;

-- Métricas por campaña (para el admin y el GET del webhook)
CREATE OR REPLACE VIEW customer_notification_campaign_stats AS
SELECT
  c.*,
  COUNT(n.id) FILTER (WHERE n.read_at IS NOT NULL)   AS read_count,
  COUNT(n.id) FILTER (WHERE n.opened_at IS NOT NULL) AS opened_count
FROM customer_notification_campaigns c
LEFT JOIN customer_notifications n ON n.campaign_id = c.id
GROUP BY c.id;

-- La vista se ejecuta con los permisos de QUIEN CONSULTA (no del dueño): así respeta el
-- RLS de las tablas y la llave pública (anon) no puede leer campañas. Solo el backend
-- (service role) la usa.
ALTER VIEW customer_notification_campaign_stats SET (security_invoker = true);
REVOKE ALL ON customer_notification_campaign_stats FROM anon, authenticated;
