/**
 * BaseLinker: lo mínimo que necesita el cobro de consultorio.
 *
 * BaseLinker importa cada orden de Shopify, pero NO sigue sus cancelaciones: una
 * orden cancelada en Shopify se queda en "Nuevos Pedidos Shopify" y el operario
 * puede terminar preparándola. Cuando nuestra reversa deshace una venta, cierra
 * también la orden de BaseLinker con esto.
 *
 * Sin imports relativos a propósito: lo carga igual Next que Node directo.
 */

const BL_URL = 'https://api.baselinker.com/connector.php';

async function bl(method, parameters = {}) {
  const res = await fetch(BL_URL, {
    method: 'POST',
    headers: {
      'X-BLToken': process.env.BASELINKER_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ method, parameters: JSON.stringify(parameters) }).toString(),
  });
  const json = await res.json();
  if (json.status !== 'SUCCESS') throw new Error(`BaseLinker ${method}: ${json.error_message || json.error_code}`);
  return json;
}

/** La orden de BaseLinker que corresponde a una orden de Shopify, por su número. */
export async function buscarOrdenPorNumeroShopify(numero) {
  const r = await bl('getOrders', { get_unconfirmed_orders: true, filter_shop_order_id: String(numero) });
  const ordenes = r.orders || [];
  return ordenes.find(o => o.order_source === 'shop') || ordenes[0] || null;
}

// El id del estado "Cancelado" se busca por nombre y se recuerda: es el mismo siempre.
// BL_STATUS_CANCELADO permite fijarlo si algún día se renombra.
let idCancelado = null;
async function estadoCancelado() {
  if (process.env.BL_STATUS_CANCELADO) return Number(process.env.BL_STATUS_CANCELADO);
  if (idCancelado) return idCancelado;
  const r = await bl('getOrderStatusList');
  const e = (r.statuses || []).find(s => s.name.trim().toLowerCase() === 'cancelado');
  if (!e) throw new Error('No encontré un estado "Cancelado" en BaseLinker');
  return (idCancelado = e.id);
}

/**
 * Cancela la orden de BaseLinker y libera el stock que tenía reservado.
 *
 *   1. La pasa a "Cancelado" y deja el motivo en sus comentarios.
 *   2. Retira las líneas ligadas a un producto del catálogo.
 *
 * El paso 2 es lo que de verdad devuelve el stock. Cancelar una orden en
 * BaseLinker NO suelta su reserva: se comprobó con una orden de prueba, que siguió
 * descontando 1 unidad del central estando en "Cancelado", y como BaseLinker manda
 * sobre Shopify, el stock que Shopify recuperaba al cancelar con "restock" se lo
 * volvía a pisar. Al quitar la línea la reserva se libera (central 7 → 8) y Shopify
 * lo sigue en ~1 minuto. Las líneas libres (lo entregado en consultorio) no reservan
 * nada y se dejan como constancia. Lo retirado queda anotado en los comentarios.
 *
 * Es idempotente y reintentable: si un aviso anterior cambió el estado pero no llegó
 * a quitar las líneas, el siguiente las quita.
 *
 * @param {number|string} numeroShopify  `order_number` de la orden de Shopify
 * @returns {{ ok: boolean, orderId?: number, yaCancelada?: boolean, lineasRetiradas?: number, motivo?: string }}
 *          `motivo: 'no-importada'` si BaseLinker todavía no la trae (tarda ~1 minuto en
 *          importarla); el siguiente aviso de Shopify lo reintenta.
 */
export async function cancelarOrdenEnBaseLinker(numeroShopify, motivo = 'Cancelada en Shopify') {
  const orden = await buscarOrdenPorNumeroShopify(numeroShopify);
  if (!orden) return { ok: false, motivo: 'no-importada' };

  const cancelado   = await estadoCancelado();
  const yaCancelada = Number(orden.order_status_id) === Number(cancelado);
  const ligadas     = (orden.products || []).filter(p => p.product_id && String(p.product_id) !== '0');

  if (yaCancelada && !ligadas.length) {
    return { ok: true, orderId: orden.order_id, yaCancelada: true, lineasRetiradas: 0 };
  }

  if (!yaCancelada) await bl('setOrderStatus', { order_id: orden.order_id, status_id: cancelado });

  // El comentario se suma al que ya hubiera: no se pisa lo que escribió una persona.
  // Va ANTES de quitar las líneas, así queda dicho qué se retiró aunque algo falle después.
  const detalle = ligadas.map(p => `${p.quantity}× ${p.sku || p.name}`).join(', ');
  const nuevo = [
    yaCancelada ? null : `${motivo} (Vitahub Pro)`,
    ligadas.length ? `Líneas retiradas para liberar el stock reservado: ${detalle}` : null,
  ].filter(Boolean).join('\n');
  const previo = String(orden.admin_comments || '').trim();
  if (nuevo) {
    await bl('setOrderFields', { order_id: orden.order_id, admin_comments: [previo, nuevo].filter(Boolean).join('\n') });
  }

  for (const p of ligadas) {
    await bl('deleteOrderProduct', { order_id: orden.order_id, order_product_id: p.order_product_id });
  }

  return { ok: true, orderId: orden.order_id, lineasRetiradas: ligadas.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock del almacén "Consultorios"
//
// El inventario que los profesionales tienen en consignación vive en su propio
// almacén de BaseLinker, excluido de todas las integraciones (Shopify no lo cuenta
// como disponible). Cada movimiento es un DOCUMENTO de inventario: suma o resta de
// forma atómica, a diferencia de updateInventoryProductsStock, que fija el valor
// absoluto y se pisaría con otro cambio simultáneo.
//
//   entrega      → traspaso central → Consultorios
//   devolucion   → traspaso Consultorios → central
//   venta        → salida (GI) de Consultorios por lo entregado en mano
//   reversa      → entrada (GR) a Consultorios cuando se cancela esa venta
//
// Nada de esto frena el negocio: si BaseLinker falla, el libro de consignación (que
// es lo que ve el profesional) ya quedó bien y esto devuelve { ok:false } para que
// quien llama lo registre. `scripts/reconciliar_consultorios.mjs` encuentra la
// diferencia si algo quedó sin reflejarse.
// ─────────────────────────────────────────────────────────────────────────────

const INVENTARIO   = Number(process.env.BASELINKER_INVENTORY_ID || 50176);
const CENTRAL      = Number(process.env.BASELINKER_ALMACEN_CENTRAL || 59011);
const CONSULTORIOS = Number(process.env.BASELINKER_ALMACEN_CONSULTORIOS || 76352);

// Los almacenes llevan ubicaciones (WMS): cada unidad vive en una, y un documento tiene
// que decir de cuál sale y a cuál entra. Se usa la ubicación asignada al producto en
// cada almacén; en Consultorios, si el producto aún no tiene una, la de recepción.
const UBICACION_CONSULTORIOS = process.env.BASELINKER_UBICACION_CONSULTORIOS || 'Admisiones';

// 0 GR (entrada) · 2 GI (salida) · 4 traspaso entre almacenes
const DOC = { entrada: 0, salida: 2, traspaso: 4 };

let _series = null;
async function serieDe(almacen, tipo) {
  if (!_series) _series = (await bl('getInventoryDocumentSeries')).document_series || [];
  return _series.find(s => s.warehouse_id === almacen && s.document_type === tipo)?.document_series_id;
}

/** El producto de BaseLinker (hijo si tiene variantes) de una variante de Shopify. */
export async function productoBL({ product_id, sku }) {
  const l = await bl('getInventoryProductsList', { inventory_id: INVENTARIO, filter_sku: String(product_id) });
  const padre = Object.values(l.products || {})[0];
  if (!padre) return null;
  const d = (await bl('getInventoryProductsData', { inventory_id: INVENTARIO, products: [padre.id] })).products?.[padre.id];
  const hijo = Object.entries(d?.variants || {}).find(([, v]) => v.sku === sku);
  return hijo ? Number(hijo[0]) : padre.id;
}

async function documento({ tipo, almacen, destino = null, items, notas }) {
  const serie = await serieDe(almacen, tipo);
  const doc = await bl('addInventoryDocument', {
    warehouse_id: almacen,
    ...(destino ? { target_warehouse_id: destino } : {}),
    document_type: tipo,
    ...(serie ? { document_series_id: serie } : {}),
    notes: String(notas || '').slice(0, 500),
  });
  try {
    await bl('addInventoryDocumentItems', { document_id: doc.document_id, items });
    await bl('setInventoryDocumentStatusConfirmed', { document_id: doc.document_id });
  } catch (e) {
    throw new Error(`${e.message} (queda el borrador ${doc.document_id} sin confirmar)`);
  }
  return doc.document_id;
}

/**
 * @param {'entrega'|'devolucion'|'venta'|'reversa'} sentido
 * @param {Array<{product_id, sku, cantidad}>} lineas  variantes de Shopify
 * @param {string} nota  queda en el documento de BaseLinker, para rastrearlo
 * @returns {{ ok: boolean, documento?: number, motivo?: string }}
 */
export async function moverStockConsultorios(sentido, lineas = [], nota = '') {
  try {
    const items = [];
    for (const l of lineas) {
      const cantidad = Number(l.cantidad);
      if (!(cantidad > 0)) continue;
      const id = await productoBL(l);
      if (!id) return { ok: false, motivo: `producto ${l.sku || l.product_id} no encontrado en BaseLinker` };
      const ub = (await bl('getInventoryProductsData', { inventory_id: INVENTARIO, products: [id] })).products?.[id]?.locations || {};
      const enCentral      = ub[`bl_${CENTRAL}`] ?? '';
      const enConsultorios = ub[`bl_${CONSULTORIOS}`] || UBICACION_CONSULTORIOS;
      const ubicaciones = {
        entrega:    { location_name: enCentral,      target_location_name: enConsultorios },
        devolucion: { location_name: enConsultorios, target_location_name: enCentral },
        venta:      { location_name: enConsultorios },
        reversa:    { location_name: enConsultorios },
      }[sentido];
      items.push({ product_id: id, quantity: cantidad, ...ubicaciones });
    }
    if (!items.length) return { ok: true, documento: null };

    const nota500 = `Vitahub Pro · ${sentido}${nota ? ` · ${nota}` : ''}`;
    const args = {
      entrega:    { tipo: DOC.traspaso, almacen: CENTRAL,      destino: CONSULTORIOS },
      devolucion: { tipo: DOC.traspaso, almacen: CONSULTORIOS, destino: CENTRAL },
      venta:      { tipo: DOC.salida,   almacen: CONSULTORIOS },
      reversa:    { tipo: DOC.entrada,  almacen: CONSULTORIOS },
    }[sentido];
    if (!args) return { ok: false, motivo: `movimiento desconocido: ${sentido}` };

    return { ok: true, documento: await documento({ ...args, items, notas: nota500 }) };
  } catch (e) {
    console.error('[baselinker consultorios]', sentido, e.message);
    return { ok: false, motivo: e.message };
  }
}
