import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_STORE        = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q) return NextResponse.json({ ok: false, error: "Missing query" }, { status: 400 });

  const gqlQuery = `
    {
      products(first: 20, query: "title:*${q}* OR tag:${q} status:active") {
        edges {
          node {
            id
            title
            descriptionHtml
            tags
            images(first: 1) { edges { node { src } } }
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  price
                  availableForSale
                  inventoryQuantity
                  comision: metafield(namespace: "custom", key: "comision_afiliado") {
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: gqlQuery }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[buscador] Shopify error:", res.status, text);
    return NextResponse.json({ ok: false, error: "Shopify error" }, { status: 500 });
  }

  const json = await res.json();

  if (json.errors) {
    console.error("[buscador] GraphQL errors:", json.errors);
    return NextResponse.json({ ok: false, error: "GraphQL error", details: json.errors }, { status: 500 });
  }

  const products = (json.data?.products?.edges || []).map(({ node }) => {
    const variant = node.variants.edges[0]?.node;
    return {
      id:          node.id.replace("gid://shopify/Product/", ""),
      title:       node.title,
      description: node.descriptionHtml?.replace(/<[^>]+>/g, "").trim().slice(0, 400) || "",
      tags:        node.tags,
      image:       node.images?.edges?.[0]?.node?.src || null,
      variant_id:  variant?.id.replace("gid://shopify/ProductVariant/", "") || null,
      price:       variant?.price || "0",
      available:   variant?.availableForSale ?? false,
      stock:       variant?.inventoryQuantity ?? null,
      comision:    variant?.comision?.value || null,
    };
  });

  // Cruzar con Supabase para obtener is_professional
  const productIds = products.map(p => Number(p.id)).filter(Boolean);
  if (productIds.length) {
    const { data: catalog } = await supabase
      .from("product_catalog")
      .select("product_id, is_professional")
      .in("product_id", productIds)
      .eq("is_professional", true);

    const proSet = new Set((catalog || []).map(r => String(r.product_id)));
    for (const p of products) {
      p.is_professional = proSet.has(p.id);
    }
  }

  console.log("[buscador] q:", q, "| productos:", products.length);

  return NextResponse.json({ ok: true, products });
}
