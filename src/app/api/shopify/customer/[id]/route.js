import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // ej: myshop.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET(req) {
  try {
    // Leer customerId desde cookie
    const customerId = req.cookies.get("customerId")?.value;

    if (!customerId) {
      // ✅ Usar NextResponse.json consistentemente
      return NextResponse.json(
        { success: false, message: "No hay customerId en cookies" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-04/customers/${customerId}.json`, // ✅ Usar versión estable 2024-04
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
        { 
          success: false,
          error: "Error fetching customer", 
          details: error,
          status: response.status 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(
      { 
        success: true, 
        customer: data.customer 
      }, 
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching customer:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Server error", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}