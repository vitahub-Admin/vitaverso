import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to   = searchParams.get("to");

    // 1. Órdenes con specialist_ref, con filtro de fecha opcional
    let ordersQuery = supabase
      .from("orders")
      .select("order_id, order_name, shopify_created_at, specialist_ref, line_items, total_discounts")
      .not("specialist_ref", "is", null)
      .not("customer_email", "is", null);

    if (from && to) {
      ordersQuery = ordersQuery
        .gte("shopify_created_at", from)
        .lte("shopify_created_at", to + "T23:59:59");
    }

    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;
    if (!orders?.length) {
      return NextResponse.json({ success: true, data: [], meta: { count: 0, dateRange: { from, to } } });
    }

    // 2. Comisiones y datos de afiliados en paralelo
    const productIds    = [...new Set(orders.flatMap(o => (o.line_items || []).map(i => i.product_id).filter(Boolean)))];
    const specialistIds = [...new Set(orders.map(o => o.specialist_ref).filter(Boolean))];

    const [{ data: commissions }, { data: affiliates }] = await Promise.all([
      supabase
        .from("product_variant_commissions")
        .select("product_id, commission_percent")
        .in("product_id", productIds)
        .eq("active", true),
      supabase
        .from("affiliates")
        .select("shopify_customer_id, first_name, last_name, email, status")
        .in("shopify_customer_id", specialistIds.map(Number)),
    ]);

    const commMap = {};
    for (const c of (commissions || [])) commMap[String(c.product_id)] = Number(c.commission_percent);

    const affMap = {};
    for (const a of (affiliates || [])) affMap[String(a.shopify_customer_id)] = a;

    // 3. Calcular métricas por orden → una fila por orden (igual que BQ)
    const rows = orders.map(order => {
      const items         = (order.line_items || []).filter(i => i.title && !i.title.toLowerCase().includes("tip"));
      const orderSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0);
      const totalDiscount = Number(order.total_discounts || 0);

      let total_items = 0;
      let net_amount  = 0;
      let earning     = 0;

      for (const item of items) {
        const commission   = commMap[String(item.product_id || "")] ?? 0;
        const price        = Number(item.price || 0);
        const qty          = item.quantity || 1;
        const lineSubtotal = price * qty;
        const lineDiscount = orderSubtotal > 0 ? totalDiscount * (lineSubtotal / orderSubtotal) : 0;
        const lineNet      = lineSubtotal - lineDiscount;

        total_items += qty;
        net_amount  += lineNet;
        earning     += lineNet * (commission / 100);
      }

      const aff = affMap[String(order.specialist_ref)] || {};

      return {
        specialist_id: order.specialist_ref,
        first_name:    aff.first_name  || null,
        last_name:     aff.last_name   || null,
        email:         aff.email       || null,
        tags:          aff.status      || null,
        order_number:  order.order_name?.replace("#", "") || String(order.order_id),
        created_at:    { value: order.shopify_created_at },
        total_items,
        net_amount,
        earning,
      };
    });

    // Ordenar por specialist_id y fecha desc (igual que BQ)
    rows.sort((a, b) =>
      String(a.specialist_id).localeCompare(String(b.specialist_id)) ||
      (b.created_at?.value || "").localeCompare(a.created_at?.value || "")
    );

    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, dateRange: { from, to } },
    });

  } catch (error) {
    console.error("❌ Admin sharecarts error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
