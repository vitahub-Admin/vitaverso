-- Búsqueda de la tienda de Mi Vitahub tolerante a errores de escritura ("mangesio" → magnesio)
-- y sin importar acentos ("proteina" → proteína).
--
-- pg_trgm compara por grupos de 3 letras: word_similarity mide qué tanto se parece lo que
-- escribió el cliente a alguna palabra del producto (nombre, marca, ingrediente o componente).
-- Primero salen las coincidencias exactas, después las parecidas.
--
-- La usa GET /api/customer-app/store?q=... (src/lib/customerStore.js → buscar). Si esta
-- función no existe, la búsqueda sigue funcionando como antes (solo coincidencia exacta).
--
-- Correr completo en el SQL Editor de Supabase. Se puede correr más de una vez.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION buscar_catalogo(q text, cat text DEFAULT NULL, lim int DEFAULT 160)
RETURNS TABLE (product_id bigint, variant_id bigint, title text, brand text, score real)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  WITH t AS (
    SELECT lower(unaccent(trim(q))) AS q
  ),
  c AS (
    SELECT pc.product_id, pc.variant_id, pc.title, pc.brand,
           lower(unaccent(concat_ws(' ', pc.title, pc.brand, pc.primary_ingredient, pc.componente))) AS texto
      FROM product_catalog pc
     WHERE pc.status = 'ACTIVE'
       -- Los profesionales también salen (solo se muestran si están publicados en vitahub.mx)
       AND (cat IS NULL OR pc.level_2 = cat)
  )
  SELECT c.product_id, c.variant_id, c.title, c.brand,
         -- exacto = 1; si no, qué tan parecido es a alguna palabra del producto
         CASE WHEN c.texto LIKE '%' || t.q || '%' THEN 1 ELSE word_similarity(t.q, c.texto) END AS score
    FROM c, t
   WHERE length(t.q) >= 2
     AND (c.texto LIKE '%' || t.q || '%' OR word_similarity(t.q, c.texto) >= 0.35)
   ORDER BY score DESC, c.title
   LIMIT lim;
$$;

-- Solo el backend (service role) la llama
REVOKE ALL ON FUNCTION buscar_catalogo(text, text, int) FROM PUBLIC, anon, authenticated;
