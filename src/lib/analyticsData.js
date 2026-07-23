import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function getMeetStatus(invitees) {
  if (!invitees?.length) return "none";
  const now = new Date();
  const hasFuture = invitees.some(
    (i) =>
      i.scheduled_calls?.starts_at &&
      new Date(i.scheduled_calls.starts_at) > now &&
      i.scheduled_calls?.status !== "canceled"
  );
  if (hasFuture) return "future";
  const past = invitees.filter(
    (i) => i.scheduled_calls?.starts_at && new Date(i.scheduled_calls.starts_at) <= now
  );
  if (!past.length) return "none";
  if (past.some((i) => i.attended === true)) return "attended";
  return "missed";
}

async function getAllAffiliates() {
  const PAGE_SIZE = 1000;
  let all = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("affiliates")
      .select(`
        shopify_customer_id, first_name, last_name, email,
        active_store, id, created_at, vambe_contact_id,
        total_orders, total_sharecarts,
        scheduled_call_invitees!scheduled_call_invitees_affiliate_id_fkey (
          id, attended,
          scheduled_calls ( starts_at, status, event_type )
        )
      `)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    all = [...all, ...data];
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

// Agrupa fecha ISO en período 30/60/90 desde hoy
function getPeriod(dateStr, now) {
  const diff = (now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (diff <= 30) return "30";
  if (diff <= 60) return "60";
  if (diff <= 90) return "90";
  return null;
}

export async function getCombinedAnalyticsData() {
  try {
    console.time("✅ Analytics data loaded");

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [allAffiliates, { data: recentOrders }, { data: recentCarts }] = await Promise.all([
      getAllAffiliates(),
      supabase
        .from("orders")
        .select("specialist_ref, shopify_created_at, order_id")
        .not("specialist_ref", "is", null)
        .not("customer_email", "is", null)
        .gte("shopify_created_at", cutoff),
      supabase
        .from("sharecarts")
        .select("owner_id, created_at")
        .not("owner_id", "is", null)
        .gte("created_at", cutoff),
    ]);

    const now = Date.now();
    const VAMBE_PIPELINE_ID = "e62197d9-4933-4ad9-87d2-64fe03166ef5";

    // Agregar actividad por specialist y período
    const activityMap = {};

    const ensureEntry = (id) => {
      if (!activityMap[id]) {
        activityMap[id] = { sc_30: 0, ord_30: 0, sc_60: 0, ord_60: 0, sc_90: 0, ord_90: 0 };
      }
    };

    // Órdenes únicas por specialist y período
    const seenOrders = new Set();
    for (const o of (recentOrders || [])) {
      const key = `${o.specialist_ref}_${o.order_id}`;
      if (seenOrders.has(key)) continue;
      seenOrders.add(key);
      const period = getPeriod(o.shopify_created_at, now);
      if (!period) continue;
      ensureEntry(String(o.specialist_ref));
      activityMap[String(o.specialist_ref)][`ord_${period}`]++;
    }

    for (const c of (recentCarts || [])) {
      const period = getPeriod(c.created_at, now);
      if (!period) continue;
      ensureEntry(String(c.owner_id));
      activityMap[String(c.owner_id)][`sc_${period}`]++;
    }

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    const data = allAffiliates.map((affiliate) => {
      const shopifyId  = String(affiliate.shopify_customer_id);
      const activity   = activityMap[shopifyId] ?? { sc_30: 0, ord_30: 0, sc_60: 0, ord_60: 0, sc_90: 0, ord_90: 0 };
      const isNew      = affiliate.created_at && now - new Date(affiliate.created_at).getTime() <= SEVEN_DAYS_MS;
      const invitees   = affiliate.scheduled_call_invitees ?? [];
      const meetStatus = getMeetStatus(invitees);
      const meets      = invitees
        .filter((i) => i.scheduled_calls?.starts_at)
        .map((i) => ({
          attended:   i.attended ?? null,
          event_type: i.scheduled_calls.event_type ?? null,
          starts_at:  i.scheduled_calls.starts_at,
        }))
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      const meetEventTypes = [...new Set(meets.map((m) => m.event_type).filter(Boolean))];

      return {
        id:                            affiliate.id,
        affiliate_shopify_customer_id: affiliate.shopify_customer_id,
        first_name:                    affiliate.first_name  || "",
        last_name:                     affiliate.last_name   || "",
        email:                         affiliate.email       || "",
        created_at:                    affiliate.created_at,
        is_new:                        isNew,
        active_store:                  affiliate.active_store || false,
        vambe_url: affiliate.vambe_contact_id
          ? `https://app.vambeai.com/pipeline?id=${VAMBE_PIPELINE_ID}&chatContactId=${affiliate.vambe_contact_id}`
          : null,
        sc_30:          activity.sc_30,
        ord_30:         activity.ord_30,
        sc_60:          activity.sc_60,
        ord_60:         activity.ord_60,
        sc_90:          activity.sc_90,
        ord_90:         activity.ord_90,
        activo_carrito: (affiliate.total_sharecarts || 0) > 0,
        vendio:         (affiliate.total_orders     || 0) > 0,
        had_meeting:    meetStatus !== "none",
        meet_status:    meetStatus,
        meet_event_types: meetEventTypes,
        meets,
      };
    });

    const stats = {
      total_afiliados:  data.length,
      con_sharecarts:   data.filter((r) => r.sc_30  > 0).length,
      con_ordenes:      data.filter((r) => r.ord_30 > 0).length,
      total_sharecarts: data.reduce((s, r) => s + r.sc_30,  0),
      total_ordenes:    data.reduce((s, r) => s + r.ord_30, 0),
    };

    console.timeEnd("✅ Analytics data loaded");
    return { data, stats, meta: { source: "supabase", timestamp: new Date().toISOString() } };

  } catch (err) {
    console.error("❌ Error en getCombinedAnalyticsData:", err);
    throw err;
  }
}
