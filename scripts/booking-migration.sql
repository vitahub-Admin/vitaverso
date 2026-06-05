-- Vitahub Booking System — Migration
-- Correr en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS booking_affiliates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id     BIGINT UNIQUE NOT NULL,
  slug                    TEXT UNIQUE NOT NULL,
  display_name            TEXT NOT NULL,
  bio                     TEXT,
  photo_url               TEXT,
  specialty               TEXT,
  timezone                TEXT DEFAULT 'America/Mexico_City',
  is_active               BOOLEAN DEFAULT true,
  google_calendar_token   JSONB,   -- { access_token, refresh_token, expiry_date }
  google_calendar_id      TEXT DEFAULT 'primary',
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      UUID REFERENCES booking_affiliates(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  duration_minutes  INTEGER NOT NULL DEFAULT 60,
  price             NUMERIC(10,2) NOT NULL,
  currency          TEXT DEFAULT 'MXN',
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Horario semanal recurrente del afiliado (0=Domingo, 1=Lunes, ..., 6=Sábado)
CREATE TABLE IF NOT EXISTS booking_availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID REFERENCES booking_affiliates(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  UNIQUE(affiliate_id, day_of_week, start_time)
);

-- Bloqueos manuales: días completos o franjas horarias
CREATE TABLE IF NOT EXISTS booking_blocked_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID REFERENCES booking_affiliates(id) ON DELETE CASCADE,
  blocked_date  DATE NOT NULL,
  start_time    TIME,   -- null = día completo
  end_time      TIME,   -- null = día completo
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_appointments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id              UUID REFERENCES booking_affiliates(id),
  service_id                UUID REFERENCES booking_services(id),
  client_name               TEXT NOT NULL,
  client_email              TEXT NOT NULL,
  client_phone              TEXT,
  client_notes              TEXT,
  starts_at                 TIMESTAMPTZ NOT NULL,
  ends_at                   TIMESTAMPTZ NOT NULL,
  status                    TEXT DEFAULT 'pending_payment'
                              CHECK (status IN (
                                'pending_payment','confirmed','cancelled','completed','expired'
                              )),
  shopify_draft_order_id    TEXT,
  shopify_order_id          TEXT,
  shopify_order_number      TEXT,
  google_calendar_event_id  TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

-- Índices para cálculo de slots
CREATE INDEX IF NOT EXISTS idx_apt_affiliate_date
  ON booking_appointments(affiliate_id, starts_at)
  WHERE status IN ('pending_payment', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_blocked_affiliate_date
  ON booking_blocked_slots(affiliate_id, blocked_date);

CREATE INDEX IF NOT EXISTS idx_availability_affiliate_day
  ON booking_availability(affiliate_id, day_of_week);

-- Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_affiliates_updated
  BEFORE UPDATE ON booking_affiliates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_booking_appointments_updated
  BEFORE UPDATE ON booking_appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
