import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { armarProtocolo } from "@/lib/protocoloDatos";
import { buildPrescriptionEmail } from "@/lib/protocoloCorreo";
import { viaVitaPulse, armarEvento, enviarEvento } from "@/lib/correosVitaPulse";

// Guía de uso para compras normales de la tienda: pedidos pagados que no vienen de un protocolo
// de un profesional (esos ya reciben su protocolo con la indicación que armó el profesional).
//
// Qué lleva: por cada suplemento, la porción del fabricante (metafields de la variante
// custom.tipo_dosis y custom.dosis) y el "Modo de uso" del catálogo. Si la compra tiene un
// referido, se nombra a esa persona solo como contacto para dudas; el correo no dice que ella
// haya armado ni recetado el pedido, y no escribe nada en la orden ni en la atribución.
//
// Está apagado por defecto: solo se envía con PROTOCOLO_A_TODOS=1 en las variables de entorno.

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const INVARIABLES = new Set(["ml", "mg", "g"]);

function singular(p) {
  if (/(les|des)$/.test(p)) return p.slice(0, -2); // vegetales → vegetal, unidades → unidad
  if (p.endsWith("s")) return p.slice(0, -1);
  return p;
}

function plural(p) {
  if (p.endsWith("s")) return p;
  return /[dlrz]$/.test(p) ? `${p}es` : `${p}s`;
}

/** "Cápsulas vegetales", 1 → "cápsula vegetal"; "Unidades", 2 → "unidades". N/A o vacío → null. */
export function textoUnidad(tipo, n) {
  const t = String(tipo || "").trim().toLowerCase();
  if (!t || t === "n/a") return null;
  if (INVARIABLES.has(t)) return t;
  const palabras = t.split(/\s+/);
  // tipo_dosis ya viene en plural ("Softgels", "Cápsulas vegetales"): con más de una se deja tal cual
  return palabras.map((p) => (n === 1 ? singular(p) : plural(p))).join(" ");
}

async function porcionesDeVariantes(variantIds) {
  if (!variantIds.length || !process.env.SHOPIFY_STORE || !process.env.SHOPIFY_ACCESS_TOKEN) return {};
  try {
    const res = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
      body: JSON.stringify({
        query: `query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id
          tipo: metafield(namespace: "custom", key: "tipo_dosis") { value }
          dosis: metafield(namespace: "custom", key: "dosis") { value } } } }`,
        variables: { ids: variantIds.map((id) => `gid://shopify/ProductVariant/${id}`) },
      }),
    });
    const json = await res.json();
    const out = {};
    for (const n of json?.data?.nodes || []) {
      if (!n?.id) continue;
      out[Number(n.id.split("/").pop())] = { tipo: n.tipo?.value || "", dosis: Number(n.dosis?.value) || 0 };
    }
    return out;
  } catch (e) {
    console.error("[guia pedido] no se pudieron leer las porciones:", e.message);
    return {};
  }
}

// Respaldo por producto: el catálogo de Supabase es por variante y puede no tener la que se
// compró (variante nueva, sincronización pendiente). Sin él el correo salía sin foto ni modo
// de uso. La foto se toma directo de Shopify y el modo de uso de cualquier variante del mismo
// producto, porque es del producto y no cambia entre variantes.
async function extrasDeProductos(productIds) {
  const ids = [...new Set(productIds.filter(Boolean).map(Number))];
  const out = { fotos: {}, usos: {} };
  if (!ids.length) return out;

  try {
    const { data } = await supabase
      .from("product_catalog")
      .select("product_id, modo_de_uso")
      .in("product_id", ids)
      .not("modo_de_uso", "is", null);
    for (const r of data || []) if (r.modo_de_uso && !out.usos[r.product_id]) out.usos[r.product_id] = r.modo_de_uso;
  } catch (e) {
    console.error("[guia pedido] no se pudo leer el modo de uso:", e.message);
  }

  if (process.env.SHOPIFY_STORE && process.env.SHOPIFY_ACCESS_TOKEN) {
    try {
      const res = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
        body: JSON.stringify({
          query: `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id featuredImage { url } } } }`,
          variables: { ids: ids.map((id) => `gid://shopify/Product/${id}`) },
        }),
      });
      const json = await res.json();
      for (const n of json?.data?.nodes || []) {
        const url = n?.featuredImage?.url;
        if (n?.id && url) out.fotos[Number(n.id.split("/").pop())] = `${url}${url.includes("?") ? "&" : "?"}width=240&height=240&crop=center&format=jpg`;
      }
    } catch (e) {
      console.error("[guia pedido] no se pudieron leer las fotos:", e.message);
    }
  }
  return out;
}

/**
 * @param payload        orden de Shopify (webhook)
 * @param especialistaId shopify_customer_id del referido de la compra, o null
 */
export async function enviarGuiaDePedido({ payload, especialistaId = null }) {
  const correo = payload.customer?.email || payload.email;
  if (!correo) return { ok: false, motivo: "sin correo" };

  const lineas = (payload.line_items || []).filter((i) => i.variant_id && Number(i.quantity) > 0);
  if (!lineas.length) return { ok: false, motivo: "sin productos" };

  const items = lineas.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity }));
  const titulos = Object.fromEntries(lineas.map((i) => [i.variant_id, i.title || ""]));

  const [protocolo, porciones, extras] = await Promise.all([
    armarProtocolo({ items, dosisMap: {}, titulos }),
    porcionesDeVariantes(lineas.map((i) => i.variant_id)),
    extrasDeProductos(lineas.map((i) => i.product_id)),
  ]);

  // Solo suplementos con algo útil que decir: una porción o un modo de uso. Tests, kits y
  // servicios no traen ninguno de los dos y se quedan fuera.
  const lineItems = [];
  items.forEach((it, i) => {
    const p = protocolo[i];
    if (!p) return;
    const pid = Number(lineas[i].product_id);
    const modoDeUso = p.modo_de_uso || extras.usos[pid] || null;
    const por = porciones[Number(it.variant_id)];
    const unidad = por?.dosis ? textoUnidad(por.tipo, por.dosis) : null;
    if (!unidad && !modoDeUso) return;
    lineItems.push({
      ...p,
      foto: p.foto || extras.fotos[pid] || null,
      modo_de_uso: modoDeUso,
      desc: "", // la descripción por defecto habla de "tu protocolo", que aquí no existe
      instruccion: unidad ? `Porción: ${por.dosis} ${unidad}` : null,
    });
  });
  if (!lineItems.length) return { ok: false, motivo: "ningún suplemento con porción o modo de uso" };

  let contacto = null;
  if (especialistaId) {
    const { data: a } = await supabase
      .from("affiliates")
      .select("first_name, last_name")
      .eq("shopify_customer_id", Number(especialistaId))
      .maybeSingle();
    contacto = [a?.first_name, a?.last_name].filter(Boolean).join(" ") || null;
  }

  const nombre = payload.customer?.first_name || "";

  // Salida por VitaPulse (CORREOS_VIA_VITAPULSE): sin respaldo por Resend. reintentar le dice al webhook
  // que libere la orden para que un reenvío de Shopify lo vuelva a intentar.
  if (viaVitaPulse("guia_pedido")) {
    const r = await enviarEvento(armarEvento({
      tipo: "guia_pedido",
      ref: payload.id,
      asunto: "Cómo tomar tu pedido — Vitahub",
      nombre: nombre || null,
      email: correo,
      emailApp: correo,
      especialista: contacto,
      especialistaRol: contacto ? "contacto" : null,
      ordenNumero: payload.order_number,
      fechaIso: payload.created_at,
      pdfUrl: null,
      lineItems,
    }));
    return r.ok ? { ok: true } : { ok: false, reintentar: r.reintentar, motivo: r.motivo };
  }

  const html = buildPrescriptionEmail({
    generico: true,
    especialistaContacto: contacto,
    affiliateName: "",
    patientName: nombre || "Hola",
    orderNumber: payload.order_number,
    date: new Date(payload.created_at).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" }),
    lineItems,
    shareCartToken: null,
    appEmail: correo,
  });

  const { error } = await resend.emails.send({
    from: "Vitahub <noreply@pro.vitahub.mx>",
    to: correo,
    subject: "Cómo tomar tu pedido — Vitahub",
    html,
    tags: [{ name: "flujo", value: "guia_pedido" }],
  });
  if (error) return { ok: false, motivo: error.message || JSON.stringify(error) };
  return { ok: true };
}
