import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function POST(req, { params }) {
  try {
    // ✅ CORREGIR: Añadir await
    const { collectionId } = await params;
    
    const { productId } = await req.json();

    console.log("Removiendo producto:", {
      collectionId,
      productId,
      productIdType: typeof productId
    });

    if (!productId) {
      return NextResponse.json({ 
        success: false, 
        error: "No se recibió productId" 
      }, { status: 400 });
    }

    // ✅ OPCIÓN A: Usar ID numérico directamente (si collectionId es numérico)
    // const collectionGid = `gid://shopify/Collection/${collectionId}`;
    
    // ✅ OPCIÓN B: Si productId ya viene como gid://shopify/Product/..., mantenerlo
    // Si viene como número, convertirlo a gid
    const productGid = productId.startsWith('gid://shopify/Product/') 
      ? productId 
      : `gid://shopify/Product/${productId}`;
    
    const collectionGid = collectionId.startsWith('gid://shopify/Collection/')
      ? collectionId
      : `gid://shopify/Collection/${collectionId}`;

    // GraphQL mutation
    const mutation = `
      mutation {
        collectionRemoveProducts(
          id: "${collectionGid}",
          productIds: ["${productGid}"]
        ) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    console.log("GraphQL Mutation:", mutation);

    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-04/graphql.json`, // ✅ Usar versión estable
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query: mutation }),
      }
    );

    const data = await response.json();
    console.log("Shopify Response:", data);

    if (data.errors) {
      return NextResponse.json({ 
        success: false, 
        error: data.errors,
        type: "graphql_errors"
      }, { status: 400 });
    }

    if (data.data?.collectionRemoveProducts?.userErrors?.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: data.data.collectionRemoveProducts.userErrors,
        type: "user_errors"
      }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true,
      message: "Producto removido exitosamente"
    });

  } catch (err) {
    console.error("Error en remove-product:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message,
      type: "server_error"
    }, { status: 500 });
  }
}