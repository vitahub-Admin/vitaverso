/**
 * Cobro por el checkout de Shopify, con pedido borrador.
 *
 * Shopify cobra y, para lo que se envía, también despacha como siempre: esas
 * unidades van como productos REALES (variante), así que Shopify descuenta su
 * inventario, BaseLinker importa la orden con sus SKU y el operario la prepara
 * como cualquier otra, con seguimiento de envío.
 *
 * Lo que el profesional entrega en su consultorio va como una línea LIBRE por
 * producto (su título y su precio, sin variante): Shopify no mueve inventario
 * —esas unidades ya salieron del depósito— y la línea no requiere envío, así que
 * no cuenta para nada de lo que se despacha.
 *
 * El paciente paga con cualquiera de los métodos que la tienda ya tiene conectados
 * (Shopify Payments, Google Pay, PayPal, Mercado Pago…).
 *
 * Cuando el paciente paga, Shopify crea la orden y avisa por webhook. La orden
 * lleva la etiqueta `vitahub-pro` y el id de nuestra venta como atributo, para que
 * el resto del sistema sepa que no es una compra de tienda.
 */

// Cómo se reconoce una orden nuestra. La etiqueta y el atributo `origen` dicen lo
// mismo; el segundo sirve si alguien le quita la etiqueta a mano.
export const ETIQUETA_COBRO = 'vitahub-pro';

// Nombres que se usaron antes. Órdenes ya cobradas (como la #ORDVHMX17600) siguen
// llevando el viejo: si se dejaran de reconocer, su cancelación o reembolso
// llegaría al webhook como una compra de tienda cualquiera y no se revertiría.
const NOMBRES_ANTERIORES = ['cobro-vitahub'];
const esNombreNuestro = (n) => n === ETIQUETA_COBRO || NOMBRES_ANTERIORES.includes(n);

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

const redondo = (n) => Number(Number(n).toFixed(2));

/**
 * Crea el borrador y devuelve el enlace de pago.
 *
 * @param {object} p
 * @param {string} p.ventaId       id de local_orders
 * @param {string} p.profesional   nombre de quien armó el protocolo
 * @param {number} p.monto         lo que se cobra al paciente, ya final
 * @param {string} p.email         del paciente: ahí le llega el comprobante
 * @param {string} [p.nombre]
 * @param {object} [p.direccion]   { calle, colonia, cp, ciudad, estado } — solo si hay envío
 * @param {Array}  p.lineas        [{ variantId, titulo, sku, precio, enviar, mano }]
 *                                 `enviar` unidades viajan (producto real); `mano` se entregan en consultorio
 * @param {number} [p.costoEnvio]  lo que cuesta el envío antes de descuentos
 * @param {string} [p.tituloEnvio] nombre de la tarifa de envío que eligió el paciente
 * @param {object} [p.descuento]   { monto, titulo } descuento total a mostrar (cupón y/o ajuste de prueba)
 * @returns {{ id: string, invoiceUrl: string, resumen: object }}
 */
export async function crearBorrador({ ventaId, profesional, monto, email, nombre, direccion, lineas = [], costoEnvio = 0, tituloEnvio = null, descuento = null }) {
  const [firstName, ...resto] = String(nombre || '').trim().split(/\s+/);

  const mano  = lineas.reduce((a, l) => a + Number(l.mano  || 0), 0);
  const envio = lineas.reduce((a, l) => a + Number(l.enviar || 0), 0);
  const hayEnvio = envio > 0;
  // Para filtrar en Shopify y en el webhook: qué parte del pedido viaja
  const tipoEntrega = hayEnvio ? (mano > 0 ? 'mixta' : 'envio') : 'mano';

  // ── Cuentas ─────────────────────────────────────────────────────────────────
  // Shopify suma líneas, resta el descuento y agrega el envío. El descuento se
  // aplica primero a los productos; si fuera más grande que ellos (por ejemplo un
  // cobro de prueba de monto fijo sobre un pedido chico), el resto le baja al envío.
  const subtotal       = lineas.reduce((a, l) => a + Number(l.precio) * (Number(l.enviar || 0) + Number(l.mano || 0)), 0);
  const desc           = Math.max(0, Number(descuento?.monto) || 0);
  const descProductos  = Math.min(desc, subtotal);
  const envioNeto      = Math.max(0, Number(costoEnvio || 0) - (desc - descProductos));
  const esperado       = redondo(subtotal - descProductos + envioNeto);

  // Si las líneas no suman lo que se va a cobrar es un error de armado nuestro, y
  // se detiene antes de crear nada en Shopify.
  if (Math.abs(esperado - Number(monto)) > 0.011) {
    throw new Error(`Las líneas suman ${esperado} pero se iba a cobrar ${Number(monto)}`);
  }

  // ── Líneas ──────────────────────────────────────────────────────────────────
  const lineItems = [];
  for (const l of lineas) {
    // Lo que viaja: el producto real, a su precio vivo de Shopify
    if (l.enviar > 0) {
      lineItems.push({ variantId: `gid://shopify/ProductVariant/${l.variantId}`, quantity: Number(l.enviar) });
    }
    // Lo que se entrega en el consultorio: una línea libre con su título y su
    // valor. Sin SKU a propósito: con uno, BaseLinker podría ligarla a un producto
    // de su catálogo y reservar stock de algo que no se va a despachar.
    if (l.mano > 0) {
      lineItems.push({
        title:             l.titulo,
        originalUnitPrice: Number(l.precio).toFixed(2),
        quantity:          Number(l.mano),
        taxable:           false,
        requiresShipping:  false,
        customAttributes:  [{ key: 'ENTREGA', value: 'EN CONSULTORIO · NO PREPARAR' }],
      });
    }
  }

  // La nota llega tal cual como comentario a BaseLinker: deja claro qué se envía y
  // qué NO se prepara, por si alguien abre la orden sin fijarse en las líneas.
  const recorte = (t) => String(t || '').replace(/\s+/g, ' ').slice(0, 60);
  const lista = (campo) => lineas
    .filter(l => l[campo] > 0)
    .map(l => `  ${l[campo]}× ${l.sku || ''} ${recorte(l.titulo)}`.trimEnd());
  const nota = [
    `Cobro de consultorio · venta ${ventaId}`,
    hayEnvio ? `ENVIAR (${envio} u.):\n${lista('enviar').join('\n')}` : null,
    mano > 0 ? `ENTREGADO EN CONSULTORIO, NO PREPARAR (${mano} u.):\n${lista('mano').join('\n')}` : null,
  ].filter(Boolean).join('\n');

  const input = {
    email,
    // Sin impuestos agregados: el total ya viene calculado por nuestra plataforma
    taxExempt: true,
    tags: [ETIQUETA_COBRO, `entrega-${tipoEntrega}`],
    note: nota,
    customAttributes: [
      { key: 'local_order_id', value: String(ventaId) },
      { key: 'origen', value: ETIQUETA_COBRO },
      { key: 'entrega', value: tipoEntrega },
      { key: 'unidades_envio', value: String(envio) },
      { key: 'unidades_mano', value: String(mano) },
    ],
    lineItems,
  };

  // Sin línea de envío a propósito: el checkout de Shopify pide la dirección del
  // paciente y cotiza las tarifas de la tienda (estándar, entrega local, DHL). Lo
  // entregado en el consultorio cuenta para el envío gratis.

  if (descProductos > 0) {
    input.appliedDiscount = {
      title:       descuento?.titulo || 'Descuento',
      description: descuento?.titulo || 'Descuento',
      valueType:   'FIXED_AMOUNT',
      value:       redondo(descProductos),
    };
  }

  // La dirección va en el borrador para que quede en la orden y el equipo sepa a
  // dónde despachar.
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
         draftOrder { id invoiceUrl totalPriceSet { shopMoney { amount } } }
         userErrors { field message }
       }
     }`,
    { input }
  );

  const { draftOrder, userErrors } = data.draftOrderCreate;
  if (userErrors?.length) throw new Error(userErrors.map(e => e.message).join(' | '));
  if (!draftOrder?.invoiceUrl) throw new Error('Shopify no devolvió el enlace de pago');

  // Última defensa: el total que calculó Shopify tiene que ser el que se va a
  // cobrar. Si el precio de un producto cambió en el medio, o Shopify redondeó
  // distinto, aquí se detiene en vez de cobrarle al paciente algo que no vio.
  const totalShopify = redondo(draftOrder.totalPriceSet.shopMoney.amount);
  if (Math.abs(totalShopify - Number(monto)) > 0.011) {
    await borrarBorrador(draftOrder.id);
    throw new Error(`El total de Shopify (${totalShopify}) no coincide con el cobro (${Number(monto)}). No se creó el pago.`);
  }

  return {
    id: draftOrder.id,
    invoiceUrl: draftOrder.invoiceUrl,
    resumen: { subtotal: redondo(subtotal), descuento: redondo(descProductos), envio: redondo(envioNeto), total: totalShopify, tipoEntrega, enviar: envio, mano },
  };
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

  const esCobro = tags.some(esNombreNuestro) || esNombreNuestro(attr('origen'));

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
