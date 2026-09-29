-- ─────────────────────────────────────────────────────────────
-- Venta de consultorio (consignación)
--
-- Producto que Vitahub deja físicamente en el espacio de un
-- profesional para que sus pacientes lo compren ahí mismo. El stock
-- sigue siendo de Vitahub y el paciente le paga a Vitahub: por eso la
-- venta se cobra con nuestra pasarela y NO entra a Shopify, para que
-- el CEDIS no prepare ni despache un pedido ya entregado en mano.
--
-- Shopify deja de ser la verdad de ese inventario, así que la lleva
-- este libro: qué se entregó, qué se vendió y qué queda.
-- ─────────────────────────────────────────────────────────────

-- Saldo por profesional y variante. Una fila por combinación.
CREATE TABLE IF NOT EXISTS consignment_stock (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      bigint  NOT NULL,          -- shopify_customer_id del profesional
  variant_id    bigint  NOT NULL,
  product_id    bigint,
  title         text,                      -- copia para mostrar sin joinear
  variant_title text,
  entregado     integer NOT NULL DEFAULT 0,
  vendido       integer NOT NULL DEFAULT 0,
  devuelto      integer NOT NULL DEFAULT 0, -- volvió al CEDIS
  ajuste        integer NOT NULL DEFAULT 0, -- conteos y mermas (puede ser negativo)
  -- Lo que le queda en el consultorio. Calculada: no se puede desincronizar.
  disponible    integer GENERATED ALWAYS AS (entregado - vendido - devuelto + ajuste) STORED,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (owner_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_consignment_stock_owner ON consignment_stock (owner_id);

-- Historial. Sin esto, la primera discusión sobre "yo tenía tres" no se
-- resuelve: el saldo dice cuánto hay, el movimiento dice por qué.
CREATE TABLE IF NOT EXISTS consignment_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       bigint  NOT NULL,
  variant_id     bigint  NOT NULL,
  tipo           text    NOT NULL CHECK (tipo IN ('entrega','venta','devolucion','ajuste')),
  cantidad       integer NOT NULL,          -- positivo; el tipo define hacia dónde suma
  motivo         text,
  local_order_id uuid,                      -- cuando el movimiento nace de una venta
  creado_por     bigint,                    -- quién lo registró
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignment_mov_owner ON consignment_movements (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consignment_mov_order ON consignment_movements (local_order_id);

-- Ventas de consultorio. Espejo de una orden de Shopify, pero nuestra.
CREATE TABLE IF NOT EXISTS local_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         bigint NOT NULL,
  sharecart_token  text,                    -- protocolo del que nació, si hubo
  patient_name     text,
  patient_phone    text,
  -- [{ variant_id, product_id, title, quantity, price, commission_percent }]
  items            jsonb  NOT NULL DEFAULT '[]',
  subtotal         numeric(10,2) NOT NULL DEFAULT 0,
  descuento        numeric(10,2) NOT NULL DEFAULT 0,
  total            numeric(10,2) NOT NULL DEFAULT 0,
  comision         numeric(10,2) NOT NULL DEFAULT 0,  -- ganancia del profesional
  estado           text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','pagado','cancelado','reembolsado')),
  payment_provider text DEFAULT 'stripe',
  payment_id       text,                    -- id de la sesión / del pago
  payment_fee      numeric(10,2),           -- lo que se quedó la pasarela
  payment_neto     numeric(10,2),           -- lo que entró a la cuenta
  paid_at          timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_orders_owner  ON local_orders (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_orders_estado ON local_orders (estado);

-- El webhook de la pasarela puede llegar dos veces por el mismo pago.
-- Este índice hace que el segundo intento falle en vez de descontar
-- stock y pagar comisión por duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_local_orders_payment_id
  ON local_orders (payment_id) WHERE payment_id IS NOT NULL;
