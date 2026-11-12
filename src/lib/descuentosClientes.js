// Descuentos de recompra de los clientes de Mi Vitahub (tabla customer_discounts).
//
// Es el mismo cupón que el crédito de los profesionales (crearCuponDeCredito: un uso,
// para cualquier cliente y combinable), con prefijo VR- (o BF- el cashback del Buen Fin,
// src/lib/cashback.js) para no mezclarlos. Está libre
// para usarse en vitahub.mx; la app solo lo muestra y lo pega en el carrito.
//
// Las reglas de cuándo y cuánto se otorga se resuelven aquí, en el backend, y se llaman
// desde las compras (webhook de órdenes y ventas en efectivo). Usar el cupón no le quita
// comisión al profesional.
import { supabase, shopifyAdmin } from "@/lib/customerSupplements";
import { crearCuponDeCredito, codigoAleatorio } from "@/lib/storeCredit";

const CAMPOS = "id, code, tipo, valor, minimo, titulo, starts_at, ends_at, used_at, used_order, created_at";

/** Prefijos de los cupones de clientes (los marca como usados el webhook de órdenes). */
export const PREFIJOS_CLIENTE = ["VR-", "BF-"];

function aCliente(d) {
  return {
    id: d.id,
    code: d.code,
    tipo: d.tipo,
    valor: Number(d.valor),
    minimo: d.minimo != null ? Number(d.minimo) : null,
    titulo: d.titulo ?? null,
    endsAt: d.ends_at ?? null,
    usedAt: d.used_at ?? null,
    createdAt: d.created_at,
  };
}

/** Descuentos vigentes del cliente (sin usar, ya empezados y sin vencer), el que vence antes primero. */
export async function descuentosDelCliente(email) {
  if (!email) return [];
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from("customer_discounts")
    .select(CAMPOS)
    .ilike("email", email.trim())
    .is("used_at", null)
    .lte("starts_at", ahora)
    .or(`ends_at.is.null,ends_at.gt.${ahora}`)
    .order("ends_at", { ascending: true, nullsFirst: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const vivos = await activosEnShopify((data ?? []).map((d) => d.code));
  return (data ?? []).filter((d) => !vivos || vivos.has(d.code)).map(aCliente);
}

/**
 * Códigos que siguen activos en Shopify (alguien puede desactivar o borrar un cupón desde el
 * admin, y ahí la app no lo debe ofrecer: el checkout lo rechazaría). Si se desactivó, se
 * anota su fecha de fin en la tabla para que no vuelva a consultarse.
 * Devuelve null si Shopify no responde: en ese caso se muestran los de la tabla, como antes.
 */
async function activosEnShopify(codes) {
  if (!codes.length) return new Set();
  try {
    const campos = codes
      .map((c, i) => `c${i}: codeDiscountNodeByCode(code: ${JSON.stringify(c)}) { codeDiscount { ... on DiscountCodeBasic { status endsAt } } }`)
      .join("\n");
    const data = await shopifyAdmin(`{ ${campos} }`);
    const activos = new Set();
    await Promise.all(codes.map(async (code, i) => {
      const d = data?.[`c${i}`]?.codeDiscount;
      if (d?.status === "ACTIVE") return activos.add(code);
      // Desactivado, vencido o borrado en Shopify: se cierra también en la tabla
      await supabase
        .from("customer_discounts")
        .update({ ends_at: d?.endsAt ?? new Date().toISOString() })
        .eq("code", code)
        .is("used_at", null);
    }));
    return activos;
  } catch (err) {
    console.error("[descuentosClientes] estado en Shopify:", err.message);
    return null;
  }
}

/**
 * Otorga un descuento al cliente: crea el cupón en Shopify y lo guarda. Si esa compra
 * ya generó uno (mismo origen y origenRef), devuelve el existente sin crear otro.
 *
 * @param email        correo del cliente (con el que entra a la app)
 * @param monto | porcentaje  valor del cupón
 * @param minimo       compra mínima para usarlo (opcional)
 * @param venceEnDias  vigencia (opcional; sin esto no vence)
 * @param venceEl      fecha de fin fija (ISO); gana sobre venceEnDias
 * @param origen       orden | efectivo | manual | cashback:<promo>
 * @param origenRef    id de la compra que lo generó
 * @param prefijo      inicio del código, para rastrearlo (VR = recompra, BF = cashback Buen Fin)
 * @returns el descuento, con `nuevo: false` si esa compra ya lo había generado
 */
export async function otorgarDescuento({ email, monto, porcentaje, minimo, venceEnDias, venceEl, titulo, origen = "manual", origenRef = null, prefijo = "VR" }) {
  if (!email) throw new Error("Falta el correo del cliente");
  const yaExistente = async () => {
    const { data } = await supabase
      .from("customer_discounts")
      .select(CAMPOS)
      .eq("origen", origen)
      .eq("origen_ref", String(origenRef))
      .maybeSingle();
    return data ? { ...aCliente(data), nuevo: false } : null;
  };
  if (origenRef) {
    const ya = await yaExistente();
    if (ya) return ya;
  }

  const code = `${prefijo}-${codigoAleatorio().slice(3)}`;
  const fin = venceEl
    ? new Date(venceEl).toISOString()
    : venceEnDias ? new Date(Date.now() + Number(venceEnDias) * 86400000).toISOString() : null;
  const { priceRuleId } = await crearCuponDeCredito({
    monto,
    porcentaje,
    minimo,
    venceEl: fin,
    titulo: `${prefijo === "VR" ? "Recompra" : titulo || "Cupón"} · ${email} (${code})`,
    code,
  });

  const { data, error } = await supabase
    .from("customer_discounts")
    .insert({
      email: email.trim().toLowerCase(),
      code,
      price_rule_id: priceRuleId,
      tipo: porcentaje ? "porcentaje" : "monto",
      valor: porcentaje ? Number(porcentaje) : Number(monto),
      minimo: minimo ? Number(minimo) : null,
      titulo: titulo ?? null,
      origen,
      origen_ref: origenRef != null ? String(origenRef) : null,
      ends_at: fin,
    })
    .select(CAMPOS)
    .single();
  if (error) {
    // Dos avisos de Shopify de la misma compra al mismo tiempo (orders/create y orders/paid):
    // el otro ya lo guardó. El cupón que se acaba de crear sobra: se apaga en Shopify.
    if (error.code === "23505" && origenRef) {
      await desactivarEnShopify(priceRuleId).catch((e) => console.error("[descuentosClientes] cupón sobrante", code, e.message));
      const ya = await yaExistente();
      if (ya) return ya;
    }
    throw new Error(error.message);
  }
  return { ...aCliente(data), nuevo: true };
}

async function desactivarEnShopify(priceRuleId) {
  const data = await shopifyAdmin(
    `mutation apagar($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { message } } }`,
    { id: `gid://shopify/DiscountCodeNode/${priceRuleId}` }
  );
  const errores = data?.discountCodeDeactivate?.userErrors;
  if (errores?.length) throw new Error(errores.map((e) => e.message).join("; "));
}

/**
 * Anula los descuentos que generó una compra y que todavía no se usaron (la compra se canceló
 * o se reembolsó): se apagan en Shopify y dejan de verse en la app. Los ya usados no se tocan.
 * @returns cuántos anuló
 */
export async function anularDescuentosDeCompra(origenRef, { origenEmpiezaCon = "cashback:" } = {}) {
  const { data, error } = await supabase
    .from("customer_discounts")
    .select("id, code, price_rule_id, ends_at")
    .like("origen", `${origenEmpiezaCon}%`)
    .eq("origen_ref", String(origenRef))
    .is("used_at", null);
  if (error) throw new Error(error.message);
  const ahora = new Date().toISOString();
  let n = 0;
  for (const d of data ?? []) {
    if (d.ends_at && d.ends_at <= ahora) continue; // ya estaba cerrado
    if (d.price_rule_id) await desactivarEnShopify(d.price_rule_id);
    await supabase.from("customer_discounts").update({ ends_at: ahora }).eq("id", d.id);
    n++;
  }
  return n;
}

/** Lo llama el webhook de órdenes cuando entra una compra con el código. Idempotente. */
export async function marcarDescuentoUsado(code, { orderName = null, usedAt = null } = {}) {
  if (!code) return false;
  const { data, error } = await supabase
    .from("customer_discounts")
    .update({ used_at: usedAt || new Date().toISOString(), used_order: orderName })
    .eq("code", code.toUpperCase())
    .is("used_at", null)
    .select("id");
  return !error && !!data?.length;
}
