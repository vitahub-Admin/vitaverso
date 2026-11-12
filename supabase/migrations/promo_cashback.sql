-- Cashback por compra (src/lib/cashback.js). Una fila por promo; el webhook de órdenes otorga
-- el cupón a las compras pagadas creadas entre `desde` y `hasta` mientras `activo` sea true.
-- Correr completo en el SQL Editor de Supabase. Se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS promo_cashback (
  id                     TEXT PRIMARY KEY,             -- 'buen-fin-2026' (queda en customer_discounts.origen)
  activo                 BOOLEAN NOT NULL DEFAULT false,
  titulo                 TEXT,                         -- se ve en la app: "Cashback Buen Fin por tu pedido #…"
  prefijo                TEXT NOT NULL DEFAULT 'BF',   -- códigos BF-XXXXXXXX
  desde                  TIMESTAMPTZ,                  -- compras creadas desde (sin fecha = sin límite)
  hasta                  TIMESTAMPTZ,                  -- compras creadas hasta
  escalones              JSONB NOT NULL,               -- [{"desde":1000,"monto":50}, …]; gana el más alto
  vence_el               TIMESTAMPTZ,                  -- fin fijo del cupón (gana sobre vence_en_dias)
  vence_en_dias          INT,                          -- o días desde que se otorga; sin ninguno no vence
  minimo_uso             NUMERIC(10,2),                -- compra mínima para gastarlo; sin esto no hay
  excluir_profesionales  BOOLEAN NOT NULL DEFAULT true,
  avisar_push            BOOLEAN NOT NULL DEFAULT true,
  avisar_correo          BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE promo_cashback ENABLE ROW LEVEL SECURITY;

-- Buen Fin 2026: APAGADA. Fechas en hora de México (-06).
INSERT INTO promo_cashback (id, activo, titulo, prefijo, desde, hasta, escalones)
VALUES (
  'buen-fin-2026', false, 'Cashback Buen Fin', 'BF',
  '2026-11-13 00:00:00-06', '2026-11-17 23:59:59-06',
  '[{"desde":1000,"monto":50},{"desde":1500,"monto":100},{"desde":2000,"monto":150}]'
)
ON CONFLICT (id) DO NOTHING;

-- Para arrancar (cambiar `desde` si arranca hoy):
--   UPDATE promo_cashback SET activo = true, desde = now() WHERE id = 'buen-fin-2026';
-- Para cortar:
--   UPDATE promo_cashback SET activo = false WHERE id = 'buen-fin-2026';
-- Ver lo otorgado:
--   SELECT email, code, valor, used_at, used_order, email_sent_at, created_at
--     FROM customer_discounts WHERE origen = 'cashback:buen-fin-2026' ORDER BY created_at DESC;
