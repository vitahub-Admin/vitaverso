-- ─────────────────────────────────────────────────────────────
-- Catálogo: modo de uso del fabricante
--
-- Texto plano ("Tomar 1 cápsula al día con alimentos…") extraído de la
-- descripción de cada producto en Shopify. Una sola columna nullable: los
-- productos que no lo traen quedan en NULL y la ficha simplemente no muestra
-- el bloque.
--
-- Se carga con: node scripts/cargar_modo_de_uso.mjs --aplicar
-- ─────────────────────────────────────────────────────────────

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS modo_de_uso text;
