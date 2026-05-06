import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function shopifyQuery(query, variables = {}) {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function getProductReviews(productGid) {
  const data = await shopifyQuery(`{
    product(id: "${productGid}") {
      metafield(namespace: "custom", key: "review_especialistas") {
        id
        value
      }
    }
  }`);
  const mf = data?.data?.product?.metafield;
  return {
    metafieldId: mf?.id || null,
    reviews: mf?.value ? JSON.parse(mf.value) : [],
  };
}

async function setProductReviews(productGid, reviews) {
  const data = await shopifyQuery(`
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }
  `, {
    input: {
      id: productGid,
      metafields: [{
        namespace: "custom",
        key: "review_especialistas",
        value: JSON.stringify(reviews),
        type: "json",
      }],
    },
  });

  const errors = data?.data?.productUpdate?.userErrors;
  if (errors?.length) throw new Error(errors[0].message);
}

export async function GET() {
  const { data, error } = await supabase
    .from("product_comments")
    .select(`
      id, product_id, sku, collection_handle, comment, status, created_at, updated_at,
      customer_id,
      affiliates!inner ( first_name, last_name )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const comments = data.map((c) => ({
    id: c.id,
    product_id: c.product_id,
    sku: c.sku,
    collection_handle: c.collection_handle,
    comment: c.comment,
    status: c.status,
    created_at: c.created_at,
    updated_at: c.updated_at,
    customer_id: c.customer_id,
    affiliate_name: c.affiliates
      ? `${c.affiliates.first_name || ""} ${c.affiliates.last_name || ""}`.trim()
      : null,
  }));

  return NextResponse.json({ success: true, comments });
}

export async function POST(req) {
  const { id, status } = await req.json();

  if (!id || !["pending", "published", "rejected"].includes(status)) {
    return NextResponse.json({ success: false, error: "Parámetros inválidos" }, { status: 400 });
  }

  // Obtener el comentario de Supabase
  const { data: record, error: fetchError } = await supabase
    .from("product_comments")
    .select("product_id, collection_handle, comment, status")
    .eq("id", id)
    .single();

  if (fetchError || !record) {
    return NextResponse.json({ success: false, error: "Comentario no encontrado" }, { status: 404 });
  }

  const productGid = `gid://shopify/Product/${record.product_id}`;
  const { reviews } = await getProductReviews(productGid);

  if (status === "published") {
    // Upsert: reemplazar si ya existe la entrada para este handle, sino appendar
    const idx = reviews.findIndex((r) => r.handle === record.collection_handle);
    const entry = { handle: record.collection_handle, review: record.comment };
    if (idx >= 0) reviews[idx] = entry;
    else reviews.push(entry);
    await setProductReviews(productGid, reviews);

  } else if (status === "rejected" || status === "pending") {
    // Si estaba publicado, remover del metafield
    if (record.status === "published") {
      const updated = reviews.filter((r) => r.handle !== record.collection_handle);
      await setProductReviews(productGid, updated);
    }
  }

  // Actualizar status en Supabase
  const { error: updateError } = await supabase
    .from("product_comments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
