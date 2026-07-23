import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function getAllAffiliates() {
  const PAGE_SIZE = 1000;
  let all = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("affiliates")
      .select("shopify_customer_id, first_name, last_name, email, active_store, id, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    all = [...all, ...data];
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

// "2025-11-03T..." → "2025-11"
function toYearMonth(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : null;
}

export async function getCombinedAnalyticsData() {
  try {
    console.time("✅ Analytics export loaded");

    const [allAffiliates, { data: allOrders }, { data: allCarts }] = await Promise.all([
      getAllAffiliates(),
      supabase
        .from("orders")
        .select("specialist_ref, shopify_created_at, order_id")
        .not("specialist_ref", "is", null)
        .not("customer_email", "is", null),
      supabase
        .from("sharecarts")
        .select("owner_id, created_at")
        .not("owner_id", "is", null),
    ]);

    // Agregar mensualmente por specialist
    const activityMap = {};

    const ensureMonth = (id, ym) => {
      if (!activityMap[id]) activityMap[id] = { totals: { sharecarts: 0, orders: 0 }, monthly: {} };
      if (!activityMap[id].monthly[ym]) activityMap[id].monthly[ym] = { sharecarts: 0, orders: 0 };
    };

    const seenOrders = new Set();
    for (const o of (allOrders || [])) {
      const key = `${o.specialist_ref}_${o.order_id}`;
      if (seenOrders.has(key)) continue;
      seenOrders.add(key);
      const ym = toYearMonth(o.shopify_created_at);
      if (!ym) continue;
      const id = String(o.specialist_ref);
      ensureMonth(id, ym);
      activityMap[id].monthly[ym].orders++;
      activityMap[id].totals.orders++;
    }

    for (const c of (allCarts || [])) {
      const ym = toYearMonth(c.created_at);
      if (!ym) continue;
      const id = String(c.owner_id);
      ensureMonth(id, ym);
      activityMap[id].monthly[ym].sharecarts++;
      activityMap[id].totals.sharecarts++;
    }

    const NOW = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    const data = allAffiliates.map((affiliate) => {
      const shopifyId  = String(affiliate.shopify_customer_id);
      const hasActivity = activityMap[shopifyId];
      const isNew      = affiliate.created_at && NOW - new Date(affiliate.created_at).getTime() <= SEVEN_DAYS_MS;

      return {
        id:                            affiliate.id,
        affiliate_shopify_customer_id: affiliate.shopify_customer_id,
        first_name:                    affiliate.first_name || "",
        last_name:                     affiliate.last_name  || "",
        email:                         affiliate.email      || "",
        is_new:                        isNew,
        totals: {
          sharecarts: hasActivity?.totals.sharecarts ?? 0,
          orders:     hasActivity?.totals.orders     ?? 0,
        },
        monthly:        hasActivity?.monthly ?? {},
        activo_carrito: (hasActivity?.totals.sharecarts ?? 0) > 0,
        vendio:         (hasActivity?.totals.orders     ?? 0) > 0,
        activo_tienda:  affiliate.active_store || false,
      };
    });

    const stats = {
      total_afiliados:  data.length,
      con_sharecarts:   data.filter((r) => r.totals.sharecarts > 0).length,
      con_ordenes:      data.filter((r) => r.totals.orders > 0).length,
      total_sharecarts: data.reduce((s, r) => s + r.totals.sharecarts, 0),
      total_ordenes:    data.reduce((s, r) => s + r.totals.orders,     0),
    };

    console.timeEnd("✅ Analytics export loaded");
    return { data, stats, meta: { source: "supabase", timestamp: new Date().toISOString() } };

  } catch (err) {
    console.error("❌ Error en getCombinedAnalyticsData:", err);
    throw err;
  }
}
