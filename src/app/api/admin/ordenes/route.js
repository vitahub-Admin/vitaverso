import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const customerId  = cookieStore.get("customerId")?.value;
    if (!customerId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const storeHandle  = process.env.SHOPIFY_STORE?.replace(".myshopify.com", "");
    const thirtyDaysAgo   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const [suspectRes, monthlyRes] = await Promise.all([
      // Órdenes sospechosas últimos 30 días
      supabase
        .from("orders")
        .select("order_id, order_name, customer_name, customer_email, total, share_cart, shopify_created_at")
        .eq("status", "suspect")
        .gte("shopify_created_at", thirtyDaysAgo)
        .order("shopify_created_at", { ascending: false })
        .limit(200),

      // Todas las órdenes de los últimos 12 meses (solo campos para agregación)
      supabase
        .from("orders")
        .select("shopify_created_at, status")
        .gte("shopify_created_at", twelveMonthsAgo)
        .order("shopify_created_at", { ascending: true }),
    ]);

    // Agregar por mes
    const byMonth = {};
    for (const o of monthlyRes.data || []) {
      const month = (o.shopify_created_at || "").slice(0, 7);
      if (!month) continue;
      if (!byMonth[month]) byMonth[month] = { total: 0, with_specialist: 0, suspect: 0 };
      byMonth[month].total++;
      if (o.status === "ok" || o.status === "corrected") byMonth[month].with_specialist++;
      if (o.status === "suspect") byMonth[month].suspect++;
    }

    const monthly = Object.entries(byMonth)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
      .map(([month, stats], i, arr) => {
        const prev = arr[i + 1]?.[1];
        const growth = prev?.total
          ? Math.round(((stats.total - prev.total) / prev.total) * 100)
          : null;
        return {
          month,
          ...stats,
          pct_specialist: stats.total ? Math.round((stats.with_specialist / stats.total) * 100) : 0,
          growth,
        };
      });

    // Añadir URL de Shopify admin a cada orden sospechosa
    const suspect = (suspectRes.data || []).map(o => ({
      ...o,
      shopify_url: `https://admin.shopify.com/store/${storeHandle}/orders/${o.order_id}`,
    }));

    return NextResponse.json({ suspect, monthly });
  } catch (err) {
    console.error("admin/ordenes error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
