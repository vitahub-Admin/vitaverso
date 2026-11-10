// Tienda de la app de clientes (Mi Vitahub): búsqueda, categorías, recomendados del
// profesional y sugeridos del carrito. El catálogo sale de product_catalog (Supabase);
// precio, foto y disponibilidad se confirman en Shopify, que manda sobre eso.
//
// Toda venta que salga de la app se acredita al profesional del paciente: el carrito
// lleva specialist_ref (ver cartUrl en la app) además del metafield custom.referido.
import { supabase, shopifyAdmin, buyUrl } from "@/lib/customerSupplements";
import { ponerInsignias } from "@/lib/customerBadges";
import { CAMPOS_PRECIO_APP, leerPrecioApp } from "@/lib/customerPrecioApp";

const POR_PAGINA = 24;

// Categorías (level_2 del catálogo: Omegas, Probióticos, Multivitamínicos...) en memoria: cambian poco
let categoriasCache = { at: 0, data: [] };
const CATEGORIAS_TTL_MS = 60 * 60 * 1000;

export async function categorias() {
  if (Date.now() - categoriasCache.at < CATEGORIAS_TTL_MS && categoriasCache.data.length) return categoriasCache.data;
  const conteo = {};
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("product_catalog")
      .select("level_2, product_id")
      .eq("status", "ACTIVE")
      .not("level_2", "is", null)
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) (conteo[r.level_2] ??= new Set()).add(r.product_id);
    if (!data || data.length < 1000) break;
  }
  const lista = Object.entries(conteo)
    .map(([nombre, ids]) => ({ nombre, productos: ids.size }))
    .filter((c) => c.productos >= 3)
    .sort((a, b) => b.productos - a.productos);
  categoriasCache = { at: Date.now(), data: lista };
  return lista;
}

// Precio regular (tachado) solo si es mayor al precio de venta, como en vitahub.mx
function precioRegular(compareAt, price) {
  const regular = Number(compareAt);
  return regular > 0 && regular > Number(price) ? regular : null;
}

// Precio, foto y disponibilidad vivos en Shopify para una lista de variantes.
// Solo productos activos y publicados en la tienda online (lo que se ve en vitahub.mx).
export async function enriquecer(variantIds) {
  const ids = [...new Set(variantIds.map(String))].slice(0, 100);
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const data = await shopifyAdmin(
      `query storeVariants($ids: [ID!]!) {
        nodes(ids: $ids) { ... on ProductVariant {
          id title price compareAtPrice availableForSale
          image { url }
          ${CAMPOS_PRECIO_APP}
          product { id title handle status onlineStoreUrl tags featuredImage { url } }
        } }
      }`,
      { ids: ids.slice(i, i + 50).map((id) => `gid://shopify/ProductVariant/${id}`) }
    );
    for (const n of data?.nodes ?? []) {
      if (!n?.id || n.product?.status !== "ACTIVE" || !n.product.onlineStoreUrl) continue;
      out[n.id.split("/").pop()] = {
        variantId: n.id.split("/").pop(),
        productId: n.product.id.split("/").pop(),
        title: n.product.title,
        variantTitle: n.title === "Default Title" ? "" : n.title,
        price: n.price != null ? Number(n.price) : null,
        compareAtPrice: precioRegular(n.compareAtPrice, n.price),
        available: !!n.availableForSale,
        image: n.image?.url ?? n.product.featuredImage?.url ?? null,
        handle: n.product.handle,
        url: buyUrl(n.product.handle),
        tags: n.product.tags ?? [],
        // Interno: el route decide si se aplica (aplicarPrecioApp) y lo borra antes de responder
        precioAppValor: leerPrecioApp(n, n.price, n.compareAtPrice),
      };
    }
  }
  return conInsignias(Object.values(out)).then(() => out);
}

// Insignias por reglas (customerBadges); los tags solo sirven para las reglas, no se mandan
async function conInsignias(lista) {
  await ponerInsignias(lista).catch((e) => console.error("[customerStore] insignias:", e.message));
  for (const p of lista) delete p.tags;
  return lista;
}

/**
 * Búsqueda en el catálogo: por nombre, marca o ingrediente, o por categoría.
 * Devuelve un producto por fila (su primera variante disponible), incluidos los
 * profesionales, con lo agotado al final. Solo lo publicado en vitahub.mx (enriquecer).
 */
export async function buscar({ q = "", categoria = null, limite = POR_PAGINA } = {}) {
  const texto = String(q).trim().replace(/[,%()*]/g, " ").slice(0, 60);
  if (texto.length < 2 && !categoria) return [];
  return productosDeFilas(await filasCatalogo(texto, categoria), limite);
}

/**
 * Búsqueda con varios términos (los que arma la IA a partir de lo que escribió el cliente):
 * se juntan los resultados en el orden de los términos, sin repetir productos. Los
 * productos de `primero` (ids de producto, p. ej. la colección de su profesional) suben.
 */
export async function buscarPorTerminos({ terminos = [], categoria = null, primero = new Set(), limite = POR_PAGINA } = {}) {
  const limpios = [...new Set(terminos.map((t) => String(t).trim().replace(/[,%()*]/g, " ").slice(0, 60)).filter((t) => t.length >= 2))].slice(0, 8);
  const listas = await Promise.all(limpios.map((t) => filasCatalogo(t, null).catch(() => [])));
  // Con categoría sugerida y sin términos útiles, la categoría completa
  if (!limpios.length && categoria) listas.push(await filasCatalogo("", categoria));
  // Intercalado: el mejor de cada término primero, para que ninguno acapare la lista
  const filas = [];
  for (let i = 0; filas.length < 160 && listas.some((l) => i < l.length); i++) {
    for (const l of listas) if (l[i]) filas.push(l[i]);
  }
  const productos = await productosDeFilas(filas, limite * 2);
  return productos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(primero.has(String(b.p.productId))) - Number(primero.has(String(a.p.productId))) || a.i - b.i)
    .map(({ p }) => p)
    .sort((a, b) => Number(b.available) - Number(a.available))
    .slice(0, limite);
}

// Un producto por fila (su primera variante), con precio, foto y stock vivos; lo agotado al final
async function productosDeFilas(data, limite) {
  const porProducto = new Map();
  for (const r of data ?? []) if (!porProducto.has(r.product_id)) porProducto.set(r.product_id, r);
  const filas = [...porProducto.values()].slice(0, limite * 2);

  const vivos = await enriquecer(filas.map((r) => r.variant_id));
  return filas
    .map((r) => (vivos[String(r.variant_id)] ? { ...vivos[String(r.variant_id)], brand: r.brand ?? null } : null))
    .filter(Boolean)
    .sort((a, b) => Number(b.available) - Number(a.available))
    .slice(0, limite);
}

// Filas del catálogo para un texto y/o categoría
async function filasCatalogo(texto, categoria) {
  // Con texto: búsqueda tolerante a errores de escritura y acentos (función buscar_catalogo,
  // supabase/migrations/customer_app_busqueda_tolerante.sql), ya ordenada por parecido
  let data = null;
  if (texto.length >= 2) {
    const r = await supabase.rpc("buscar_catalogo", { q: texto, cat: categoria, lim: 160 });
    if (r.error) console.error("[customerStore] buscar_catalogo:", r.error.message);
    else data = r.data;
  }

  // Solo categoría, o la función todavía no existe: coincidencia exacta como antes
  if (!data) {
    let query = supabase
      .from("product_catalog")
      .select("product_id, variant_id, title, brand")
      .eq("status", "ACTIVE")
      .limit(160);
    if (texto.length >= 2) {
      const t = `%${texto}%`;
      query = query.or(`title.ilike.${t},brand.ilike.${t},primary_ingredient.ilike.${t},componente.ilike.${t}`);
    }
    if (categoria) query = query.eq("level_2", categoria);
    const r = await query;
    if (r.error) throw new Error(r.error.message);
    data = r.data;
  }
  return data ?? [];
}

// Productos de la tienda del profesional del paciente (su colección de "Mi Tienda")
export async function recomendadosDelProfesional(specialistShopifyId, limite = 12) {
  if (!specialistShopifyId) return [];
  const { data: aff } = await supabase
    .from("affiliates")
    .select("shopify_collection_id")
    .eq("shopify_customer_id", Number(specialistShopifyId))
    .maybeSingle();
  if (!aff?.shopify_collection_id) return [];

  const data = await shopifyAdmin(
    `query recomendados($id: ID!, $n: Int!) {
      collection(id: $id) { products(first: $n) { edges { node {
        status variants(first: 1) { edges { node { id } } }
      } } } }
    }`,
    { id: `gid://shopify/Collection/${aff.shopify_collection_id}`, n: limite }
  );
  const vids = (data?.collection?.products?.edges ?? [])
    .map(({ node }) => (node.status === "ACTIVE" ? node.variants.edges[0]?.node?.id?.split("/").pop() : null))
    .filter(Boolean);
  const vivos = await enriquecer(vids);
  return vids.map((v) => vivos[v]).filter((p) => p?.available);
}

/**
 * Ficha de un producto: fotos, descripción y variantes con precio y stock vivos.
 * Cualquier producto activo y publicado en vitahub.mx: la tienda de la app muestra
 * lo mismo que la web (VitaDeals y la colección del profesional incluyen productos PRO).
 * La marca sale del catálogo: el vendor de Shopify no siempre es la marca real.
 */
export async function detalleProducto(handle) {
  const data = await shopifyAdmin(
    `query fichaProducto($handle: String!) {
      productByIdentifier(identifier: { handle: $handle }) {
        id title handle status onlineStoreUrl descriptionHtml tags
        images(first: 10) { edges { node { url } } }
        variants(first: 30) { edges { node {
          id title price compareAtPrice availableForSale image { url }
          ${CAMPOS_PRECIO_APP}
        } } }
      }
    }`,
    { handle }
  );
  const p = data?.productByIdentifier;
  if (!p || p.status !== "ACTIVE" || !p.onlineStoreUrl) return null;
  const productId = p.id.split("/").pop();

  const { data: cat } = await supabase
    .from("product_catalog")
    .select("brand")
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle();

  const { nutricional, resto } = separarTablaNutricional(p.descriptionHtml);
  const variants = p.variants.edges.map(({ node: v }) => ({
    variantId: v.id.split("/").pop(),
    productId,
    title: p.title,
    variantTitle: v.title === "Default Title" ? "" : v.title,
    price: v.price != null ? Number(v.price) : null,
    compareAtPrice: precioRegular(v.compareAtPrice, v.price),
    available: !!v.availableForSale,
    image: v.image?.url ?? p.images.edges[0]?.node?.url ?? null,
    handle: p.handle,
    tags: p.tags ?? [],
    precioAppValor: leerPrecioApp(v, v.price, v.compareAtPrice),
  }));
  await conInsignias(variants);
  return {
    productId,
    handle: p.handle,
    title: p.title,
    brand: cat?.brand ?? null,
    // Apps anteriores a la 1.1.2: todo como texto (la tabla en líneas)
    descripcion: htmlATexto(p.descriptionHtml),
    // Desde la 1.1.2: la descripción sin la tabla, y la tabla aparte para dibujarla como tabla
    descripcionSinTabla: htmlATexto(resto),
    nutricional,
    images: p.images.edges.map(({ node }) => node.url),
    url: buyUrl(p.handle),
    variants,
  };
}

/**
 * Saca la primera tabla de la descripción (la información nutricional) como datos:
 * { titulo, columnas: ["Componente", ...], filas: [["Magnesio", "400 mg", "95%"], ...], notas }
 * y devuelve el resto del HTML sin ella. Sin tabla: nutricional = null.
 */
function separarTablaNutricional(html = "") {
  const h = String(html);
  const tabla = h.match(/<table[\s\S]*?<\/table>/i);
  if (!tabla) return { nutricional: null, resto: h };

  // Si viene en su bloque (div.producto-tabla), el título y las notas son de ese bloque
  const bloque = h.match(/<div class="producto-tabla">([\s\S]*?)<\/div>\s*(?=<div class="producto-descripcion")/i);
  const zona = bloque ? bloque[1] : tabla[0];
  const titulo = textoEnLinea(zona.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? "") || "Información nutricional";
  const notas = bloque
    ? [...bloque[1].replace(tabla[0], "").matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => textoEnLinea(m[1])).filter(Boolean).join("\n")
    : "";

  let columnas = [];
  const filas = [];
  for (const [, fila] of tabla[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celdas = [...fila.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)];
    if (!celdas.length) continue;
    const textos = celdas.map((c) => textoEnLinea(c[2]));
    if (!columnas.length && celdas.every((c) => c[1].toLowerCase() === "th")) columnas = textos;
    else if (textos.some(Boolean)) filas.push(textos);
  }
  if (!filas.length) return { nutricional: null, resto: h };

  return {
    nutricional: { titulo, columnas, filas, notas: notas || null },
    resto: bloque ? h.replace(bloque[0], "") : h.replace(tabla[0], ""),
  };
}

// Texto plano de una celda o de un trozo chico de HTML (sin saltos)
function textoEnLinea(html = "") {
  return String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// Tabla nutricional → una línea por fila: "• Magnesio (como citrato): 400 mg · 95% VD".
// La fila de encabezado (th) no se muestra; solo marca qué columna es el % de valor diario.
function tablaATexto(tabla) {
  const filas = [...tabla.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  let columnaVD = -1;
  const lineas = [];
  for (const fila of filas) {
    const celdas = [...fila.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)];
    if (!celdas.length) continue;
    if (celdas.every((c) => c[1].toLowerCase() === "th")) {
      columnaVD = celdas.findIndex((c) => /valor\s+diario|%\s*vd/i.test(textoEnLinea(c[2])));
      continue;
    }
    const textos = celdas.map((c) => textoEnLinea(c[2]));
    if (!textos.some(Boolean)) continue;
    const resto = textos.slice(1)
      .map((t, i) => (t && i + 1 === columnaVD && !/vd|valor/i.test(t) ? `${t} VD` : t))
      .filter(Boolean);
    lineas.push(`• ${textos[0]}${resto.length ? `: ${resto.join(" · ")}` : ""}`);
  }
  return `\n${lineas.join("\n")}\n\n`;
}

// La app no renderiza HTML: párrafos y viñetas como texto plano
function htmlATexto(html = "") {
  let h = String(html);
  // La ficha de Shopify trae primero la información nutricional: en la app va al final
  const nutricional = h.match(/<div class="producto-tabla">([\s\S]*?)<\/div>\s*(?=<div class="producto-descripcion")/i);
  if (nutricional) h = h.replace(nutricional[0], "") + nutricional[1];
  return h
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<table[\s\S]*?<\/table>/gi, (t) => tablaATexto(t))
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Portada de la tienda: la colección de ofertas de vitahub.mx/collections/vitadeals,
// en el orden que tiene en Shopify y solo lo disponible
export async function vitaDeals(limite = 24) {
  const data = await shopifyAdmin(
    `query vitadeals($n: Int!) {
      collectionByIdentifier(identifier: { handle: "vitadeals" }) {
        products(first: $n, sortKey: COLLECTION_DEFAULT) { edges { node {
          status variants(first: 1) { edges { node { id } } }
        } } }
      }
    }`,
    { n: limite * 2 }
  );
  const vids = (data?.collectionByIdentifier?.products?.edges ?? [])
    .map(({ node }) => (node.status === "ACTIVE" ? node.variants.edges[0]?.node?.id?.split("/").pop() : null))
    .filter(Boolean);
  const vivos = await enriquecer(vids);
  return vids.map((v) => vivos[v]).filter((p) => p?.available).slice(0, limite);
}

// Sugeridos del carrito, administrados en PRO
export async function sugeridosDelCarrito() {
  const { data, error } = await supabase
    .from("customer_app_upsell")
    .select("variant_id, note")
    .eq("active", true)
    .order("position", { ascending: true })
    .limit(20);
  if (error) {
    console.error("[customerStore] upsell:", error.message);
    return [];
  }
  const vivos = await enriquecer((data ?? []).map((r) => r.variant_id));
  return (data ?? [])
    .map((r) => (vivos[String(r.variant_id)] ? { ...vivos[String(r.variant_id)], note: r.note ?? null } : null))
    .filter((p) => p?.available);
}
