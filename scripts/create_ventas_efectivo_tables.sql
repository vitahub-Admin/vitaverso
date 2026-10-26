-- ─────────────────────────────────────────────────────────────
-- Ventas locales en efectivo (consignación)
--
-- El profesional entrega producto de su consultorio y cobra en mano. Cada cobro es una fila de
-- `ventas_efectivo`, "por_pagar". Al cerrar el día paga todo junto por el checkout de Shopify
-- (una `liquidaciones_efectivo`, que se apoya en una venta de consultorio de `local_orders`
-- con todo entregado en mano). Recién cuando ese pago se confirma se descuenta el libro, se
-- mueve BaseLinker y se acredita la comisión: el sistema de ventas de consultorio ya lo hace.
--
-- Mientras una venta está "por_pagar", sus unidades quedan RESERVADAS: no cuentan como
-- disponibles (vista `consignment_reservado`) pero el libro no se toca.
--
-- Correr completo en el SQL Editor de Supabase. Se puede correr más de una vez sin dañar nada.
-- ─────────────────────────────────────────────────────────────

-- El pago agrupado con el que el profesional liquida varias ventas en efectivo.
CREATE TABLE IF NOT EXISTS liquidaciones_efectivo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       bigint NOT NULL,                 -- shopify_customer_id del profesional
  estado         text   NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','pagada','cancelada')),
  total          numeric(10,2) NOT NULL DEFAULT 0, -- lo que paga: todo lo cobrado en efectivo
  comision       numeric(10,2) NOT NULL DEFAULT 0, -- lo que ganará al pagar (se acredita al confirmarse)
  -- La venta de consultorio con la que se cobra por Shopify. Al confirmarse, descuenta el libro,
  -- mueve BaseLinker y acredita la comisión.
  local_order_id uuid REFERENCES local_orders(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  paid_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_liq_efectivo_owner ON liquidaciones_efectivo (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_liq_efectivo_order ON liquidaciones_efectivo (local_order_id);

-- Cada cobro en efectivo.
CREATE TABLE IF NOT EXISTS ventas_efectivo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             bigint NOT NULL,
  sharecart_token      text,                      -- el protocolo, para enviarlo por correo al pagarse
  patient_name         text,
  patient_phone        text,
  patient_email        text,                      -- a este correo llega el protocolo cuando se paga
  -- [{ variant_id, product_id, title, variant_title, sku, image, quantity, price, commission_percent }]
  -- Precio y comisión se congelan al cobrar: si cambian después, esta venta no se mueve.
  items                jsonb  NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array'),
  total                numeric(10,2) NOT NULL DEFAULT 0,   -- lo que el paciente pagó en efectivo
  comision             numeric(10,2) NOT NULL DEFAULT 0,   -- lo que ganará el profesional
  estado               text NOT NULL DEFAULT 'por_pagar'
                         CHECK (estado IN ('por_pagar','pagada','cancelada')),
  liquidacion_id       uuid REFERENCES liquidaciones_efectivo(id) ON DELETE SET NULL,
  cancelada_motivo     text,
  cancelada_por        bigint,                    -- quién la canceló (profesional o admin)
  protocolo_enviado_at timestamptz,               -- cuándo se envió el correo del protocolo
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  paid_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ventas_efectivo_owner  ON ventas_efectivo (owner_id, estado);
CREATE INDEX IF NOT EXISTS idx_ventas_efectivo_estado ON ventas_efectivo (estado, created_at);
CREATE INDEX IF NOT EXISTS idx_ventas_efectivo_liq    ON ventas_efectivo (liquidacion_id);

-- Unidades reservadas: lo cobrado en efectivo que todavía no se paga. Se resta del disponible.
CREATE OR REPLACE VIEW consignment_reservado AS
SELECT v.owner_id,
       i.variant_id,
       SUM(i.quantity)::int AS reservado
FROM ventas_efectivo v
CROSS JOIN LATERAL jsonb_to_recordset(v.items) AS i(variant_id bigint, quantity int)
WHERE v.estado = 'por_pagar'
GROUP BY v.owner_id, i.variant_id;

-- Registrar un cobro en efectivo sin vender dos veces la misma unidad.
-- Se bloquea por profesional: si dos cobros llegan al mismo tiempo, el segundo espera al primero
-- y ve lo que el primero ya reservó. Si no alcanza el stock, avisa con SIN_STOCK:variante:hay:pidió.
CREATE OR REPLACE FUNCTION crear_venta_efectivo(
  p_owner           bigint,
  p_patient_name    text,
  p_patient_phone   text,
  p_patient_email   text,
  p_sharecart_token text,
  p_items           jsonb,
  p_total           numeric,
  p_comision        numeric
) RETURNS ventas_efectivo
LANGUAGE plpgsql AS $$
DECLARE
  linea     record;
  hay       int;
  apartado  int;
  nueva     ventas_efectivo;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'SIN_PRODUCTOS';
  END IF;

  PERFORM pg_advisory_xact_lock(p_owner);

  -- Si el mismo producto viene en dos líneas se suman: cada una por separado podría caber y juntas no
  FOR linea IN
    SELECT x.variant_id, SUM(x.quantity)::int AS quantity
    FROM jsonb_to_recordset(p_items) AS x(variant_id bigint, quantity int)
    GROUP BY x.variant_id
  LOOP
    IF linea.variant_id IS NULL OR linea.quantity IS NULL OR linea.quantity <= 0 THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;

    SELECT COALESCE(s.disponible, 0) INTO hay
      FROM consignment_stock s
      WHERE s.owner_id = p_owner AND s.variant_id = linea.variant_id;
    hay := COALESCE(hay, 0);

    SELECT COALESCE(SUM(r.reservado), 0) INTO apartado
      FROM consignment_reservado r
      WHERE r.owner_id = p_owner AND r.variant_id = linea.variant_id;

    IF hay - apartado < linea.quantity THEN
      RAISE EXCEPTION 'SIN_STOCK:%:%:%', linea.variant_id, hay - apartado, linea.quantity;
    END IF;
  END LOOP;

  INSERT INTO ventas_efectivo
    (owner_id, sharecart_token, patient_name, patient_phone, patient_email, items, total, comision)
  VALUES
    (p_owner, p_sharecart_token, p_patient_name, p_patient_phone, p_patient_email, p_items, p_total, p_comision)
  RETURNING * INTO nueva;

  RETURN nueva;
END;
$$;

-- ─── Seguridad ───────────────────────────────────────────────
-- Solo el servidor (llave de servicio, que se salta RLS) toca estas tablas. Con RLS activo y sin
-- políticas, la llave pública del navegador no puede leer ni escribir nada.
ALTER TABLE ventas_efectivo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidaciones_efectivo ENABLE ROW LEVEL SECURITY;

-- La vista respeta los permisos de quien la consulta (no los de su dueño) y se le quita el acceso público
ALTER VIEW consignment_reservado SET (security_invoker = true);

REVOKE ALL ON ventas_efectivo, liquidaciones_efectivo, consignment_reservado FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION crear_venta_efectivo(bigint, text, text, text, text, jsonb, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
