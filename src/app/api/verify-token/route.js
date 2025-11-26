// app/api/shopify-auth/route.js
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  const loggedInCustomerId = searchParams.get("logged_in_customer_id");
  const shop = searchParams.get("shop");
  
  console.log("🔐 App Proxy llamado para customer:", loggedInCustomerId);

  if (!loggedInCustomerId) {
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

    const redirectUrl = `${process.env.URL_BASE}/ganancias?token=${token}`;
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error("Error:", error);
    return NextResponse.redirect("https://vitahub.mx/account");
  }
}