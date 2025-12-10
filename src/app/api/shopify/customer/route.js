// app/api/shopify/customer/route.js
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET() {
  try {
    // Solo leer de cookies (como hace tu layout)
    const cookieStore = await cookies();
    const customerId = cookieStore.get("customerId")?.value;

    console.log("🔍 Endpoint /api/shopify/customer llamado");
    console.log("🔍 CustomerId desde cookies:", customerId);

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "No hay customerId en cookies" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-04/customers/${customerId}.json`,
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