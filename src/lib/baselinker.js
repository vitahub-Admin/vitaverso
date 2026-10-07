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
