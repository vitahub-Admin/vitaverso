// app/api/shopify-auth/route.js
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET(request) {
  console.log("🟢 Shopify Auth endpoint called!");
  
  const { searchParams } = new URL(request.url);
  const loggedInCustomerId = searchParams.get("logged_in_customer_id");
  const shop = searchParams.get("shop");
  
  console.log("📥 Received:", { customerId: loggedInCustomerId, shop });

  if (!loggedInCustomerId) {
    console.log("❌ No customer ID");
    return NextResponse.redirect("https://vitahub.mx/account");
  }

  try {
    const token = jwt.sign(
      {
        customer_id: parseInt(loggedInCustomerId),
        exp: Math.floor(Date.now() / 1000) + 300,
        iss: "shopify-app-proxy",
        shop: shop
      },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );

    console.log("✅ Token generated for customer:", loggedInCustomerId);

    // Usa URL absoluta para evitar problemas
    const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/ganancias?token=${token}`;
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error("❌ Error:", error);
    return NextResponse.redirect("https://vitahub.mx/account");
  }
}