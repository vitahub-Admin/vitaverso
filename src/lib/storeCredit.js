/**
 * Crédito de tienda: cupón de monto fijo en Shopify.
 *
 * Lo usan dos caminos distintos:
 *   · el afiliado canjea su saldo (api/affiliate-app/store-credit)
 *   · un admin le regala crédito (api/admin/store-credit)
 * El cupón es el mismo en los dos casos; lo que cambia es de dónde sale el dinero.
 */

// Sin I, O, 0 ni 1: se dictan por teléfono y se confunden.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function codigoAleatorio(largo = 8) {
  let code = '';
  for (let i = 0; i < largo; i++) code += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return `VH-${code}`;
}

/**
 * Crea el cupón de crédito en Shopify.
 *
 * Es transferible a propósito: no se ata al cliente. El afiliado decide si lo
 * usa él o se lo pasa a un paciente.
 *
 * Es combinable con otros descuentos (volumen, envío gratis, de producto): si
 * alguien tiene crédito y además un descuento, que pague menos.
 *
 * Se crea por GraphQL y no por la REST de price_rules porque esa ignoraba
 * `combines_with`: los cupones salían siempre con las tres combinaciones en
 * false, y Shopify dejaba aplicar solo uno por pedido sin avisar.
 *
 * @param {number} monto   valor del cupón en MXN
 * @param {string} titulo  cómo se ve en el admin de Shopify
 * @param {string} [code]  código a usar; si no se manda, se genera uno
 * @returns {{ code: string, priceRuleId: number }}
 */
export async function crearCuponDeCredito({ monto, titulo, code = codigoAleatorio() }) {
  const res = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query: `mutation crearCredito($d: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $d) {
          codeDiscountNode { id }
          userErrors { field message code }
        }
      }`,
      variables: {
        d: {
          title:               titulo,
          code,
          startsAt:            new Date().toISOString(),
          usageLimit:          1,
          appliesOncePerCustomer: true,
          customerSelection:   { all: true },
          customerGets: {
            value: { discountAmount: { amount: Number(monto).toFixed(2), appliesOnEachItem: false } },
            items: { all: true },
          },
          combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
        },
      },
    }),
  });

  const json = await res.json();
  const errores = json.errors || json.data?.discountCodeBasicCreate?.userErrors;
  if (!res.ok || (errores && errores.length)) throw new Error(JSON.stringify(errores ?? json));

  // El id del nodo de descuento es el mismo número que el price rule de la REST
  const gid = json.data.discountCodeBasicCreate.codeDiscountNode.id;
  return { code, priceRuleId: Number(gid.split('/').pop()) };
}

/**
 * Marca un cupón como usado. Lo llama el webhook de órdenes en cuanto entra
 * una compra con el código, así el afiliado deja de verlo en su lista sin que
 * haya que preguntarle a Shopify por cada cupón cada vez que abre la app.
 *
 * Es idempotente: si ya estaba marcado, no lo pisa (nos quedamos con la
 * primera orden que lo gastó).
 *
 * @returns {boolean} true si lo marcó ahora
 */
export async function marcarCuponUsado(supabase, code, datos = {}) {
  if (!code) return false;

  const { data: fila } = await supabase
    .from('point_exchanges')
    .select('id, metadata')
    .eq('exchange_type', 'store_credit')
    .filter('metadata->>discount_code', 'eq', code)
    .maybeSingle();

  if (!fila || fila.metadata?.used_at) return false;

  const { error } = await supabase
    .from('point_exchanges')
    .update({
      metadata: {
        ...(fila.metadata || {}),
        used_at:    datos.usedAt   || new Date().toISOString(),
        used_order: datos.orderName || null,
      },
    })
    .eq('id', fila.id);

  return !error;
}

/**
 * Deshace `marcarCuponUsado`: si la venta que gastó el cupón se canceló, vuelve a
 * aparecerle al afiliado en su lista de créditos disponibles.
 *
 * @returns {boolean} true si lo desmarcó ahora
 */
export async function desmarcarCuponUsado(supabase, code) {
  if (!code) return false;

  const { data: fila } = await supabase
    .from('point_exchanges')
    .select('id, metadata')
    .eq('exchange_type', 'store_credit')
    .filter('metadata->>discount_code', 'eq', code)
    .maybeSingle();

  if (!fila || !fila.metadata?.used_at) return false;

  const { used_at, used_order, ...resto } = fila.metadata;
  const { error } = await supabase
    .from('point_exchanges')
    .update({ metadata: resto })
    .eq('id', fila.id);

  return !error;
}
