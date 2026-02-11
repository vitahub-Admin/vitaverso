import { headers } from "next/headers";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // 👈 IMPORTANTE

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const rawBody = await req.text();
    const hmac = headers().get("x-shopify-hmac-sha256");

    if (!hmac) {
      return NextResponse.json({ error: "No HMAC header" }, { status: 401 });
    }

    // 🔐 Validación firma Shopify
    const digest = crypto
      .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody, "utf8")
      .digest("base64");

    if (digest !== hmac) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    const orderId = payload.id;
    const orderNumber = payload.order_number;
    const financialStatus = payload.financial_status;

    // Solo procesamos órdenes pagadas
    if (financialStatus !== "paid") {
      return NextResponse.json({ message: "Order not paid" }, { status: 200 });
    }

    /**
     * 🧠 1. Obtener afiliado desde note_attributes
     * (ajustar según tu implementación real)
     */
    const affiliateAttr = payload.note_attributes?.find(
      (attr) => attr.name === "affiliate_id"
    );

    if (!affiliateAttr) {
      return NextResponse.json({ message: "No affiliate" }, { status: 200 });
    }

    const affiliateId = Number(affiliateAttr.value);
    if (!affiliateId) {
      return NextResponse.json({ message: "Invalid affiliate id" }, { status: 200 });
    }

    /**
     * 🧠 2. Verificar si ya acreditamos esta orden (IDEMPOTENCIA)
     */
    const { data: existingTx } = await supabase
      .from("point_transactions")
      .select("id")
      .eq("reference_id", String(orderId))
      .eq("reference_type", "shopify_order")
      .eq("category", "earning")
      .maybeSingle();

    if (existingTx) {
      return NextResponse.json({ message: "Already processed" }, { status: 200 });
    }

    /**
     * 💰 3. Calcular comisión
     */
    const orderTotal = Number(payload.total_price);
    const commissionRate = 0.1; // 10%
    const commission = Number((orderTotal * commissionRate).toFixed(2));

    /**
     * 💳 4. Insertar transacción IN
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
      console.error("Insert error:", error);
      throw error;
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
