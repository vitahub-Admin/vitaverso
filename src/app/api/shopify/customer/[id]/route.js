import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // ej: myshop.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET(req) {
  try {
    // Leer customerId desde cookie
    const customerId = req.cookies.get("customerId")?.value;

    if (!customerId) {
      return new Response(
        JSON.stringify({ success: false, message: "No hay customerId en cookies" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-07/customers/${customerId}.json`,
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
