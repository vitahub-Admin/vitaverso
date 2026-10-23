// Datos del protocolo que se le entrega al paciente. Lo usan el correo y el PDF, para que
// los dos digan exactamente lo mismo: mismos productos, misma indicación de toma, misma foto.
//
// La fuente es el protocolo que armó el profesional (el carrito compartido), no lo que el
// paciente haya comprado: así el PDF que se descarga después coincide con el correo.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export const DESCRIPCION_POR_DEFECTO =
  "Suplemento de alta calidad seleccionado especialmente para tu protocolo de salud.";

/** Cómo se toma, tal como lo escribió el profesional; si no hay indicación, cantidad y unidad. */
export const textoDosis = (item) =>
  item.instruccion || (item.dosis_amount ? `${item.dosis_amount} ${item.dosis_unit || "dosis"}` : null);

/** Lo que va dentro de la etiqueta de cada producto, igual en correo y PDF. */
export const etiquetaDeProducto = (item) => {
  const dosis = textoDosis(item);
  if (!dosis) return { tipo: "cantidad", texto: `×${item.quantity}` };
  return { tipo: "dosis", texto: `${dosis}${item.quantity > 1 ? ` · ${item.quantity} frascos` : ""}` };
};

/** Foto cuadrada en JPG: lo único que leen sin falla todos los correos y el PDF. */
const urlDeFoto = (url, ancho = 240) => {
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}width=${ancho}&height=${ancho}&crop=center&format=jpg`;
};

async function fotosDeProductos(productIds) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length || !process.env.SHOPIFY_STORE || !process.env.SHOPIFY_ACCESS_TOKEN) return {};
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
    const fotos = {};
    for (const n of json?.data?.nodes || []) {
      if (n?.id && n.featuredImage?.url) fotos[Number(n.id.split("/").pop())] = urlDeFoto(n.featuredImage.url);
    }
    return fotos;
  } catch (e) {
    console.error("[protocolo] no se pudieron leer las fotos:", e.message);
    return {};
  }
}

/**
 * @param items     [{ variant_id, quantity }] del protocolo
 * @param dosisMap  extra.dosis_map del carrito compartido (indicación por variante)
 * @param titulos   { [variant_id]: título } por si el catálogo no trae la variante
 * @returns [{ title, quantity, desc, foto, instruccion, dosis_amount, dosis_unit, momentos,
 *             acompanamiento, nota, modo_de_uso }]
 */
export async function armarProtocolo({ items = [], dosisMap = {}, titulos = {} }) {
  const variantIds = items.map((i) => Number(i.variant_id ?? i.id)).filter(Boolean);
  if (!variantIds.length) return [];

  const [{ data: catalogo }, { data: componentes }] = await Promise.all([
    supabase.from("product_catalog")
      .select("variant_id, product_id, title, componente, modo_de_uso")
      .in("variant_id", variantIds),
    supabase.from("componentes").select("slug, descripcion"),
  ]);

  const porVariante = {};
  (catalogo || []).forEach((r) => { porVariante[r.variant_id] = r; });

  const descripciones = {};
  (componentes || []).forEach((r) => {
    if (r.slug) descripciones[r.slug.trim().toLowerCase()] = r.descripcion;
  });

  const fotos = await fotosDeProductos((catalogo || []).map((r) => r.product_id));

  return items.map((item) => {
    const vid = Number(item.variant_id ?? item.id ?? 0);
    const cat = porVariante[vid] || {};
    const slug = (cat.componente || "").trim().toLowerCase();
    const dosis = dosisMap[String(vid)] || {};
    // Sin ninguna indicación del profesional sobre cómo tomarlo, va el modo de uso del producto
    const sinIndicacion = !dosis.instruccion && !dosis.dosis_amount && !(dosis.momentos || []).length && !dosis.acompanamiento;

    return {
      title:          cat.title || titulos[vid] || `Producto ${vid}`,
      quantity:       item.quantity || 1,
      desc:           (slug && descripciones[slug]) || DESCRIPCION_POR_DEFECTO,
      foto:           fotos[cat.product_id] || null,
      modo_de_uso:    sinIndicacion ? (cat.modo_de_uso || null) : null,
      instruccion:    dosis.instruccion || null,
      dosis_amount:   dosis.dosis_amount || null,
      dosis_unit:     dosis.dosis_unit || null,
      momentos:       dosis.momentos || [],
      acompanamiento: dosis.acompanamiento || null,
      nota:           dosis.nota || null,
    };
  });
}

export const escaparHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
