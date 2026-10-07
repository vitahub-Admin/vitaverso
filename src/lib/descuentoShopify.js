/**
 * Códigos de descuento de Shopify, aplicados en nuestro checkout.
 *
 * Acá está la parte incómoda: la orden nunca se crea en Shopify, así que Shopify
 * no valida ni consume nada. Todo lo que Shopify haría —ver si el código existe,
 * si venció, si se agotó, si llega al mínimo— hay que hacerlo nosotros, leyendo
 * su price rule y aplicando las mismas reglas a mano.
 *
 * Por eso acá se rechaza todo lo que no se pueda garantizar. Un cupón limitado a
 * ciertos productos o a ciertos clientes se rechaza con un motivo claro en vez
 * de aplicarse "más o menos bien": es preferible que un paciente escriba
 * preguntando por qué no le tomó el código a que se cobre de menos y nadie lo
 * note hasta el cierre del mes.
 */

const SHOPIFY_API_VER = '2024-01';
const SHOPIFY_BASE    = `https://${process.env.SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VER}`;

async function shopifyGet(path) {
  const res = await fetch(`${SHOPIFY_BASE}${path}`, {
    headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
  });
  return { status: res.status, json: res.ok ? await res.json() : null };
}

const rechazo = (motivo) => ({ ok: false, motivo });

/**
 * Valida un código contra Shopify y calcula cuánto descuenta en ESTA venta.
 *
 * @param {string} codigo   lo que escribió el paciente
 * @param {object} ctx      { subtotal, envio } de la venta, ya calculados
 * @returns {{ ok: boolean, motivo?: string, codigo?, priceRuleId?, monto?,
 *             sobreEnvio?: boolean, usoUnico?: boolean }}
 */
export async function validarDescuento(codigo, { subtotal, envio }) {
  const code = String(codigo || '').trim().toUpperCase();
  if (!code) return rechazo('Escribe un código');

  // 1. ¿Existe?
  const lookup = await shopifyGet(`/discount_codes/lookup.json?code=${encodeURIComponent(code)}`);
  if (lookup.status === 404) return rechazo('Ese código no existe');
  if (!lookup.json?.discount_code) {
    // Error de red o de Shopify: no se concluye que el código sea inválido.
    return rechazo('No pudimos validar el código, intenta de nuevo');
  }

  const dc = lookup.json.discount_code;

  // 2. Su price rule: ahí están las condiciones
  const pr = await shopifyGet(`/price_rules/${dc.price_rule_id}.json`);
  const regla = pr.json?.price_rule;
  if (!regla) return rechazo('No pudimos validar el código, intenta de nuevo');

  const ahora = Date.now();

  if (regla.starts_at && new Date(regla.starts_at).getTime() > ahora) {
    return rechazo('Ese código todavía no está vigente');
  }
  if (regla.ends_at && new Date(regla.ends_at).getTime() < ahora) {
    return rechazo('Ese código ya venció');
  }
  if (regla.usage_limit != null && Number(dc.usage_count || 0) >= Number(regla.usage_limit)) {
    return rechazo('Ese código ya fue utilizado');
  }

  // 3. Lo que no podemos garantizar sin crear la orden en Shopify.
  //    El paciente no tiene cuenta, así que un cupón atado a clientes concretos
  //    no se puede verificar contra nadie.
  if (regla.customer_selection && regla.customer_selection !== 'all') {
    return rechazo('Ese código está reservado para ciertos clientes');
  }
  // Un cupón que solo aplica a algunos productos exige repartir el descuento
  // línea por línea igual que Shopify. Mientras no lo hagamos, no se acepta.
  if (regla.target_selection && regla.target_selection !== 'all') {
    return rechazo('Ese código aplica solo a ciertos productos y no se puede usar acá');
  }

  // 4. Mínimos de compra
  const minMonto = Number(regla.prerequisite_subtotal_range?.greater_than_or_equal_to ?? 0);
  if (minMonto > 0 && subtotal < minMonto) {
    return rechazo(`Ese código requiere una compra mínima de $${minMonto.toFixed(2)}`);
  }
  const minCantidad = Number(regla.prerequisite_quantity_range?.greater_than_or_equal_to ?? 0);
  if (minCantidad > 0) {
    return rechazo('Ese código pide una cantidad mínima de productos y no se puede usar acá');
  }

  // 5. Cuánto descuenta
  const valor    = Math.abs(parseFloat(regla.value) || 0);
  const usoUnico = Number(regla.usage_limit) === 1;
  const base     = { ok: true, codigo: code, priceRuleId: dc.price_rule_id, usoUnico };

  // Envío gratis: descuenta el envío, no los productos. Si el envío ya era
  // gratis por monto, el cupón no suma nada y conviene decirlo.
  if (regla.target_type === 'shipping_line') {
    if (!envio) return rechazo('Tu envío ya es gratis, no hace falta el código');
    return { ...base, monto: Number(envio.toFixed(2)), sobreEnvio: true };
  }

  let monto;
  if (regla.value_type === 'percentage') {
    monto = subtotal * (valor / 100);
  } else if (regla.value_type === 'fixed_amount') {
    monto = valor;
  } else {
    return rechazo('Ese tipo de descuento no se puede usar acá');
  }

  // Un cupón de monto fijo mayor al pedido no devuelve dinero: descuenta hasta
  // dejar el subtotal en cero y el resto se pierde, igual que en la tienda.
  monto = Math.min(monto, subtotal);
  if (monto <= 0) return rechazo('Ese código no aplica a tu pedido');

  return { ...base, monto: Number(monto.toFixed(2)), sobreEnvio: false };
}

/**
 * Vence un cupón de un solo uso después de cobrarlo.
 *
 * Como la orden no pasa por Shopify, su `usage_count` nunca sube: sin esto, un
 * cupón de un solo uso se podría volver a gastar en la tienda. Se le pone fecha
 * de fin en vez de borrarlo — borrarlo haría desaparecer el rastro de que
 * existió, y acá hace falta poder explicar después qué pasó con cada cupón.
 *
 * Decide sola si corresponde: un cupón de campaña abierta se deja intacto, que
 * para eso es de usos múltiples. Vencerlo dejaría sin descuento a todos los
 * demás por culpa de una sola venta de consultorio.
 */
export async function vencerCupon(priceRuleId) {
  if (!priceRuleId) return false;
  try {
    const { json } = await shopifyGet(`/price_rules/${priceRuleId}.json`);
    if (Number(json?.price_rule?.usage_limit) !== 1) return false;

    const res = await fetch(`${SHOPIFY_BASE}/price_rules/${priceRuleId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        price_rule: { id: priceRuleId, ends_at: new Date().toISOString() },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Deshace `vencerCupon`: la venta que gastó el cupón se canceló, y el paciente
 * (o el profesional que lo canjeó) no debe perder su crédito por eso.
 *
 * Solo toca los de un uso, igual que al vencerlos. Un cupón de campaña abierta
 * nunca se venció, así que no hay nada que reactivar.
 */
export async function reactivarCupon(priceRuleId) {
  if (!priceRuleId) return false;
  try {
    const { json } = await shopifyGet(`/price_rules/${priceRuleId}.json`);
    if (Number(json?.price_rule?.usage_limit) !== 1) return false;
    if (!json.price_rule.ends_at) return true;   // ya estaba vigente

    const res = await fetch(`${SHOPIFY_BASE}/price_rules/${priceRuleId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ price_rule: { id: priceRuleId, ends_at: null } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
