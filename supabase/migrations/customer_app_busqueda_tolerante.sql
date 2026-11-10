-- Búsqueda de la tienda de Mi Vitahub tolerante a errores de escritura ("mangesio" → magnesio),
-- sin importar acentos ("proteina" → proteína), espacios ni guiones ("blife" → B-Life / B Life).
--
-- Se busca desde el inicio de las palabras del producto, no adentro: "niños" no cae en
-- "femeninos". Lo de 3 letras o menos tiene que ser la palabra entera ("sop" no es "soporte").
-- Con varias palabras ("omega blife") vale que estén todas, en cualquier orden.
--
-- pg_trgm (word_similarity) cubre lo que está mal escrito.
-- Primero salen las coincidencias exactas (antes las de ingrediente principal y nombre que las
-- de una fórmula que lo trae entre muchos), después las parecidas.
--
-- La usa GET /api/customer-app/store?q=... (src/lib/customerStore.js → buscar). Si esta
-- función no existe, la búsqueda sigue funcionando como antes (solo coincidencia exacta).
--
-- Correr completo en el SQL Editor de Supabase. Se puede correr más de una vez.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Texto buscado → patrón: empieza en una palabra, admite signos o espacios entre letras y, si
-- es corto, termina ahí. "blife" → \mb[^a-z0-9]*l[^a-z0-9]*i[^a-z0-9]*f[^a-z0-9]*e
CREATE OR REPLACE FUNCTION patron_busqueda(s text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN x = '' THEN NULL ELSE
           '\m' || regexp_replace(x, '(.)(?!$)', '\1[^a-z0-9]*', 'g') || CASE WHEN length(x) <= 3 THEN '\M' ELSE '' END
         END
    FROM (SELECT regexp_replace(lower(s), '[^a-z0-9]', '', 'g') AS x) AS a;
$$;

CREATE OR REPLACE FUNCTION buscar_catalogo(q text, cat text DEFAULT NULL, lim int DEFAULT 160)
RETURNS TABLE (product_id bigint, variant_id bigint, title text, brand text, score real)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  WITH t AS (
    SELECT lower(unaccent(trim(q))) AS q,
           patron_busqueda(unaccent(trim(q))) AS frase,
           -- cada palabra por separado (sin relleno tipo "de", "para")
           ARRAY(
             SELECT patron_busqueda(w)
               FROM regexp_split_to_table(lower(unaccent(trim(q))), '\s+') AS w
              WHERE length(regexp_replace(w, '[^a-z0-9]', '', 'g')) >= 2
                AND w NOT IN ('de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por', 'en', 'un', 'una')
           ) AS palabras
  ),
  c AS (
    SELECT pc.product_id, pc.variant_id, pc.title, pc.brand,
           lower(unaccent(coalesce(pc.primary_ingredient, ''))) AS ingrediente,
           -- el nombre sin lo que va después del primer "|" (beneficios y listas de ingredientes)
           lower(unaccent(btrim(split_part(btrim(pc.title, ' |'), '|', 1)))) AS nombre,
           lower(unaccent(coalesce(pc.brand, ''))) AS marca,
           lower(unaccent(concat_ws(' ', pc.title, pc.brand, pc.primary_ingredient, pc.componente))) AS texto
      FROM product_catalog pc
     WHERE pc.status = 'ACTIVE'
       -- Los profesionales también salen (solo se muestran si están publicados en vitahub.mx)
       AND (cat IS NULL OR pc.level_2 = cat)
  ),
  m AS (
    SELECT c.*,
           (cardinality(t.palabras) > 0 AND NOT EXISTS (
              SELECT 1 FROM unnest(t.palabras) w WHERE NOT ((c.nombre || ' ' || c.marca) ~ w)
           )) AS todas_en_nombre,
           (cardinality(t.palabras) > 0 AND NOT EXISTS (
              SELECT 1 FROM unnest(t.palabras) w WHERE NOT (c.texto ~ w)
           )) AS todas_en_texto
      FROM c, t
  )
  SELECT m.product_id, m.variant_id, m.title, m.brand,
         -- Dónde aparece lo que buscó: ingrediente principal (4) > nombre del producto (3) >
         -- todas sus palabras en nombre y marca (2.8) > en cualquier parte, p. ej. la lista de
         -- una fórmula (2) > parecido, con errores (<1)
         (CASE
            WHEN m.ingrediente ~ t.frase THEN 4
            WHEN m.nombre ~ t.frase THEN 3
            WHEN m.todas_en_nombre THEN 2.8
            WHEN m.texto ~ t.frase OR m.todas_en_texto THEN 2
            ELSE word_similarity(t.q, m.texto)
          END)::real AS score
    FROM m, t
   WHERE length(t.q) >= 2
     AND (m.texto ~ t.frase OR m.todas_en_texto OR word_similarity(t.q, m.texto) >= 0.35)
   ORDER BY score DESC, length(m.nombre), m.nombre
   LIMIT lim;
$$;

-- Solo el backend (service role) las llama
REVOKE ALL ON FUNCTION buscar_catalogo(text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION patron_busqueda(text) FROM PUBLIC, anon, authenticated;
