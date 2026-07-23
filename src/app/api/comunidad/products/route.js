import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

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

    // 1. Colección del afiliado
    const { data: affiliate, error: affError } = await supabase
      .from("affiliates")
      .select("shopify_collection_id")
      .eq("shopify_customer_id", parseInt(customerId, 10))
      .single();

    if (affError || !affiliate?.shopify_collection_id) {
      return NextResponse.json({ success: false, message: "Colección no encontrada" }, { status: 404 });
    }

    const collectionId = affiliate.shopify_collection_id;

    // 2. Productos de la colección + ventas por SKU en paralelo
    const [shopifyRes, skusData] = await Promise.all([
      fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "https://pro.vitahub.mx"}/api/shopify/collections/${collectionId}`,
        { cache: "no-store" }
      ).then((r) => r.json()),

      supabase
        .rpc("skus_vendidos_por_especialista", { specialist_id: customerId })
        .then(({ data }) => data || []),
    ]);

    if (!shopifyRes.success) {
      return NextResponse.json({ success: false, message: shopifyRes.message || "Colección no encontrada en Shopify" }, { status: 404 });
    }

    // 3. Mapa de ventas por SKU
    const salesMap = {};
    for (const row of skusData) {
      if (row.sku) salesMap[row.sku] = { total_sold: Number(row.total_sold), product_id: row.product_id, title: row.title };
    }

    // 4. Productos de la colección
    const collectionProducts = (shopifyRes.products || []).map((p) => {
      const sku = p.variants?.edges?.[0]?.node?.sku || null;
      const sale = sku ? salesMap[sku] : null;
      return {
        product_id:    extractShopifyId(p.id),
        handle:        p.handle,
        title:         p.title,
        sku,
        image:         p.images?.edges?.[0]?.node?.src || null,
        price:         p.variants?.edges?.[0]?.node?.price || null,
        in_collection: true,
        total_sold:    sale?.total_sold || 0,
      };
    });

    // 5. Productos vendidos fuera de la colección
    const collectionSkus = new Set(collectionProducts.map((p) => p.sku).filter(Boolean));
    const extraSold = skusData
      .filter((r) => r.sku && !collectionSkus.has(r.sku) && r.product_id)
      .map((r) => ({
        product_id:    Number(r.product_id),
        handle:        null,
        title:         r.title || r.sku,
        sku:           r.sku,
        image:         null,
        price:         null,
        in_collection: false,
        total_sold:    Number(r.total_sold),
      }));

    // 6. Fetch imágenes para extras
    if (extraSold.length > 0) {
      const ids = extraSold.map((p) => p.product_id).join(",");
      try {
        const imgRes = await fetch(
          `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/products.json?ids=${ids}&fields=id,image`,
          { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN }, cache: "no-store" }
        );
        if (imgRes.ok) {
          const { products: shopifyProducts } = await imgRes.json();
          const imgMap = {};
          for (const sp of shopifyProducts) imgMap[String(sp.id)] = sp.image?.src || null;
          for (const p of extraSold) p.image = imgMap[String(p.product_id)] || null;
        }
      } catch {
        // imagen no crítica
      }
    }

    // 7. Merge y orden por más vendidos
    const all = [...collectionProducts, ...extraSold];
    all.sort((a, b) => b.total_sold - a.total_sold);

    return NextResponse.json({
      success:           true,
      collection_handle: shopifyRes.collection?.handle || null,
      collection_title:  shopifyRes.collection?.title  || null,
      collection_image:  shopifyRes.collection?.image?.src || null,
      products:          all,
    });
  } catch (err) {
    console.error("comunidad/products error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
