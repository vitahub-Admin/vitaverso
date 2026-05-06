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

    if (payload.financial_status !== "paid") {
      return NextResponse.json({ message: "Not paid" }, { status: 200 });
    }

    const orderId = payload.id;
    const orderNumber = payload.order_number;
    const customer = payload.customer || {};

    const getAttr = (name) =>
      payload.note_attributes?.find((a) => a.name === name)?.value || "";

    let specialistRef = getAttr("specialist_ref") || "0000";
    const shareCart = getAttr("share_cart") || null;

    const lineItems = (payload.line_items || []).map((item) => ({
      sku: item.sku || null,
      variant_title: item.variant_title || null,
      quantity: item.quantity,
      price: Number(item.price),
    }));

    const discountTitle = payload.discount_codes?.[0]?.code || null;

    // Detectar carrito corrupto e intentar corregir
    let correctedRef = null;
    let status = "ok";

    if (!specialistRef || specialistRef === "0000") {
      if (shareCart) {
        const { data: cartData } = await supabase
          .from("sharecarts")
          .select("owner_id")
          .eq("token", shareCart)
          .maybeSingle();

        if (cartData?.owner_id) {
          correctedRef = String(cartData.owner_id);
          status = "corrected";
        } else {
          status = "suspect";
        }
      } else {
        status = "suspect";
      }
    }

    // Guardar orden (upsert por si llega orders/updated)
    const { error: orderError } = await supabase
      .from("orders")
      .upsert(
        {
          order_id: orderId,
          order_name: payload.name,
          customer_id: customer.id || null,
          customer_name:
            [customer.first_name, customer.last_name]
              .filter(Boolean)
              .join(" ") || null,
          customer_email: customer.email || null,
          customer_phone: customer.phone || null,
          share_cart: shareCart,
          specialist_ref: specialistRef,
          corrected_ref: correctedRef,
          status,
          financial_status: payload.financial_status,
          fulfillment_status: payload.fulfillment_status || null,
          line_items: lineItems,
          discount_title: discountTitle,
          total: Number(payload.total_price),
          total_discounts: Number(payload.total_discounts),
          shopify_created_at: payload.created_at,
          shopify_updated_at: payload.updated_at,
        },
        { onConflict: "order_id" }
      );

    if (orderError) console.error("Order upsert error:", orderError);

    // Determinar especialista efectivo para comisiones
    const effectiveSpecialist =
      correctedRef || (specialistRef !== "0000" ? specialistRef : null);

    if (!effectiveSpecialist) {
      return NextResponse.json(
        { message: "No valid specialist, order saved", status },
        { status: 200 }
      );
    }

    const specialistId = Number(effectiveSpecialist);

    // Idempotencia
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

    // Calcular comisiones
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
      const commissionLine = subtotal * (Number(commissionPercent) / 100);

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
      return NextResponse.json(
        { message: "No commission", status },
        { status: 200 }
      );
    }

    const { error: txError } = await supabase
      .from("point_transactions")
      .insert([
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
            corrected: !!correctedRef,
            breakdown,
          },
        },
      ]);

    if (txError) throw txError;

    await supabase.rpc("increment_affiliate_orders", {
      p_shopify_id: specialistId,
    });

    return NextResponse.json({ success: true, status }, { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
