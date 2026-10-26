// Modo tester de la consignación: SOLO para desarrollo local.
//
// Sirve para probar cómo se ve y se maneja la plataforma para un profesional que tiene
// producto en consignación, sin tocar nada real:
//   · el stock que se muestra es de mentira y no baja por más ventas que se cierren
//   · las ventas viven en la memoria del servidor local (se pierden al reiniciarlo)
//   · no se escribe en Supabase (consignment_stock, local_orders, movimientos), no se
//     mueve BaseLinker y no se acreditan comisiones
//
// Se enciende con CONSIGNACION_TESTER=1 en el .env local y se apaga solo en producción.
//   CONSIGNACION_TESTER_SKUS      lista de SKU con stock (por defecto, los de Rosa)
//   CONSIGNACION_TESTER_UNIDADES  unidades de cada uno (por defecto 5)

export const modoTester = () =>
  process.env.NODE_ENV !== "production" && process.env.CONSIGNACION_TESTER === "1";

export const esVentaTester = (id) => String(id).startsWith("tester-");

const SKUS_POR_DEFECTO = [
  "VHMX01949", "VHMX01950", "VHMX01951", "VHMX01952", "VHMX00941",
  "VHMX00938", "VHMX02121", "VHMX02639", "VHMX02120", "VHMX02652",
];

/**
 * Stock de mentira con la misma forma que las filas de consignment_stock.
 * @param supabase cliente para LEER el catálogo (no se escribe nada)
 */
export async function stockTester(supabase, ownerId = null) {
  const skus = (process.env.CONSIGNACION_TESTER_SKUS || SKUS_POR_DEFECTO.join(","))
    .split(",").map((s) => s.trim()).filter(Boolean);
  const unidades = Number(process.env.CONSIGNACION_TESTER_UNIDADES) || 5;

  const { data } = await supabase
    .from("product_catalog")
    .select("variant_id, product_id, title, variant_title, sku")
    .in("sku", skus);

  const ahora = new Date().toISOString();
  // Lo que el profesional ya entregó y cobró en efectivo, pero aún no paga, queda "reservado":
  // no cuenta como disponible, aunque en el libro siga siendo de Vitahub hasta que liquide.
  const reservadas = ownerId ? reservadasDe(ownerId) : {};
  const items = (data || []).map((p) => {
    const reservado = Math.min(unidades, reservadas[String(p.variant_id)] || 0);
    return {
      variant_id: p.variant_id,
      product_id: p.product_id,
      title: p.title,
      variant_title: p.variant_title,
      sku: p.sku,
      entregado: unidades, vendido: 0, devuelto: 0, ajuste: 0,
      reservado,
      disponible: unidades - reservado,
      updated_at: ahora,
    };
  });
  const disponibles = Object.fromEntries(items.map((i) => [String(i.variant_id), i.disponible]));
  return { items, disponibles };
}

// ── Ventas en memoria ─────────────────────────────────────────────────────────
// globalThis para que sobrevivan a la recarga de módulos del servidor de desarrollo
const tienda = () => (globalThis.__consigTesterVentas ||= new Map());

export const crearVentaTester = (datos) => {
  const venta = {
    id: `tester-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
    estado: "pendiente",
    payment_provider: "mock",
    ...datos,
  };
  tienda().set(venta.id, venta);
  return venta;
};
export const leerVentaTester = (id) => tienda().get(id) || null;
export const ventasTesterDe = (ownerId) =>
  [...tienda().values()].filter((v) => String(v.owner_id) === String(ownerId)).reverse();
export const actualizarVentaTester = (id, cambios) => {
  const v = tienda().get(id);
  if (!v) return null;
  Object.assign(v, cambios, { updated_at: new Date().toISOString() });
  return v;
};

export const NO_DISPONIBLE_EN_TESTER = "Esto no está disponible en el modo tester";

// ── Cobro en efectivo (prototipo) ─────────────────────────────────────────────
// El profesional entrega producto de su consultorio y cobra en mano, como punto de venta.
// Cada cobro se suma a un carrito de "efectivo por liquidar". Al cerrar el día, el profesional
// paga ese carrito completo por Shopify: recién ahí se cierran las ventas, se descuenta el
// inventario en BaseLinker y se acredita su comisión (igual que en cualquier venta). Antes de
// ese pago no pasa nada de eso. Por ahora solo existe en modo tester (memoria del servidor local).
const efectivo = () => (globalThis.__consigTesterEfectivo ||= []);

const redondear = (n) => Math.round(Number(n) * 100) / 100;

export function registrarEfectivoTester({ ownerId, patient_name, patient_phone, patient_email, items }) {
  const total = redondear(items.reduce((a, i) => a + i.price * i.quantity, 0));
  // La comisión va sobre el precio de lista y se acredita cuando se liquida
  const comision = redondear(items.reduce((a, i) => a + (i.price * i.quantity * (i.commission_percent || 0)) / 100, 0));
  const venta = {
    id: `ef-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    owner_id: String(ownerId),
    patient_name: patient_name || null,
    patient_phone: patient_phone || null,
    patient_email: patient_email || null,   // a este correo se le envía el protocolo cuando se liquida
    items,
    total,          // lo que el paciente pagó en efectivo = lo que el profesional paga al liquidar
    comision,       // lo que ganará de comisión al liquidar
    estado: "por_liquidar",
    liquidacion_id: null,   // venta de checkout con la que se está pagando, si ya se generó
    created_at: new Date().toISOString(),
    liquidada_at: null,
  };
  efectivo().push(venta);
  return venta;
}

/** Unidades por variante que están en ventas en efectivo sin pagar */
export function reservadasDe(ownerId) {
  const out = {};
  for (const v of efectivoDe(ownerId).pendientes) {
    for (const i of v.items) out[String(i.variant_id)] = (out[String(i.variant_id)] || 0) + i.quantity;
  }
  return out;
}

/** Todos los profesionales con efectivo por pagar (para el admin) */
export function efectivoPendienteDeTodos() {
  const dueños = [...new Set(efectivo().map((v) => v.owner_id))];
  return dueños
    .map((id) => {
      const e = efectivoDe(id);
      return {
        owner_id: id,
        ventas: e.totales.ventas,
        a_pagar: e.totales.a_pagar,
        comision: e.totales.comision,
        desde: e.pendientes.length ? e.pendientes[e.pendientes.length - 1].created_at : null,
        en_pago: Boolean(e.pago),
      };
    })
    .filter((x) => x.ventas > 0)
    .sort((a, b) => new Date(a.desde) - new Date(b.desde));
}

/** Ventas en efectivo del profesional. Antes de contarlas se revisa si ya se pagó el checkout. */
export function efectivoDe(ownerId) {
  const todas = efectivo().filter((v) => v.owner_id === String(ownerId));

  for (const v of todas) {
    if (v.estado !== "por_liquidar" || !v.liquidacion_id) continue;
    const pago = leerVentaTester(v.liquidacion_id);
    if (pago?.estado === "pagado") { v.estado = "liquidada"; v.liquidada_at = pago.paid_at || new Date().toISOString(); }
    else if (!pago || pago.estado === "cancelado") v.liquidacion_id = null;   // el pago se canceló: vuelve a estar pendiente
  }

  const pendientes = todas.filter((v) => v.estado === "por_liquidar").reverse();
  const liquidadas = todas.filter((v) => v.estado === "liquidada").reverse();
  const suma = (lista, campo) => redondear(lista.reduce((a, v) => a + v[campo], 0));
  const enPago = pendientes.find((v) => v.liquidacion_id);
  return {
    pendientes,
    liquidadas,
    totales: {
      ventas: pendientes.length,
      a_pagar: suma(pendientes, "total"),   // lo que paga al liquidar
      comision: suma(pendientes, "comision"), // lo que gana al liquidar
    },
    // Si ya se generó el checkout para liquidar: dónde se paga
    pago: enPago ? { id: enPago.liquidacion_id, payment_url: `/cobro/${enPago.liquidacion_id}` } : null,
  };
}

/**
 * Arma el checkout para pagar todo el efectivo acumulado: una sola venta con todos los
 * productos, entregados en mano (sin envío). Si ya había uno abierto, se cancela y se rehace
 * con lo que hay ahora.
 */
export function iniciarLiquidacionTester(ownerId, totalesDe) {
  const { pendientes, pago } = efectivoDe(ownerId);
  if (!pendientes.length) return null;
  if (pago) actualizarVentaTester(pago.id, { estado: "cancelado" });

  const porVariante = new Map();
  for (const v of pendientes) {
    for (const i of v.items) {
      const ya = porVariante.get(i.variant_id);
      if (ya) ya.quantity += i.quantity;
      else porVariante.set(i.variant_id, { ...i });
    }
  }
  const items = [...porVariante.values()].map((i) => ({ ...i, mano_qty: i.quantity }));

  const checkout = crearVentaTester({
    owner_id: String(ownerId),
    patient_name: "Liquidación de efectivo",
    items,
    liquidacion_efectivo: true,
    ...totalesDe(items),
  });
  for (const v of pendientes) v.liquidacion_id = checkout.id;
  return checkout;
}

