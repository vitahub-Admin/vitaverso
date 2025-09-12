import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function POST(req, { params }) {
  try {
    const { collectionId } = params;
    const { productId } = await req.json();

    if (!productId) {
      return NextResponse.json({ success: false, error: "No se recibió productId" });
    }

    // GraphQL mutation correcta
    const mutation = `
    mutation {
      collectionRemoveProducts(
        id: "gid://shopify/Collection/${collectionId}",
        productIds: ["${productId}"]
      ) {
        userErrors {
          field
          message
        }
      }
    }
  `;
  


  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: mutation }),
  });
  

    const data = await response.json();

    if (data.errors || data.data.collectionRemoveProducts.userErrors.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: data.errors || data.data.collectionRemoveProducts.userErrors
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
