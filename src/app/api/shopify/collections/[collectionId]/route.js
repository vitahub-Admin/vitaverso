import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // ej: myshop.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
export async function GET(req, { params }) {


  const { collectionId } = params;
  try {
    const shopifyResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/custom_collections/${collectionId}.json`, {
      headers: {
        "X-Shopify-Access-Token":  SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    const data = await shopifyResponse.json();

    return NextResponse.json({ success: true, data });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
