// Descuentos de recompra de los clientes de Mi Vitahub (tabla customer_discounts).
//
// Es el mismo cupón que el crédito de los profesionales (crearCuponDeCredito: un uso,
// para cualquier cliente y combinable), con prefijo VR- para no mezclarlos. Está libre
// para usarse en vitahub.mx; la app solo lo muestra y lo pega en el carrito.
//
// Las reglas de cuándo y cuánto se otorga se resuelven aquí, en el backend, y se llaman
// desde las compras (webhook de órdenes y ventas en efectivo). Usar el cupón no le quita
// comisión al profesional.
import { supabase, shopifyAdmin } from "@/lib/customerSupplements";
import { crearCuponDeCredito, codigoAleatorio } from "@/lib/storeCredit";

const CAMPOS = "id, code, tipo, valor, minimo, titulo, starts_at, ends_at, used_at, used_order, created_at";

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
 * @param origen       orden | efectivo | manual
 * @param origenRef    id de la compra que lo generó
 */
export async function otorgarDescuento({ email, monto, porcentaje, minimo, venceEnDias, titulo, origen = "manual", origenRef = null }) {
  if (!email) throw new Error("Falta el correo del cliente");
  if (origenRef) {
    const { data: ya } = await supabase
      .from("customer_discounts")
      .select(CAMPOS)
      .eq("origen", origen)
      .eq("origen_ref", String(origenRef))
      .maybeSingle();
    if (ya) return aCliente(ya);
  }

  const code = `VR-${codigoAleatorio().slice(3)}`;
  const { priceRuleId } = await crearCuponDeCredito({
    monto,
    porcentaje,
    minimo,
    venceEnDias,
    titulo: `Recompra ${email} (${code})`,
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
      ends_at: venceEnDias ? new Date(Date.now() + Number(venceEnDias) * 86400000).toISOString() : null,
    })
    .select(CAMPOS)
    .single();
  if (error) throw new Error(error.message);
  return aCliente(data);
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
