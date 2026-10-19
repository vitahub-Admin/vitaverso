// Tienda de la app de clientes (Mi Vitahub): búsqueda, categorías, recomendados del
// profesional y sugeridos del carrito. El catálogo sale de product_catalog (Supabase);
// precio, foto y disponibilidad se confirman en Shopify, que manda sobre eso.
//
// Toda venta que salga de la app se acredita al profesional del paciente: el carrito
// lleva specialist_ref (ver cartUrl en la app) además del metafield custom.referido.
import { supabase, shopifyAdmin, buyUrl } from "@/lib/customerSupplements";

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
      .eq("is_professional", false)
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

// Precio, foto y disponibilidad vivos en Shopify para una lista de variantes
export async function enriquecer(variantIds) {
  const ids = [...new Set(variantIds.map(String))].slice(0, 100);
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const data = await shopifyAdmin(
      `query storeVariants($ids: [ID!]!) {
        nodes(ids: $ids) { ... on ProductVariant {
          id title price availableForSale
          image { url }
          product { id title handle status featuredImage { url } }
        } }
      }`,
      { ids: ids.slice(i, i + 50).map((id) => `gid://shopify/ProductVariant/${id}`) }
    );
    for (const n of data?.nodes ?? []) {
      if (!n?.id || n.product?.status !== "ACTIVE") continue;
      out[n.id.split("/").pop()] = {
        variantId: n.id.split("/").pop(),
        productId: n.product.id.split("/").pop(),
        title: n.product.title,
        variantTitle: n.title === "Default Title" ? "" : n.title,
        price: n.price != null ? Number(n.price) : null,
        available: !!n.availableForSale,
        image: n.image?.url ?? n.product.featuredImage?.url ?? null,
        handle: n.product.handle,
        url: buyUrl(n.product.handle),
      };
    }
  }
  return out;
}

/**
 * Búsqueda en el catálogo: por nombre, marca o ingrediente, o por categoría.
 * Devuelve un producto por fila (su primera variante disponible), sin productos
 * profesionales, con lo agotado al final.
 */
export async function buscar({ q = "", categoria = null, limite = POR_PAGINA } = {}) {
  let query = supabase
    .from("product_catalog")
    .select("product_id, variant_id, title, brand")
    .eq("status", "ACTIVE")
    .eq("is_professional", false)
    .limit(160);

  const texto = String(q).trim().replace(/[,%()*]/g, " ").slice(0, 60);
  if (texto.length >= 2) {
    const t = `%${texto}%`;
    query = query.or(`title.ilike.${t},brand.ilike.${t},primary_ingredient.ilike.${t},componente.ilike.${t}`);
  }
  if (categoria) query = query.eq("level_2", categoria);
  if (texto.length < 2 && !categoria) return [];

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Un producto por fila (primera variante)
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
