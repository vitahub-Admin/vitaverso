/**
 * Crédito de tienda: cupón de monto fijo en Shopify.
 *
 * Lo usan dos caminos distintos:
 *   · el afiliado canjea su saldo (api/affiliate-app/store-credit)
 *   · un admin le regala crédito (api/admin/store-credit)
 * El cupón es el mismo en los dos casos; lo que cambia es de dónde sale el dinero.
 */

const SHOPIFY_API_VER = '2024-01';
const SHOPIFY_BASE    = `https://${process.env.SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VER}`;

// Sin I, O, 0 ni 1: se dictan por teléfono y se confunden.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function codigoAleatorio(largo = 8) {
  let code = '';
  for (let i = 0; i < largo; i++) code += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return `VH-${code}`;
}

async function shopifyPost(path, body) {
  const res = await fetch(`${SHOPIFY_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.errors ?? json));
  return json;
}

/**
 * Crea el price rule y su código de descuento.
 *
 * El cupón es transferible a propósito: no se ata al cliente. El afiliado
 * decide si lo usa él o se lo pasa a un paciente, igual que los que canjea
 * por su cuenta.
 *
 * @param {number} monto   valor del cupón en MXN
 * @param {string} titulo  cómo se ve en el admin de Shopify
 * @returns {{ code: string, priceRuleId: number }}
 */
export async function crearCuponDeCredito({ monto, titulo }) {
  const code = codigoAleatorio();

  const { price_rule } = await shopifyPost('/price_rules.json', {
    price_rule: {
      title:             titulo,
      target_type:       'line_item',
      target_selection:  'all',
      allocation_method: 'across',
      value_type:        'fixed_amount',
      value:             `-${Number(monto).toFixed(2)}`,
      customer_selection: 'all',
      once_per_customer: true,
      usage_limit:       1,
      starts_at:         new Date().toISOString(),
      combines_with: {
        order_discounts:   true,
        product_discounts: true,
        shipping_discounts: true,
      },
    },
  });

  await shopifyPost(`/price_rules/${price_rule.id}/discount_codes.json`, {
    discount_code: { code },
  });

  return { code, priceRuleId: price_rule.id };
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
