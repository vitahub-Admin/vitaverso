/**
 * /api/favoritos
 *
 * Fuente de verdad = Shopify collection personal del afiliado (shopify_collection_id).
 * Supabase (vh_pro_favoritos) se usa como caché de snapshot para carga rápida.
 *
 * GET    /api/favoritos          → lista favoritos (Shopify collection → enriched)
 * POST   /api/favoritos          → { product_id, product_data } agrega al collection
 * DELETE /api/favoritos?product_id=xxx  → quita del collection
 * PUT    /api/favoritos          → batch upsert (migración desde localStorage)
 */

import { createClient } from "@supabase/supabase-js";
import { resolveCustomerId, unauthorized } from "@/lib/customerAppAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// ── Helpers Shopify ───────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method:  "POST",
    headers: {
      "Content-Type":           "application/json",
      "X-Shopify-Access-Token": GQL_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(", "));
  return json.data;
}

/** Trae collection ID numérico del afiliado desde Supabase */
async function getCollectionId(customerId) {
  const { data, error } = await supabase
    .from("affiliates")
    .select("shopify_collection_id")
    .eq("shopify_customer_id", customerId)
    .single();
  if (error || !data?.shopify_collection_id) return null;
  return String(data.shopify_collection_id);
}

/** Trae todos los productos de la collection con price/stock/variants */
async function fetchCollectionProducts(collectionId, commissionMap) {
  const data = await gql(`
    query($id: ID!) {
      collection(id: $id) {
        products(first: 250) {
          edges {
            node {
              id
              title
              vendor
              featuredImage { url }
              variants(first: 20) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                    inventoryPolicy
                  }
                }
              }
            }
          }
        }
      }
    }
  `, { id: `gid://shopify/Collection/${collectionId}` });

  const edges = data?.collection?.products?.edges ?? [];

  return edges.map(({ node: p }) => {
    const productId = p.id.replace("gid://shopify/Product/", "");
    const variants  = p.variants.edges.map(({ node: v }) => {
      const stock = v.inventoryPolicy === "CONTINUE" ? null : v.inventoryQuantity;
      return {
        variant_id:    Number(v.id.replace("gid://shopify/ProductVariant/", "")),
        variant_title: v.title === "Default Title" ? null : v.title,
        price:         parseFloat(v.price || 0),
        sku:           v.sku || null,
        stock,
      };
    });
    const inStock    = variants.filter(v => v.stock === null || v.stock > 0);
    const min_price  = Math.min(...variants.map(v => v.price).filter(Boolean));
    const enrichment = commissionMap[productId] || {};

    return {
      product_id:         productId,
      title:              p.title,
      image_url:          p.featuredImage?.url || null,
      brand:              enrichment.brand || p.vendor || null,
      min_price:          isFinite(min_price) ? min_price : null,
      is_professional:    enrichment.is_professional || false,
      commission_percent: enrichment.commission_percent ?? 0,
      componente:         enrichment.componente || null,
      variants,
      all_out_of_stock:   inStock.length === 0,
    };
  });
}

/** Trae comisiones y marcas de product_catalog para una lista de product IDs */
async function fetchCommissions(productIds) {
  if (!productIds.length) return {};
  const { data } = await supabase
    .from("product_catalog")
    .select("product_shopify_id, brand, commission_percent, is_professional, componente")
    .in("product_shopify_id", productIds.map(Number));
  const map = {};
  for (const row of data || []) {
    map[String(row.product_shopify_id)] = {
      brand:              row.brand || null,
      commission_percent: row.commission_percent ?? 0,
      is_professional:    row.is_professional || false,
      componente:         row.componente || null,
    };
  }
  return map;
}

// ── GET — lista favoritos desde la Shopify collection ────────────────────────
export async function GET(req) {
  const customerId = await resolveCustomerId(req);
  if (!customerId) return unauthorized();

  const collectionId = await getCollectionId(customerId);

  // Sin colección asignada → devolver caché de Supabase como fallback
  if (!collectionId) {
    const { data } = await supabase
      .from("vh_pro_favoritos")
      .select("product_id, product_data")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    return Response.json({ ok: true, favorites: data || [], source: "cache" });
  }

  try {
    // Primero traemos IDs para hacer el enriquecimiento en paralelo
    const rawData = await gql(`
      query($id: ID!) {
        collection(id: $id) {
          products(first: 250) {
            edges { node { id } }
          }
        }
      }
    `, { id: `gid://shopify/Collection/${collectionId}` });

    const productIds = (rawData?.collection?.products?.edges ?? [])
      .map(({ node }) => node.id.replace("gid://shopify/Product/", ""));

    const commissionMap = await fetchCommissions(productIds);
    const products      = await fetchCollectionProducts(collectionId, commissionMap);

    // Formatear como { product_id, product_data } para compatibilidad con el hook
    const favorites = products.map(p => ({
      product_id:   p.product_id,
      product_data: p,
    }));

    return Response.json({ ok: true, favorites, collection_id: collectionId, source: "shopify" });
  } catch (err) {
    console.error("favoritos GET error:", err.message);
    // Fallback a caché Supabase si Shopify falla
    const { data } = await supabase
      .from("vh_pro_favoritos")
      .select("product_id, product_data")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    return Response.json({ ok: true, favorites: data || [], source: "cache_fallback" });
  }
}

// ── POST — agregar favorito (Shopify collection + caché Supabase) ─────────────
export async function POST(req) {
  const customerId = await resolveCustomerId(req);
  if (!customerId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { product_id, product_data } = body;
  if (!product_id) return Response.json({ error: "product_id required" }, { status: 400 });

  const collectionId = await getCollectionId(customerId);

  // Agregar a Shopify collection
  if (collectionId) {
    try {
      const result = await gql(`
        mutation($collectionId: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $collectionId, productIds: $productIds) {
            userErrors { field message }
          }
        }
      `, {
        collectionId: `gid://shopify/Collection/${collectionId}`,
        productIds:   [`gid://shopify/Product/${product_id}`],
      });

      const errors = result?.collectionAddProducts?.userErrors;
      if (errors?.length) {
        console.error("Shopify collectionAddProducts error:", errors);
      }
    } catch (err) {
      console.error("collectionAddProducts error:", err.message);
      // No hacemos fail — guardamos al menos en Supabase
    }
  }

  // Guardar snapshot en caché Supabase
  await supabase
    .from("vh_pro_favoritos")
    .upsert(
      {
        customer_id:  Number(customerId),
        product_id:   String(product_id),
        product_data: product_data ?? {},
        updated_at:   new Date().toISOString(),
      },
      { onConflict: "customer_id,product_id" }
    );

  return Response.json({ ok: true });
}

// ── DELETE — quitar favorito (Shopify collection + caché) ─────────────────────
export async function DELETE(req) {
  const customerId = await resolveCustomerId(req);
  if (!customerId) return unauthorized();

  const product_id = new URL(req.url).searchParams.get("product_id");
  if (!product_id) return Response.json({ error: "product_id required" }, { status: 400 });

  const collectionId = await getCollectionId(customerId);

  // Quitar de Shopify collection
  if (collectionId) {
    try {
      await gql(`
        mutation($collectionId: ID!, $productIds: [ID!]!) {
          collectionRemoveProducts(id: $collectionId, productIds: $productIds) {
            userErrors { field message }
          }
        }
      `, {
        collectionId: `gid://shopify/Collection/${collectionId}`,
        productIds:   [`gid://shopify/Product/${product_id}`],
      });
    } catch (err) {
      console.error("collectionRemoveProducts error:", err.message);
    }
  }

  // Quitar del caché Supabase
  await supabase
    .from("vh_pro_favoritos")
    .delete()
    .eq("customer_id", Number(customerId))
    .eq("product_id", String(product_id));

  return Response.json({ ok: true });
}

// ── PUT — batch upsert (migración desde localStorage) ────────────────────────
export async function PUT(req) {
  const customerId = await resolveCustomerId(req);
  if (!customerId) return unauthorized();

  const items = await req.json().catch(() => []);
  if (!Array.isArray(items) || items.length === 0)
    return Response.json({ ok: true, migrated: 0 });

  const collectionId = await getCollectionId(customerId);

  // Agregar todos a Shopify collection de una vez
  if (collectionId) {
    try {
      const productIds = items.map(i => `gid://shopify/Product/${i.product_id}`);
      await gql(`
        mutation($collectionId: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $collectionId, productIds: $productIds) {
            userErrors { field message }
          }
        }
      `, { collectionId: `gid://shopify/Collection/${collectionId}`, productIds });
    } catch (err) {
      console.error("batch collectionAddProducts:", err.message);
    }
  }

  // Guardar snapshots en caché Supabase
  const rows = items.map(({ product_id, product_data }) => ({
    customer_id:  Number(customerId),
    product_id:   String(product_id),
    product_data: product_data ?? {},
    updated_at:   new Date().toISOString(),
  }));

  await supabase
    .from("vh_pro_favoritos")
    .upsert(rows, { onConflict: "customer_id,product_id" });

  return Response.json({ ok: true, migrated: rows.length });
}
