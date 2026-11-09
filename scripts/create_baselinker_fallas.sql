-- ─────────────────────────────────────────────────────────────
-- Acuse de falla de BaseLinker (almacén Consultorios)
--
-- Cuando un descuento o una entrega de consultorio guarda bien el libro pero BaseLinker no lo
-- registra, la falla queda aquí (src/lib/consultoriosStock.js). Así el libro y BaseLinker no se
-- desfasan en silencio, como pasó el 20 y 26 de octubre de 2026.
--
-- Pendientes:   select * from baselinker_fallas where resuelta_at is null order by created_at;
-- Reintentar:   node scripts/reintentar_baselinker_fallas.mjs --aplicar
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS baselinker_fallas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  sentido       text   NOT NULL,            -- entrega | devolucion | venta | reversa
  lineas        jsonb  NOT NULL,            -- [{ product_id, sku, variant_id, cantidad }]
  nota          text,
  motivo        text,                       -- el error que dio BaseLinker
  intentos      integer NOT NULL DEFAULT 1,
  resuelta_at   timestamptz,
  resuelta_nota text
);

CREATE INDEX IF NOT EXISTS baselinker_fallas_pendientes
  ON baselinker_fallas (created_at) WHERE resuelta_at IS NULL;

-- Solo el servidor (service role) la usa
ALTER TABLE baselinker_fallas ENABLE ROW LEVEL SECURITY;
