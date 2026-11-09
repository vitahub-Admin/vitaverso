-- ─────────────────────────────────────────────────────────────
-- Registro de afiliados desde Pro (/registro)
--
-- Una fila por intento de registro. Se crea al enviar el formulario (antes de verificar el correo)
-- y avanza por pasos, así que sirve de bitácora: si algo se corta a la mitad queda en qué paso se
-- quedó y se puede reanudar sin duplicar nada en Shopify.
--
--   datos          formulario enviado, código mandado al correo
--   codigo         (reservado) código reenviado
--   verificado     el correo ya se confirmó, falta crear la cuenta
--   cuenta_creada  cliente + colección en Shopify y fila en affiliates listos
--   completado     entró a Pro
--   falla          algo falló después de verificar el correo (ver ultimo_error)
--
-- Pendientes:  select * from registro_afiliados where paso in ('falla','verificado') order by created_at desc;
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS registro_afiliados (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  email                 text   NOT NULL,                 -- en minúsculas
  datos                 jsonb  NOT NULL,                 -- lo que llenó en el formulario
  source_ref            text,                            -- quién lo refirió (sourceRef de la URL)
  ip                    text,
  paso                  text   NOT NULL DEFAULT 'datos',
  verificado_at         timestamptz,
  shopify_customer_id   bigint,
  shopify_collection_id bigint,
  afiliado_creado_at    timestamptz,
  completado_at         timestamptz,
  ultimo_error          text,
  intentos_cuenta       integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS registro_afiliados_email ON registro_afiliados (email, created_at DESC);
CREATE INDEX IF NOT EXISTS registro_afiliados_ip    ON registro_afiliados (ip, created_at DESC);

-- Solo el servidor (service role) la usa
ALTER TABLE registro_afiliados ENABLE ROW LEVEL SECURITY;
