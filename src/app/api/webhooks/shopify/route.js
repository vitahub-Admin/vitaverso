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

    console.log("📦 RAW BODY:", rawBody);

    const headersList = await headers();
    const hmac = headersList.get("x-shopify-hmac-sha256");
    const topic = headersList.get("x-shopify-topic");

    console.log("📨 Topic:", topic);
    console.log("🔐 HMAC header:", hmac);

    if (!hmac) {
      return NextResponse.json({ error: "No HMAC header" }, { status: 401 });
    }

    const digest = crypto
      .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody, "utf8")
      .digest("base64");

    console.log("🧮 Generated digest:", digest);

    if (digest !== hmac) {
      console.error("❌ Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    console.log("🧾 Parsed payload:", payload);

    const orderId = payload.id;
    const orderNumber = payload.order_number;
    const financialStatus = payload.financial_status;

    console.log("🔎 Order data:", {
      orderId,
      orderNumber,
      financialStatus,
      total_price: payload.total_price,
      note_attributes: payload.note_attributes,
    });

    if (financialStatus !== "paid") {
      console.log("⏳ Order not paid, skipping...");
      return NextResponse.json({ message: "Order not paid" }, { status: 200 });
    }

    const affiliateAttr = payload.note_attributes?.find(
      (attr) => attr.name === "affiliate_id"
    );

    console.log("👤 Affiliate attribute:", affiliateAttr);

    if (!affiliateAttr) {
      return NextResponse.json({ message: "No affiliate" }, { status: 200 });
    }

    const affiliateId = Number(affiliateAttr.value);

    if (!affiliateId) {
      return NextResponse.json({ message: "Invalid affiliate id" }, { status: 200 });
    }

    const { data: existingTx } = await supabase
      .from("point_transactions")
      .select("id")
      .eq("reference_id", String(orderId))
      .eq("reference_type", "shopify_order")
      .eq("category", "earning")
      .maybeSingle();

    if (existingTx) {
      console.log("🔁 Already processed");
      return NextResponse.json({ message: "Already processed" }, { status: 200 });
    }

    const orderTotal = Number(payload.total_price);
    const commissionRate = 0.1;
    const commission = Number((orderTotal * commissionRate).toFixed(2));

    console.log("💰 Commission calculated:", commission);

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
      console.error("Insert error:", error);
      throw error;
    }

    console.log("✅ Commission stored");

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (err) {
    console.error("🔥 Webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
