import { BigQuery } from "@google-cloud/bigquery";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ─── HELPERS ───────────────────────────────────────────────────────────────

function getMeetStatus(invitees) {
  if (!invitees?.length) return 'none';

  const now = new Date();

  // ¿Tiene algún meet a futuro?
  const hasFuture = invitees.some(i =>
    i.scheduled_calls?.starts_at &&
    new Date(i.scheduled_calls.starts_at) > now &&
    i.scheduled_calls?.status !== 'canceled'
  );
  if (hasFuture) return 'future';

  // Meets pasados
  const pastInvitees = invitees.filter(i =>
    i.scheduled_calls?.starts_at &&
    new Date(i.scheduled_calls.starts_at) <= now
  );

  if (!pastInvitees.length) return 'none';

  // Si asistió a alguno → attended
  if (pastInvitees.some(i => i.attended === true)) return 'attended';

  // Si tiene meets pasados (attended null o false) → missed
  return 'missed';
}
// ─── DATA FETCHING ─────────────────────────────────────────────────────────

async function getAllAffiliates() {
  const PAGE_SIZE = 1000;
  let allAffiliates = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("affiliates")
      .select(`
        shopify_customer_id,
        first_name,
        last_name,
        email,
        active_store,
        id,
        created_at,
        vambe_contact_id,
        scheduled_call_invitees!scheduled_call_invitees_affiliate_id_fkey (
          id,
          attended,
          scheduled_calls (
            starts_at,
            status
          )
        )
      `)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    allAffiliates = [...allAffiliates, ...data];
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  return allAffiliates;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

export async function getCombinedAnalyticsData() {
  try {
    console.time("✅ Analytics data loaded");

    const allAffiliates = await getAllAffiliates();
// En getCombinedAnalyticsData, después de getAllAffiliates()
const withMeetings = allAffiliates.filter(a => a.scheduled_call_invitees?.length > 0);
console.log(`📊 Afiliados con invitees: ${withMeetings.length}`);
console.log('Sample:', JSON.stringify(withMeetings[0]?.scheduled_call_invitees?.slice(0, 2), null, 2));
    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
    });

    const query = `
      DECLARE today DATE DEFAULT CURRENT_DATE();

      WITH SHARECARTS AS (
        SELECT
          sh.owner_id AS specialist_id,
          DATE(sh.created_at) AS event_date,
          COUNT(*) AS sharecarts
        FROM \`vitahub-435120.bronce.carritos\` sh
        WHERE sh.owner_id IS NOT NULL
          AND DATE(sh.created_at) >= DATE_SUB(today, INTERVAL 90 DAY)
        GROUP BY sh.owner_id, event_date
      ),

      ORDENES AS (
        SELECT
          COALESCE(o.specialist_ref, o.referrer_id) AS specialist_id,
          DATE(o.created_at) AS event_date,
          COUNT(DISTINCT o.order_number) AS orders
        FROM \`vitahub-435120.silver.orders\` o
        WHERE o.customer_email IS NOT NULL
          AND COALESCE(o.specialist_ref, o.referrer_id) IS NOT NULL
          AND DATE(o.created_at) >= DATE_SUB(today, INTERVAL 90 DAY)
        GROUP BY specialist_id, event_date
      ),

      COMBINED AS (
        SELECT
          COALESCE(s.specialist_id, o.specialist_id) AS specialist_id,
          COALESCE(s.event_date, o.event_date) AS event_date,
          COALESCE(s.sharecarts, 0) AS sharecarts,
          COALESCE(o.orders, 0) AS orders
        FROM SHARECARTS s
        FULL OUTER JOIN ORDENES o
          ON s.specialist_id = o.specialist_id
         AND s.event_date = o.event_date
      )

      SELECT
        specialist_id AS affiliate_shopify_customer_id,
        SUM(CASE WHEN event_date >= DATE_SUB(today, INTERVAL 30 DAY)  THEN sharecarts ELSE 0 END) AS sc_30,
        SUM(CASE WHEN event_date >= DATE_SUB(today, INTERVAL 30 DAY)  THEN orders    ELSE 0 END) AS ord_30,
        SUM(CASE WHEN event_date >= DATE_SUB(today, INTERVAL 60 DAY)
                  AND event_date <  DATE_SUB(today, INTERVAL 30 DAY)  THEN sharecarts ELSE 0 END) AS sc_60,
        SUM(CASE WHEN event_date >= DATE_SUB(today, INTERVAL 60 DAY)
                  AND event_date <  DATE_SUB(today, INTERVAL 30 DAY)  THEN orders    ELSE 0 END) AS ord_60,
        SUM(CASE WHEN event_date >= DATE_SUB(today, INTERVAL 90 DAY)
                  AND event_date <  DATE_SUB(today, INTERVAL 60 DAY)  THEN sharecarts ELSE 0 END) AS sc_90,
        SUM(CASE WHEN event_date >= DATE_SUB(today, INTERVAL 90 DAY)
                  AND event_date <  DATE_SUB(today, INTERVAL 60 DAY)  THEN orders    ELSE 0 END) AS ord_90
      FROM COMBINED
      GROUP BY specialist_id
    `;

    const [bigQueryRows] = await bigquery.query({ query, location: "us-east1" });

    const activityMap = {};
    bigQueryRows.forEach((row) => {
      activityMap[row.affiliate_shopify_customer_id] = {
        sc_30:  Number(row.sc_30)  || 0,
        ord_30: Number(row.ord_30) || 0,
        sc_60:  Number(row.sc_60)  || 0,
        ord_60: Number(row.ord_60) || 0,
        sc_90:  Number(row.sc_90)  || 0,
        ord_90: Number(row.ord_90) || 0,
      };
    });

    const NOW = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const VAMBE_PIPELINE_ID = 'e62197d9-4933-4ad9-87d2-64fe03166ef5';

    const data = allAffiliates.map((affiliate) => {
      const shopifyId  = affiliate.shopify_customer_id;
      const activity   = activityMap[shopifyId] ?? {
        sc_30: 0, ord_30: 0,
        sc_60: 0, ord_60: 0,
        sc_90: 0, ord_90: 0,
      };
      const isNew      = affiliate.created_at &&
        NOW - new Date(affiliate.created_at).getTime() <= SEVEN_DAYS_MS;
      const meetStatus = getMeetStatus(affiliate.scheduled_call_invitees);

      return {
        id:                           affiliate.id,
        affiliate_shopify_customer_id: shopifyId,
        first_name:                   affiliate.first_name  || "",
        last_name:                    affiliate.last_name   || "",
        email:                        affiliate.email       || "",
        created_at:                   affiliate.created_at,
        is_new:                       isNew,
        active_store:                 affiliate.active_store || false,
        vambe_url: affiliate.vambe_contact_id
          ? `https://app.vambeai.com/pipeline?id=${VAMBE_PIPELINE_ID}&chatContactId=${affiliate.vambe_contact_id}`
          : null,
        sc_30:  activity.sc_30,
        ord_30: activity.ord_30,
        sc_60:  activity.sc_60,
        ord_60: activity.ord_60,
        sc_90:  activity.sc_90,
        ord_90: activity.ord_90,
        activo_carrito: activity.sc_30  > 0,
        vendio:         activity.ord_30 > 0,
        had_meeting:    meetStatus !== 'none',
        meet_status:    meetStatus,
      };
    });

    const stats = {
      total_afiliados:  data.length,
      con_sharecarts:   data.filter(r => r.sc_30  > 0).length,
      con_ordenes:      data.filter(r => r.ord_30 > 0).length,
      total_sharecarts: data.reduce((s, r) => s + r.sc_30,  0),
      total_ordenes:    data.reduce((s, r) => s + r.ord_30, 0),
    };

    console.timeEnd("✅ Analytics data loaded");
    return { data, stats, meta: { source: "bigquery_periods", timestamp: new Date().toISOString() } };

  } catch (err) {
    console.error("❌ Error en getCombinedAnalyticsData:", err);
    throw err;
  }
}