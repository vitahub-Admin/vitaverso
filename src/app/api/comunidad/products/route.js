import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { BigQuery } from "@google-cloud/bigquery";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
});

function extractShopifyId(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  return Number(parts[parts.length - 1]);
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const customerId = cookieStore.get("customerId")?.value;
    if (!customerId) {
      return NextResponse.json({ success: false, message: "No hay sesión activa" }, { status: 401 });
    }

    // 1. Obtener collection_id del afiliado
    const { data: affiliate, error: affError } = await supabase
      .from("affiliates")
      .select("shopify_collection_id")
      .eq("shopify_customer_id", parseInt(customerId, 10))
      .single();

    if (affError || !affiliate?.shopify_collection_id) {
      return NextResponse.json({ success: false, message: "Colección no encontrada" }, { status: 404 });
    }

    const collectionId = affiliate.shopify_collection_id;

    // 2. Productos de la colección desde Shopify (en paralelo con BQ)
    const [shopifyRes, bqRows] = await Promise.all([
      fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "https://pro.vitahub.mx"}/api/shopify/collections/${collectionId}`,
        { cache: "no-store" }
      ).then((r) => r.json()),

      bigquery
        .query({
          query: `
            SELECT
              o.line_items_product_id AS product_id,
              o.line_items_sku        AS sku,
              SUM(o.line_items_quantity) AS total_sold
            FROM \`vitahub-435120.silver.orders\` o
            WHERE COALESCE(o.specialist_ref, o.referrer_id) = @specialistId
              AND o.line_items_product_id IS NOT NULL
              AND LOWER(o.line_items_name) NOT LIKE '%tip%'
            GROUP BY product_id, sku
            ORDER BY total_sold DESC
          `,
          params: { specialistId: parseInt(customerId, 10) },
          location: "us-east1",
        })
        .then(([rows]) => rows),
    ]);

    // 3. Mapa de ventas por product_id
    const salesMap = {};
    for (const row of bqRows) {
      salesMap[String(row.product_id)] = Number(row.total_sold);
    }

    // 4. Productos de la colección con ventas mezcladas
    const collectionProducts = (shopifyRes.products || []).map((p) => {
      const numericId = extractShopifyId(p.id);
      return {
        product_id: numericId,
        handle: p.handle,
        title: p.title,
        sku: p.variants?.edges?.[0]?.node?.id
          ? null
          : p.variants?.edges?.[0]?.node?.id,
        image: p.images?.edges?.[0]?.node?.src || null,
        price: p.variants?.edges?.[0]?.node?.price || null,
        in_collection: true,
        total_sold: salesMap[String(numericId)] || 0,
      };
    });

    // 5. Productos vendidos que NO están en la colección actual
    const collectionIds = new Set(collectionProducts.map((p) => String(p.product_id)));
    const extraSold = bqRows
      .filter((r) => !collectionIds.has(String(r.product_id)))
      .map((r) => ({
        product_id: Number(r.product_id),
        handle: null,
        title: r.sku || String(r.product_id),
        sku: r.sku,
        image: null,
        price: null,
        in_collection: false,
        total_sold: Number(r.total_sold),
      }));

    // 6. Merge: vendidos primero (desc), luego sin ventas
    const all = [...collectionProducts, ...extraSold];
    all.sort((a, b) => b.total_sold - a.total_sold);

    const collectionHandle = shopifyRes.collection?.handle || null;

    return NextResponse.json({
      success: true,
      collection_handle: collectionHandle,
      products: all,
    });
  } catch (err) {
    console.error("comunidad/products error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
