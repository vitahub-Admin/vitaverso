// POST /api/customer-app/push-token
// Guarda el Expo push token del dispositivo
import { NextResponse } from "next/server";
import { verifyCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return unauthorized();

  const { shopifyCustomerId } = payload;

  try {
    const { pushToken } = await req.json();
    if (!pushToken) return NextResponse.json({ ok: false, error: "pushToken requerido" }, { status: 400 });

    await supabase
      .from("customer_app_users")
      .update({ push_token: pushToken })
      .eq("shopify_customer_id", Number(shopifyCustomerId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push-token error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
