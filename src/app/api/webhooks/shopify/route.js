import { headers } from "next/headers";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const rawBody = await req.text();
    const headersList = headers();

    const hmac = headersList.get("x-shopify-hmac-sha256");
    const topic = headersList.get("x-shopify-topic");

    console.log("📦 Shopify webhook received:", topic);

    if (!hmac) {
      console.warn("⚠️ No HMAC header");
      return NextResponse.json({ error: "No HMAC header" }, { status: 401 });
    }

    // 🔐 Validación firma segura (timing-safe)
    const digest = crypto
      .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody, "utf8")
      .digest("base64");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmac)
    );

    if (!isValid) {
      console.error("❌ Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    const orderId = payload.id;
    const orderNumber = payload.order_number;
    const financialStatus = payload.financial_status;

    console.log("🧾 Order:", orderNumber, "| Status:", financialStatus);

    // Solo órdenes pagadas
    if (financialStatus !== "paid") {
      return NextResponse.json({ message: "Order not paid" }, { status: 200 });
    }

    /**
     * 🧠 1. Buscar affiliate_id
     */
    const affiliateAttr = payload.note_attributes?.find(
      (attr) => attr.name === "affiliate_id"
    );

    if (!affiliateAttr?.value) {
      console.log("ℹ️ No affiliate found");
      return NextResponse.json({ message: "No affiliate" }, { status: 200 });
    }

    const affiliateId = Number(affiliateAttr.value);

    if (isNaN(affiliateId)) {
      console.warn("⚠️ Invalid affiliate id:", affiliateAttr.value);
      return NextResponse.json({ message: "Invalid affiliate id" }, { status: 200 });
    }

    /**
     * 🧠 2. Idempotencia
     */
    const { data: existingTx } = await supabase
      .from("point_transactions")
      .select("id")
      .eq("reference_id", String(orderId))
      .eq("reference_type", "shopify_order")
      .eq("category", "earning")
      .maybeSingle();

    if (existingTx) {
      console.log("🔁 Already processed:", orderId);
      return NextResponse.json({ message: "Already processed" }, { status: 200 });
    }

    /**
     * 💰 3. Comisión
     */
    const orderTotal = Number(payload.total_price);

    if (isNaN(orderTotal)) {
      console.error("❌ Invalid order total:", payload.total_price);
      return NextResponse.json({ error: "Invalid order total" }, { status: 400 });
    }

    const commissionRate = 0.1; // mover luego a DB 👀
    const commission = Number((orderTotal * commissionRate).toFixed(2));

    console.log("💰 Commission:", commission);

    /**
     * 💳 4. Insertar transacción
     */
    const { error } = await supabase
      .from("point_transactions")
      .insert([
        {
          customer_id: affiliateId,
          points: commission,
          direction: "IN",
          category: "earning",
          status: "confirmed",
          reference_id: String(orderId),
          reference_type: "shopify_order",
          description: `Ganancia por orden #${orderNumber}`,
          actor_type: "system",
          metadata: {
            order_number: orderNumber,
            shopify_order_id: orderId,
            order_total: orderTotal,
            commission_rate: commissionRate,
          },
        },
      ]);

    if (error) {
      console.error("❌ Insert error:", error);
      throw error;
    }

    console.log("✅ Commission recorded successfully");

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (err) {
    console.error("🔥 Webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
