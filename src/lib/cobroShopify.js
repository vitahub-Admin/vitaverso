/**
 * Cobro por el checkout de Shopify, con pedido borrador.
 *
 * Shopify solo cobra. El pedido se arma, se descuenta y se despacha en nuestra
 * plataforma; a Shopify le mandamos un borrador con UNA línea libre por el
 * total final ("Protocolo de <profesional>"). Una línea sin variante no toca
 * el inventario de Shopify, y el paciente paga con cualquiera de los métodos
 * que la tienda ya tiene conectados (Shopify Payments, Google Pay, PayPal,
 * Mercado Pago…).
 *
 * Cuando el paciente paga, Shopify crea la orden y avisa por webhook. La orden
 * lleva la etiqueta `cobro-vitahub` y el id de nuestra venta como atributo,
 * para que el resto del sistema sepa que no es una compra de tienda.
 */

export const ETIQUETA_COBRO = 'cobro-vitahub';

const GQL = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join(' | '));
  return json.data;
}

/**
 * Crea el borrador y devuelve el enlace de pago.
 *
 * @param {object} p
 * @param {string} p.ventaId       id de local_orders
 * @param {string} p.profesional   nombre de quien armó el protocolo
 * @param {number} p.monto         lo que se cobra, ya final (con envío y descuento)
 * @param {string} p.email         del paciente: ahí le llega el comprobante
 * @param {string} [p.nombre]
 * @param {object} [p.direccion]   { calle, colonia, cp, ciudad, estado } — solo si hay envío
 * @returns {{ id: string, invoiceUrl: string }}
 */
export async function crearBorrador({ ventaId, profesional, monto, email, nombre, direccion }) {
  const [firstName, ...resto] = String(nombre || '').trim().split(/\s+/);

  const input = {
    email,
    // Sin impuestos agregados: el total ya viene calculado por nuestra plataforma
    taxExempt: true,
    tags: [ETIQUETA_COBRO],
    note: `Cobro de consultorio · venta ${ventaId}`,
    customAttributes: [
      { key: 'local_order_id', value: String(ventaId) },
      { key: 'origen', value: 'cobro-vitahub' },
    ],
    lineItems: [{
      title:            `Protocolo de ${profesional || 'tu especialista'}`,
      originalUnitPrice: Number(monto).toFixed(2),
      quantity:         1,
      taxable:          false,
      requiresShipping: false,
    }],
  };

  // La dirección va en el borrador para que quede en la orden y el equipo sepa
  // a dónde despachar, pero la línea no "requiere envío": Shopify no tiene que
  // cotizar nada, el envío ya está dentro del total.
  if (direccion?.calle) {
    input.shippingAddress = {
      firstName: firstName || undefined,
      lastName:  resto.join(' ') || undefined,
      address1:  direccion.calle,
      address2:  direccion.colonia || undefined,
      city:      direccion.ciudad,
      province:  direccion.estado,
      zip:       direccion.cp,
      countryCode: 'MX',
    };
  }

  const data = await gql(
    `mutation($input: DraftOrderInput!) {
       draftOrderCreate(input: $input) {
         draftOrder { id invoiceUrl }
         userErrors { field message }
       }
     }`,
    { input }
  );

  const { draftOrder, userErrors } = data.draftOrderCreate;
  if (userErrors?.length) throw new Error(userErrors.map(e => e.message).join(' | '));
  if (!draftOrder?.invoiceUrl) throw new Error('Shopify no devolvió el enlace de pago');
  return { id: draftOrder.id, invoiceUrl: draftOrder.invoiceUrl };
}

/**
 * Estado de un borrador. `COMPLETED` significa que el paciente ya pagó.
 * @returns {{ status: string, orderId: string|null } | null}  null si ya no existe
 */
export async function estadoBorrador(draftId) {
  const data = await gql(
    `query($id: ID!) { draftOrder(id: $id) { status order { id legacyResourceId } } }`,
    { id: draftId }
  );
  const d = data.draftOrder;
  if (!d) return null;
  return { status: d.status, orderId: d.order?.legacyResourceId || null };
}

/** Borra un borrador abierto. Un borrador ya pagado no se puede borrar: se ignora. */
export async function borrarBorrador(draftId) {
  try {
    await gql(
      `mutation($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { message } } }`,
      { input: { id: draftId } }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Reconoce una orden de Shopify que nació de un cobro nuestro.
 * Función pura, sin efectos: la usa el webhook para decidir qué hacer.
 */
export function interpretarOrdenShopify(payload) {
  const tags = String(payload?.tags || '').split(',').map(t => t.trim().toLowerCase());
  const attr = (n) => payload?.note_attributes?.find(a => a.name === n)?.value || null;

  const esCobro = tags.includes(ETIQUETA_COBRO) || attr('origen') === 'cobro-vitahub';

  // Cancelada en Shopify, o reembolsada por completo. Un reembolso PARCIAL no
  // cuenta: la venta sigue en pie y no hay forma de saber a qué productos
  // corresponde, así que se deja pasar y se resuelve a mano.
  const cancelada =
    Boolean(payload?.cancelled_at) ||
    ['refunded', 'voided'].includes(payload?.financial_status);

  return {
    esCobro,
    ventaId:  esCobro ? attr('local_order_id') : null,
    orderId:  payload?.id ? String(payload.id) : null,
    cancelada,
    // Una orden cancelada puede seguir diciendo "paid" si se canceló sin reembolsar:
    // no es un pago que haya que cerrar.
    pagado:   payload?.financial_status === 'paid' && !cancelada,
    parcial:  payload?.financial_status === 'partially_refunded',
  };
}
