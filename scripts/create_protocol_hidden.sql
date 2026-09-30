-- ─────────────────────────────────────────────────────────────
-- protocol_hidden
--
-- Protocolos de ejemplo que un profesional decidió no ver más.
--
-- Los ejemplos son filas de `protocols` con is_public = true: una sola
-- fila para todos, así se corrige en un lugar. Pero el profesional tiene
-- que poder sacárselos de encima sin borrárselos a los demás, y por eso
-- el "borrar" de un ejemplo escribe acá en vez de eliminar el protocolo.
--
-- Se guarda en la base y no en el navegador a propósito: si viviera en
-- localStorage, el ejemplo volvería a aparecer en el celular después de
-- haberlo descartado en la computadora.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS protocol_hidden (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    bigint NOT NULL,          -- shopify_customer_id del profesional
  protocol_id uuid   NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (owner_id, protocol_id)
);

CREATE INDEX IF NOT EXISTS idx_protocol_hidden_owner ON protocol_hidden (owner_id);
