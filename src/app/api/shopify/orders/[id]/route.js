import { NextResponse } from "next/server";

export async function GET(req, { params })  {
  const specialistRef = params.id; // este es tu "customerId"
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId"); // specialist_ref que buscamos

  

    // Query Shopify GraphQL
    const query = `
    query {
      orders(first: 5, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
    `;

    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query }),
      }
    );

    const text = await response.text();
    const data = JSON.parse(text);

    if (!response.ok) {
      throw new Error(data.errors ? JSON.stringify(data.errors) : "Error en Shopify API");
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
