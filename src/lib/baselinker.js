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
 * Pasa la orden de BaseLinker a "Cancelado" y deja el motivo en sus comentarios.
 * Es idempotente: si ya estaba cancelada no hace nada.
 *
 * @param {number|string} numeroShopify  `order_number` de la orden de Shopify
 * @returns {{ ok: boolean, orderId?: number, yaCancelada?: boolean, motivo?: string }}
 *          `motivo: 'no-importada'` si BaseLinker todavía no la trae (tarda ~1 minuto en
 *          importarla); el siguiente aviso de Shopify lo reintenta.
 */
export async function cancelarOrdenEnBaseLinker(numeroShopify, motivo = 'Cancelada en Shopify') {
  const orden = await buscarOrdenPorNumeroShopify(numeroShopify);
  if (!orden) return { ok: false, motivo: 'no-importada' };

  const cancelado = await estadoCancelado();
  if (Number(orden.order_status_id) === Number(cancelado)) {
    return { ok: true, orderId: orden.order_id, yaCancelada: true };
  }

  await bl('setOrderStatus', { order_id: orden.order_id, status_id: cancelado });

  // El comentario se suma al que ya hubiera: no se pisa lo que escribió una persona
  const previo = String(orden.admin_comments || '').trim();
  await bl('setOrderFields', {
    order_id: orden.order_id,
    admin_comments: [previo, `${motivo} (Vitahub Pro)`].filter(Boolean).join('\n'),
  });

  return { ok: true, orderId: orden.order_id };
}
