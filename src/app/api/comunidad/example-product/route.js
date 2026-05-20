import { NextResponse } from "next/server";

const HANDLE = "complejo-de-vitaminas-b-enzimaticamente-activo-de-life-extension-proporciona-energia-y-vitalidad-60-capsulas-vegetales";

export async function GET() {
  try {
    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/products.json?handle=${HANDLE}&fields=id,title,image`,
      {
        headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
        next: { revalidate: 3600 },
      }
    );
    const { products } = await res.json();
    const p = products?.[0];
    return NextResponse.json({
      title: p?.title || null,
      image: p?.image?.src || null,
    });
  } catch {
    return NextResponse.json({ title: null, image: null });
  }
}
