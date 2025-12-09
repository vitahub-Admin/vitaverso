import { NextResponse } from "next/server";

export async function GET(req, { params }) {
  try {
    // ✅ CORREGIR: Usar await
    const { id } = await params;
    
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    
    console.log("Params recibidos:", { id, customerId });

    // Query Shopify GraphQL filtrada por customer/order
    const query = `
      query($query: String!) {
        orders(first: 10, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              orderNumber
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                displayName
                email
              }
              note
              tags
            }
          }
        }
      }
    `;

    // Construir query string para filtrar
    let queryString = "";
    if (customerId) {
      // Si hay customerId en query param, buscar por ese cliente
      queryString = `customer_id:${customerId}`;
    } else if (id) {
      // Si hay id en params (specialist_ref), buscar por nota o tags
      queryString = `note:*${id}* OR tag:specialist_${id}`;
    }

    const variables = {
      query: queryString
    };

    console.log("Query GraphQL:", { query, variables });

    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2024-04/graphql.json`, // ✅ Versión estable
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
      }
    );

    const text = await response.text();
    console.log("Shopify response status:", response.status);
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error("Error parsing response:", parseError);
      return NextResponse.json(
        { 
          error: "Invalid JSON response from Shopify",
          rawResponse: text.substring(0, 200)
        }, 
        { status: 500 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { 
          error: data.errors ? JSON.stringify(data.errors) : "Error en Shopify API",
          details: data
        }, 
        { status: response.status }
      );
    }

    if (data.errors) {
      return NextResponse.json(
        { 
          error: "GraphQL errors",
          details: data.errors
        }, 
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      orders: data.data.orders,
      queryUsed: queryString
    });
    
  } catch (error) {
    console.error("Error en orders API:", error);
    return NextResponse.json(
      { 
        error: error.message,
        type: "server_error"
      }, 
      { status: 500 }
    );
  }
}