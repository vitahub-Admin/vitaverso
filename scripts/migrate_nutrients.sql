-- migrate_nutrients.sql
-- Agrega columnas de nutrientes y clasificación al catálogo de productos.
-- Correr una sola vez en el SQL Editor de Supabase.

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS nutrients          jsonb,
  ADD COLUMN IF NOT EXISTS primary_ingredient text,
  ADD COLUMN IF NOT EXISTS primary_amount     numeric,
  ADD COLUMN IF NOT EXISTS primary_unit       text,
  ADD COLUMN IF NOT EXISTS is_professional    boolean DEFAULT false;

-- Índice para filtrar por ingrediente principal (búsquedas futuras en el builder)
CREATE INDEX IF NOT EXISTS idx_product_catalog_primary_ingredient
  ON product_catalog (primary_ingredient)
  WHERE primary_ingredient IS NOT NULL;

-- Índice para filtrar productos profesionales
CREATE INDEX IF NOT EXISTS idx_product_catalog_is_professional
  ON product_catalog (is_professional)
  WHERE is_professional = true;

-- Verificar resultado
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'product_catalog'
  AND column_name IN ('nutrients','primary_ingredient','primary_amount','primary_unit','is_professional')
ORDER BY ordinal_position;
