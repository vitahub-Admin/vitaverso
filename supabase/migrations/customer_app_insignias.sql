-- Insignias de la tienda de Mi Vitahub ("Oferta", "Buen Fin", "Nuevo"...): se dibujan sobre
-- la foto del producto, hasta 3 por producto. Se cambian acá, sin actualizar la app.
-- La lee src/lib/customerBadges.js (caché de 5 min). Tabla vacía = sin insignias.
--
-- Una fila = una insignia con su regla. Reglas (columna regla, jsonb):
--   {"tipo":"todos"}                              todos los productos
--   {"tipo":"tag","valor":"buen-fin"}             productos con ese tag en Shopify (sin importar mayúsculas)
--   {"tipo":"oferta"}                             con precio regular tachado (compare at)
--   {"tipo":"descuento_min","valor":20}           oferta de al menos 20 %
--   {"tipo":"precio_min","valor":500}             precio de venta >= 500
--   {"tipo":"precio_max","valor":300}             precio de venta <= 300
--   {"tipo":"precio_app"}                         con precio exclusivo de app vigente
--   {"tipo":"producto","valor":["8123","8456"]}   esos productos (id de producto de Shopify)
--   {"tipo":"agotado"}                            sin stock
--   Varias condiciones juntas (todas deben cumplirse):
--   {"tipo":"y","valor":[{"tipo":"tag","valor":"buen-fin"},{"tipo":"descuento_min","valor":15}]}
--
-- texto admite {descuento} → "25%" (si tiene precio tachado). Ej.: "-{descuento}".
-- icono_url: imagen chica (PNG/SVG con https), opcional; puede ir sola, sin texto.
-- prioridad: menor número = va primero. desde/hasta: vigencia opcional.
--
-- Ejemplo:
--   insert into customer_app_badges (texto, regla, color_fondo, prioridad, hasta)
--   values ('Buen Fin', '{"tipo":"tag","valor":"buen-fin"}', '#d62828', 10, '2026-11-18');
--
-- Correr completo en el SQL Editor de Supabase. Se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS customer_app_badges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  activo       boolean NOT NULL DEFAULT true,
  nombre       text,                                   -- para identificarla (no se muestra)
  texto        text,                                   -- lo que dice la insignia (máx. 24 caracteres)
  icono_url    text,                                   -- imagen chica opcional (https)
  color_texto  text NOT NULL DEFAULT '#ffffff',
  color_fondo  text NOT NULL DEFAULT '#1b3f7a',
  regla        jsonb NOT NULL DEFAULT '{"tipo":"todos"}',
  prioridad    integer NOT NULL DEFAULT 100,
  desde        timestamptz,
  hasta        timestamptz
);

-- Solo el servidor (service role) la usa
ALTER TABLE customer_app_badges ENABLE ROW LEVEL SECURITY;
