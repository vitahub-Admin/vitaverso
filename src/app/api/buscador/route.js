import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q) return NextResponse.json({ ok: false, error: "Missing query" }, { status: 400 });

  // Usamos REST API que soporta búsqueda de texto libre
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=15&title=${encodeURIComponent(q)}`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[buscador] Shopify error:", res.status, text);
    return NextResponse.json({ ok: false, error: "Shopify error" }, { status: 500 });
  }

  const json = await res.json();
  console.log("[buscador] total productos:", json.products?.length);

  const products = (json.products || []).map((p) => ({
    id: String(p.id),
    title: p.title,
    description: p.body_html?.replace(/<[^>]+>/g, "").slice(0, 300) || "",
    tags: p.tags ? p.tags.split(", ") : [],
    image: p.images?.[0]?.src || null,
    variants: (p.variants || []).map((v) => ({
      id: String(v.id),
      title: v.title,
      price: v.price,
      available: v.inventory_quantity > 0,
    })),
  }));

  return NextResponse.json({ ok: true, products });
}
