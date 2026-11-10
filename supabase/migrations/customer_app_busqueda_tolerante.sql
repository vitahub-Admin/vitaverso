-- Búsqueda de la tienda de Mi Vitahub tolerante a errores de escritura ("mangesio" → magnesio)
-- y sin importar acentos ("proteina" → proteína).
--
-- pg_trgm compara por grupos de 3 letras: word_similarity mide qué tanto se parece lo que
-- escribió el cliente a alguna palabra del producto (nombre, marca, ingrediente o componente).
-- Primero salen las coincidencias exactas (antes las de ingrediente principal y nombre que las
-- de una fórmula que lo trae entre muchos), después las parecidas.
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
           lower(unaccent(coalesce(pc.primary_ingredient, ''))) AS ingrediente,
           -- el nombre sin lo que va después del primer "|" (beneficios y listas de ingredientes)
           lower(unaccent(btrim(split_part(btrim(pc.title, ' |'), '|', 1)))) AS nombre,
           lower(unaccent(concat_ws(' ', pc.title, pc.brand, pc.primary_ingredient, pc.componente))) AS texto
      FROM product_catalog pc
     WHERE pc.status = 'ACTIVE'
       -- Los profesionales también salen (solo se muestran si están publicados en vitahub.mx)
       AND (cat IS NULL OR pc.level_2 = cat)
  )
  SELECT c.product_id, c.variant_id, c.title, c.brand,
         -- Dónde aparece lo que buscó: ingrediente principal (4) > nombre del producto (3) >
         -- en cualquier parte, p. ej. la lista de una fórmula (2) > parecido, con errores (<1)
         (CASE
            WHEN c.ingrediente LIKE '%' || t.q || '%' THEN 4
            WHEN c.nombre LIKE '%' || t.q || '%' THEN 3
            WHEN c.texto LIKE '%' || t.q || '%' THEN 2
            ELSE word_similarity(t.q, c.texto)
          END)::real AS score
    FROM c, t
   WHERE length(t.q) >= 2
     AND (c.texto LIKE '%' || t.q || '%' OR word_similarity(t.q, c.texto) >= 0.35)
   ORDER BY score DESC, length(c.nombre), c.nombre
   LIMIT lim;
$$;

-- Solo el backend (service role) la llama
REVOKE ALL ON FUNCTION buscar_catalogo(text, text, int) FROM PUBLIC, anon, authenticated;
