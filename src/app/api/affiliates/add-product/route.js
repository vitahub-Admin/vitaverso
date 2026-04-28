// POST /api/affiliates/add-product
// Recibe { customer_id, product_id } desde Shopify, busca la colección del afiliado en Supabase
// y agrega el producto a esa colección via Shopify Admin API.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function withCors(response) {
  response.headers.set("Access-Control-Allow-Origin", "https://vitahub.mx");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req) {
  try {
    const { customer_id, product_id } = await req.json();

    if (!customer_id || !product_id) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "customer_id y product_id requeridos" },
          { status: 400 }
        )
      );
    }

    // 1. Buscar colección del afiliado en Supabase
    const { data, error } = await supabase
      .from("affiliates")
      .select("shopify_collection_id")
      .eq("shopify_customer_id", parseInt(customer_id, 10))
      .single();

    if (error || !data?.shopify_collection_id) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "Afiliado no encontrado o sin colección asignada" },
          { status: 404 }
        )
      );
    }

    // 2. Agregar producto a la colección via Shopify Admin API
    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/collects.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          collect: {
            product_id: parseInt(product_id, 10),
            collection_id: parseInt(data.shopify_collection_id, 10),
          },
        }),
      }
    );

    const shopifyData = await res.json();

    if (!res.ok) {
      console.error("Shopify error:", shopifyData);
      return withCors(
        NextResponse.json(
          { ok: false, error: shopifyData.errors ?? "Error en Shopify" },
          { status: 502 }
        )
      );
    }

    return withCors(NextResponse.json({ ok: true, collect: shopifyData.collect }));
  } catch (err) {
    console.error("add-product error:", err);
    return withCors(
      NextResponse.json({ ok: false, error: err.message }, { status: 500 })
    );
  }
}
