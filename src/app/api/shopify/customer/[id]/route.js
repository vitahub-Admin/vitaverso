import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // ej: myshop.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET(req, { params }) {
  const { id } = params;

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-07/customers/${id}.json`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Error fetching customer", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data.customer, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Server error", details: error.message },
      { status: 500 }
    );
  }
}
