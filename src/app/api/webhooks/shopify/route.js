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
    const hmac = req.headers.get("x-shopify-hmac-sha256");

    if (!hmac) {
      return NextResponse.json({ error: "No HMAC header" }, { status: 401 });
    }

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

    // 🔥 FILTROS TEMPRANOS
    if (financialStatus !== "paid") {
      return NextResponse.json({ message: "Not paid" }, { status: 200 });
    }

    const specialistAttr = payload.note_attributes?.find(
      (attr) => attr.name === "specialist_ref"
    );

    if (!specialistAttr || !specialistAttr.value || specialistAttr.value === "0000") {
      return NextResponse.json({ message: "No valid specialist" }, { status: 200 });
    }

    const specialistId = Number(specialistAttr.value);

    // 🔒 IDEMPOTENCIA
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

    // 🧮 CALCULO DE COMISIONES
    let totalCommission = 0;
    const breakdown = [];

    for (const item of payload.line_items) {
      const variantId = item.variant_id;
      const quantity = Number(item.quantity);
      const price = Number(item.price);

      const discount =
        item.discount_allocations?.reduce(
          (sum, d) => sum + Number(d.amount),
          0
        ) || 0;

      const subtotal = price * quantity - discount;

      const { data: commissionData } = await supabase
        .from("product_variant_commissions")
        .select("commission_percent")
        .eq("variant_id", variantId)
        .eq("active", true)
        .maybeSingle();

      const commissionPercent = commissionData?.commission_percent || 0;

      const commissionLine =
        subtotal * (Number(commissionPercent) / 100);

      totalCommission += commissionLine;

      breakdown.push({
        variant_id: variantId,
        quantity,
        price,
        subtotal,
        commission_percent: commissionPercent,
        commission_line: commissionLine,
      });
    }

    totalCommission = Number(totalCommission.toFixed(2));

    if (totalCommission <= 0) {
      return NextResponse.json({ message: "No commission" }, { status: 200 });
    }

    // 💾 INSERTAR TRANSACCION
    const { error } = await supabase.from("point_transactions").insert([
      {
        customer_id: specialistId,
        points: totalCommission,
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
          breakdown,
        },
      },
    ]);

    if (error) {
      console.error("Insert error:", error);
      throw error;
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (err) {
    console.error("🔥 Webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
