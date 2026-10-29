-- ─────────────────────────────────────────────────────────────
-- Folio corto para las ventas en efectivo (EF-0001, EF-0002…)
--
-- Sirve para citar un cobro en una conversación o una reconciliación sin usar el uuid.
-- Las ventas que ya existen reciben su folio por orden de creación.
-- Correr completo en el SQL Editor de Supabase. Se puede correr más de una vez sin dañar nada.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE ventas_efectivo ADD COLUMN IF NOT EXISTS folio bigint;

CREATE SEQUENCE IF NOT EXISTS ventas_efectivo_folio_seq;

-- Relleno de las que no tienen folio, de la más vieja a la más nueva
WITH orden AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM ventas_efectivo WHERE folio IS NULL
), base AS (
  SELECT COALESCE(MAX(folio), 0) AS m FROM ventas_efectivo
)
UPDATE ventas_efectivo v SET folio = base.m + orden.n
FROM orden, base WHERE v.id = orden.id;

-- La secuencia sigue después del último folio
SELECT setval('ventas_efectivo_folio_seq', GREATEST(COALESCE((SELECT MAX(folio) FROM ventas_efectivo), 0), 1),
              (SELECT COUNT(*) > 0 FROM ventas_efectivo));

ALTER TABLE ventas_efectivo ALTER COLUMN folio SET DEFAULT nextval('ventas_efectivo_folio_seq');
ALTER TABLE ventas_efectivo ALTER COLUMN folio SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_efectivo_folio ON ventas_efectivo (folio);
