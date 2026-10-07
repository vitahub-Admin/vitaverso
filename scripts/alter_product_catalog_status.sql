-- ─────────────────────────────────────────────────────────────
-- Catálogo: estado del producto en Shopify
--
-- ACTIVE | DRAFT | ARCHIVED | UNLISTED, tal cual lo devuelve Shopify. El catálogo
-- guarda todos los productos que existen (hoy 35% no están activos) y sin esta
-- columna las consultas que leen solo de acá no pueden distinguirlos.
--
-- Una sola columna nullable: las filas existentes quedan en NULL hasta que corra
-- el sync (node scripts/sync_product_catalog.js, o el proceso programado diario),
-- que la llena. Mientras esté en NULL, el código trata la fila como visible.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS status text;
