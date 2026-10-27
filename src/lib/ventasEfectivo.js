// Ventas locales en efectivo (consignación).
//
// El profesional entrega producto de su consultorio y cobra en mano; cada cobro es una fila de
// `ventas_efectivo` "por_pagar" y sus unidades quedan reservadas (vista `consignment_reservado`).
// Al cerrar el día paga todo junto: `iniciarLiquidacion` arma una venta de consultorio (`local_orders`)
// con todo entregado en mano, que se paga por el checkout de Shopify como cualquier otra. Cuando ese pago
// se confirma, `confirmarVenta` descuenta el libro, mueve BaseLinker y acredita la comisión, y
// `cerrarLiquidacionEfectivo` marca las ventas como pagadas. (El protocolo del paciente sale al cobrar, no al
// pagar el carrito; al cerrar solo se reintentan los que no pudieron enviarse.)
//
// Hay dos listas de profesionales, en variables de entorno (sin tocar la base):
//   COBRO_EFECTIVO_REAL      el cobro en efectivo con su stock real de consignación
//   COBRO_EFECTIVO_FANTASMA  pruebas: como si tuvieran todo el catálogo en su consultorio, sin límite.
//                            Todo corre de verdad (cobro, reserva, panel, correo, borrador de Shopify)
//                            EXCEPTO lo físico: nunca se descuenta el libro ni se mueve BaseLinker.

import { nanoid } from "nanoid";
import { fetchVariantInfo } from "@/lib/shopifyPrices";
import { totalesDe } from "@/lib/totalesVenta";
import { pasarelaActiva } from "@/lib/pasarelaPago";
import { enviarProtocoloDeVentaEfectivo } from "@/lib/protocoloCorreo";

const lista = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

export const esFantasma = (ownerId) => lista(process.env.COBRO_EFECTIVO_FANTASMA).includes(String(ownerId));
export const efectivoHabilitado = (ownerId) =>
  esFantasma(ownerId) || lista(process.env.COBRO_EFECTIVO_REAL).includes(String(ownerId));

/** Lo que se muestra como disponible a un profesional "fantasma": no se acaba. */
export const INFINITO = 9999;

const redondear = (n) => Math.round(Number(n) * 100) / 100;

// ── Registrar un cobro en efectivo ────────────────────────────────────────────

/**
 * @param items  [{ variant_id, quantity }]  lo que se entrega hoy en mano
 * @param dosis_map  indicación de toma por variante (la misma que se guarda al enviar un protocolo)
 */
export async function registrarVentaEfectivo(supabase, {
  ownerId, items, patient_name, patient_phone, patient_email, dosis_map, protocolo,
}) {
  // Las líneas repetidas de un mismo producto se suman
  const porVariante = new Map();
  for (const it of items || []) {
    const v = Number(it.variant_id);
    const q = Number(it.quantity) || 0;
    if (!v || q <= 0) return { ok: false, error: "Hay un producto sin cantidad válida" };
    porVariante.set(v, (porVariante.get(v) || 0) + q);
  }
  if (!porVariante.size) return { ok: false, error: "Sin productos" };
  const variantIds = [...porVariante.keys()];

  // Precio y comisión se piden de nuevo: no se aceptan montos del navegador
  const [info, { data: comisiones }, { data: catalogo }] = await Promise.all([
    fetchVariantInfo(variantIds),
    supabase.from("product_variant_commissions")
      .select("variant_id, commission_percent").in("variant_id", variantIds).eq("active", true),
    supabase.from("product_catalog")
      .select("variant_id, product_id, title, variant_title, sku").in("variant_id", variantIds),
  ]);
  const pct = Object.fromEntries((comisiones || []).map((c) => [String(c.variant_id), Number(c.commission_percent)]));
  const cat = Object.fromEntries((catalogo || []).map((c) => [String(c.variant_id), c]));

  const lineas = variantIds.map((vid) => {
    const shop = info[String(vid)] || {};
    const c = cat[String(vid)] || {};
    return {
      variant_id: vid,
      product_id: c.product_id ?? null,
      title: c.title ?? shop.title ?? null,
      variant_title: c.variant_title ?? shop.variant_title ?? null,
      sku: c.sku ?? null,
      image: shop.image ?? null,
      quantity: porVariante.get(vid),
      price: Number(shop.price ?? 0),
      commission_percent: pct[String(vid)] ?? 0,
    };
  });
  const sinPrecio = lineas.find((l) => l.price <= 0);
  if (sinPrecio) return { ok: false, error: `No se pudo obtener el precio de "${sinPrecio.title || sinPrecio.variant_id}"` };

  const totales = totalesDe(lineas);
  const token = nanoid(10);   // el protocolo que se le enviará al paciente al pagarse

  let venta;
  if (esFantasma(ownerId)) {
    const { data, error } = await supabase.from("ventas_efectivo").insert([{
      owner_id: Number(ownerId), sharecart_token: token,
      patient_name: patient_name || null, patient_phone: patient_phone || null, patient_email: patient_email || null,
      items: lineas, total: totales.total, comision: totales.comision,
    }]).select().single();
    if (error) return { ok: false, error: error.message };
    venta = data;
  } else {
    const { data, error } = await supabase.rpc("crear_venta_efectivo", {
      p_owner: Number(ownerId),
      p_patient_name: patient_name || null, p_patient_phone: patient_phone || null, p_patient_email: patient_email || null,
      p_sharecart_token: token, p_items: lineas, p_total: totales.total, p_comision: totales.comision,
    });
    if (error) {
      const m = /SIN_STOCK:(\d+):(-?\d+):(\d+)/.exec(error.message || "");
      if (m) {
        const l = lineas.find((x) => String(x.variant_id) === m[1]);
        return { ok: false, error: `No tienes ${m[3]} de "${l?.title || m[1]}" disponibles en tu consultorio (hay ${Math.max(0, Number(m[2]))})` };
      }
      return { ok: false, error: error.message };
    }
    venta = data;
  }

  // El protocolo (productos + indicaciones de toma): de ahí sale el correo y el PDF del paciente
  const { error: errCart } = await supabase.from("sharecarts").insert({
    token,
    owner_id: String(ownerId),
    name: patient_name || null,
    phone: patient_phone || null,
    items: lineas.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
    extra: {
      origen: "protocolo",
      efectivo: true,
      ...(esFantasma(ownerId) ? { fantasma: true } : {}),
      patient_info: { name: patient_name || "", phone: patient_phone || "" },
      dosis_map: dosis_map || {},
      ...(protocolo || {}),
    },
    location: {},
  });
  if (errCart) console.error("[ventas efectivo] no se pudo guardar el protocolo:", errCart.message);

  // El paciente ya pagó en mano: su protocolo le llega ahora, sin esperar a que el profesional pague su
  // carrito (eso solo mueve inventario, BaseLinker y comisión). Si el correo falla, la venta queda igual y
  // se reintenta al cerrar la liquidación.
  if (venta.patient_email && !errCart) {
    try {
      const r = await enviarProtocoloDeVentaEfectivo(venta);
      if (r.ok) {
        const ahora = new Date().toISOString();
        await supabase.from("ventas_efectivo").update({ protocolo_enviado_at: ahora }).eq("id", venta.id);
        venta = { ...venta, protocolo_enviado_at: ahora };
      } else {
        console.error(`[ventas efectivo] no se envió el protocolo de ${venta.id}: ${r.motivo}`);
      }
    } catch (e) {
      console.error(`[ventas efectivo] error enviando el protocolo de ${venta.id}:`, e.message);
    }
  }

  return { ok: true, venta };
}

// ── Lo que el profesional tiene por pagar ─────────────────────────────────────

const totalesDe_ = (pendientes) => ({
  ventas: pendientes.length,
  a_pagar: redondear(pendientes.reduce((a, v) => a + Number(v.total), 0)),
  comision: redondear(pendientes.reduce((a, v) => a + Number(v.comision), 0)),
});

/** Solo los números (punto rojo del menú): una consulta liviana, sin traer las ventas completas */
export async function resumenEfectivo(supabase, ownerId) {
  const { data } = await supabase.from("ventas_efectivo")
    .select("total, comision, created_at")
    .eq("owner_id", Number(ownerId)).eq("estado", "por_pagar");
  const pend = data || [];
  const hoy = new Date().toDateString();
  return {
    totales: totalesDe_(pend),
    atrasado: pend.some((v) => new Date(v.created_at).toDateString() !== hoy),
  };
}

export async function efectivoDe(supabase, ownerId) {
  const dueño = Number(ownerId);
  const [{ data: todas }, { data: abierta }] = await Promise.all([
    supabase.from("ventas_efectivo").select("*")
      .eq("owner_id", dueño).in("estado", ["por_pagar", "pagada"])
      .order("created_at", { ascending: false }).limit(60),
    supabase.from("liquidaciones_efectivo").select("id, local_order_id, total")
      .eq("owner_id", dueño).eq("estado", "pendiente")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const lista_ = todas || [];
  const pendientes = lista_.filter((v) => v.estado === "por_pagar");
  const liquidadas = lista_.filter((v) => v.estado === "pagada").slice(0, 30);

  // El pago abierto: solo cuenta si su venta de consultorio sigue pendiente
  let pago = null;
  if (abierta?.local_order_id && pendientes.some((v) => v.liquidacion_id === abierta.id)) {
    const { data: lo } = await supabase.from("local_orders")
      .select("id, estado").eq("id", abierta.local_order_id).maybeSingle();
    if (lo?.estado === "pendiente") pago = { id: lo.id, payment_url: `/cobro/${lo.id}`, total: Number(abierta.total) };
  }

  return { pendientes, liquidadas, totales: totalesDe_(pendientes), pago, fantasma: esFantasma(ownerId) };
}

/** Unidades reservadas por variante (cobradas en efectivo, todavía sin pagar) */
export async function reservadasDe(supabase, ownerId) {
  const { data } = await supabase.from("consignment_reservado")
    .select("variant_id, reservado").eq("owner_id", Number(ownerId));
  return Object.fromEntries((data || []).map((r) => [String(r.variant_id), Number(r.reservado)]));
}

// ── Pagar todo el carrito ─────────────────────────────────────────────────────

/**
 * Arma (o rehace) la venta de consultorio con todo lo que debe el profesional. Con ella se paga por el
 * checkout de Shopify. Si ya había una abierta se actualiza la misma —incluye lo cobrado después—, en
 * vez de dejar una vieja que se pudiera pagar por error.
 */
export async function iniciarLiquidacion(supabase, ownerId) {
  const dueño = Number(ownerId);
  const { data: pend } = await supabase.from("ventas_efectivo").select("*")
    .eq("owner_id", dueño).eq("estado", "por_pagar").order("created_at", { ascending: true });
  if (!pend?.length) return { ok: false, error: "No tienes ventas por pagar" };

  // Todo junto, por producto, y entregado en mano (sin envío)
  const porVariante = new Map();
  for (const v of pend) {
    for (const i of v.items) {
      const ya = porVariante.get(i.variant_id);
      if (ya) ya.quantity += i.quantity;
      else porVariante.set(i.variant_id, { ...i });
    }
  }
  const items = [...porVariante.values()].map((i) => ({ ...i, mano_qty: i.quantity }));
  const totales = totalesDe(items);

  const { data: abierta } = await supabase.from("liquidaciones_efectivo").select("*")
    .eq("owner_id", dueño).eq("estado", "pendiente")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  let ordenId = null;
  if (abierta?.local_order_id) {
    const { data: lo } = await supabase.from("local_orders")
      .select("id, estado").eq("id", abierta.local_order_id).maybeSingle();
    if (lo?.estado === "pendiente") ordenId = lo.id;
  }

  const ahora = new Date().toISOString();
  if (ordenId) {
    const { error } = await supabase.from("local_orders")
      .update({ items, ...totales, updated_at: ahora }).eq("id", ordenId).eq("estado", "pendiente");
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: lo, error } = await supabase.from("local_orders").insert([{
      owner_id: String(ownerId),
      patient_name: "Liquidación de efectivo",
      items, ...totales,
      estado: "pendiente",
      payment_provider: pasarelaActiva(ownerId),
    }]).select().single();
    if (error) return { ok: false, error: error.message };
    ordenId = lo.id;
  }

  let liqId = abierta?.id;
  const datosLiq = { total: totales.total, comision: totales.comision, local_order_id: ordenId, updated_at: ahora };
  if (abierta && abierta.local_order_id === ordenId) {
    await supabase.from("liquidaciones_efectivo").update(datosLiq).eq("id", liqId);
  } else {
    if (abierta) await supabase.from("liquidaciones_efectivo").update({ estado: "cancelada", updated_at: ahora }).eq("id", abierta.id);
    const { data: nueva, error } = await supabase.from("liquidaciones_efectivo")
      .insert([{ owner_id: dueño, estado: "pendiente", ...datosLiq }]).select().single();
    if (error) return { ok: false, error: error.message };
    liqId = nueva.id;
  }

  await supabase.from("ventas_efectivo")
    .update({ liquidacion_id: liqId, updated_at: ahora })
    .in("id", pend.map((v) => v.id));

  return { ok: true, payment_url: `/cobro/${ordenId}`, total: totales.total, comision: totales.comision, ordenId };
}

/**
 * Lo llama confirmarVenta cuando una venta de consultorio recién se cerró. Si esa venta era la
 * liquidación de un profesional: marca las ventas en efectivo como pagadas y reintenta el protocolo de las que
 * no pudieron enviarse al cobrar.
 */
export async function cerrarLiquidacionEfectivo(supabase, orden) {
  const { data: liq } = await supabase.from("liquidaciones_efectivo")
    .select("*").eq("local_order_id", orden.id).maybeSingle();
  if (!liq) return { esLiquidacion: false };

  const ahora = new Date().toISOString();
  await supabase.from("liquidaciones_efectivo")
    .update({ estado: "pagada", paid_at: ahora, updated_at: ahora }).eq("id", liq.id);

  const { data: ventas } = await supabase.from("ventas_efectivo")
    .update({ estado: "pagada", paid_at: ahora, updated_at: ahora })
    .eq("liquidacion_id", liq.id).eq("estado", "por_pagar").select();

  let correos = 0;
  for (const v of ventas || []) {
    if (!v.patient_email || !v.sharecart_token || v.protocolo_enviado_at) continue;
    try {
      const r = await enviarProtocoloDeVentaEfectivo(v);
      if (r.ok) {
        correos++;
        await supabase.from("ventas_efectivo").update({ protocolo_enviado_at: new Date().toISOString() }).eq("id", v.id);
      } else {
        console.error(`[ventas efectivo] no se envió el protocolo de ${v.id}: ${r.motivo}`);
      }
    } catch (e) {
      console.error(`[ventas efectivo] error enviando el protocolo de ${v.id}:`, e.message);
    }
  }
  return { esLiquidacion: true, ventas: (ventas || []).length, correos };
}

// ── Para el admin ─────────────────────────────────────────────────────────────

/** Quién tiene efectivo sin pagar, cuánto y desde cuándo */
export async function deudoresEfectivo(supabase) {
  const { data } = await supabase.from("ventas_efectivo")
    .select("owner_id, total, comision, created_at, liquidacion_id").eq("estado", "por_pagar");
  const por = new Map();
  for (const v of data || []) {
    const g = por.get(String(v.owner_id)) || { owner_id: String(v.owner_id), ventas: 0, a_pagar: 0, comision: 0, desde: v.created_at, en_pago: false };
    g.ventas += 1;
    g.a_pagar = redondear(g.a_pagar + Number(v.total));
    g.comision = redondear(g.comision + Number(v.comision));
    if (new Date(v.created_at) < new Date(g.desde)) g.desde = v.created_at;
    if (v.liquidacion_id) g.en_pago = true;
    por.set(g.owner_id, g);
  }
  return [...por.values()].sort((a, b) => new Date(a.desde) - new Date(b.desde));
}
