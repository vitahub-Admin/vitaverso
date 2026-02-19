// lib/analyticsData.js
import { BigQuery } from "@google-cloud/bigquery";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export async function getCombinedAnalyticsData() {
  try {
    console.time("✅ Analytics data loaded");

    // 1️⃣ Obtener TODOS los afiliados de Supabase
    const { data: allAffiliates, error: supabaseError } = await supabase
      .from("affiliates")
      .select(
        "shopify_customer_id, first_name, last_name, email, active_store, id, created_at"
      )
      .order("created_at", { ascending: false });

    if (supabaseError) {
      console.error("❌ Error fetching affiliates:", supabaseError);
      throw new Error(`Supabase error: ${supabaseError.message}`);
    }

    console.log(`📊 Total afiliados en Supabase: ${allAffiliates.length}`);

    // 2️⃣ Configurar BigQuery
    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
    });

    // 3️⃣ Query unificada: SHARECARTS + ORDENES (todo en BigQuery)
    const query = `
      /* =========================
         SHARECARTS (BRONZE)
      ========================== */
      WITH SHARECARTS AS (
        SELECT
          sh.owner_id AS specialist_id,
          FORMAT_DATE('%Y-%m', DATE(sh.created_at)) AS year_month,
          COUNT(*) AS sharecarts
        FROM \`vitahub-435120.bronce.carritos\` sh
        WHERE sh.owner_id IS NOT NULL
        GROUP BY sh.owner_id, year_month
      ),

      /* =========================
         ORDENES
      ========================== */
      ORDENES AS (
        SELECT
          COALESCE(o.specialist_ref, o.referrer_id) AS specialist_id,
          FORMAT_DATE('%Y-%m', DATE(o.created_at)) AS year_month,
          COUNT(DISTINCT o.order_number) AS orders
        FROM \`vitahub-435120.silver.orders\` o
        WHERE o.customer_email IS NOT NULL
          AND COALESCE(o.specialist_ref, o.referrer_id) IS NOT NULL
        GROUP BY specialist_id, year_month
      ),

      /* =========================
         COMBINAR
      ========================== */
      COMBINED AS (
        SELECT
          COALESCE(s.specialist_id, o.specialist_id) AS specialist_id,
          COALESCE(s.year_month, o.year_month) AS year_month,
          COALESCE(s.sharecarts, 0) AS sharecarts,
          COALESCE(o.orders, 0) AS orders
        FROM SHARECARTS s
        FULL OUTER JOIN ORDENES o
          ON s.specialist_id = o.specialist_id
         AND s.year_month = o.year_month
      )

      SELECT
        specialist_id AS affiliate_shopify_customer_id,
        SUM(sharecarts) AS total_sharecarts,
        SUM(orders) AS total_orders,
        ARRAY_AGG(
          STRUCT(
            year_month,
            sharecarts,
            orders
          )
          ORDER BY year_month
        ) AS monthly
      FROM COMBINED
      GROUP BY specialist_id
    `;

    const [bigQueryRows] = await bigquery.query({
      query,
      location: "us-east1",
    });

    console.log(
      `📊 Afiliados con actividad en BigQuery: ${bigQueryRows.length}`
    );

    // 4️⃣ Crear mapa de actividad
    const activityMap = {};

    bigQueryRows.forEach((row) => {
      const monthlyObj = {};

      row.monthly.forEach((m) => {
        monthlyObj[m.year_month] = {
          sharecarts: m.sharecarts,
          orders: m.orders,
        };
      });

      activityMap[row.affiliate_shopify_customer_id] = {
        totals: {
          sharecarts: row.total_sharecarts || 0,
          orders: row.total_orders || 0,
        },
        monthly: monthlyObj,
      };
    });

    // 5️⃣ Combinar con TODOS los afiliados
    const data = allAffiliates.map((affiliate) => {
      const shopifyId = affiliate.shopify_customer_id;
      const hasActivity = activityMap[shopifyId];

      const NOW = Date.now();
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

      const isNew =
        affiliate.created_at &&
        NOW - new Date(affiliate.created_at).getTime() <= SEVEN_DAYS_MS;

      if (hasActivity) {
        return {
          id: affiliate.id,
          affiliate_shopify_customer_id: shopifyId,
          first_name: affiliate.first_name || "",
          last_name: affiliate.last_name || "",
          email: affiliate.email || "",
          is_new: isNew,
          totals: {
            sharecarts: hasActivity.totals.sharecarts,
            orders: hasActivity.totals.orders,
          },
          monthly: hasActivity.monthly,
          activo_carrito: hasActivity.totals.sharecarts > 0,
          vendio: hasActivity.totals.orders > 0,
          activo_tienda: affiliate.active_store || false,
        };
      } else {
        return {
          id: affiliate.id,
          affiliate_shopify_customer_id: shopifyId,
          first_name: affiliate.first_name || "",
          last_name: affiliate.last_name || "",
          email: affiliate.email || "",
          is_new: isNew,
          totals: {
            sharecarts: 0,
            orders: 0,
          },
          monthly: {},
          activo_carrito: false,
          vendio: false,
          activo_tienda: affiliate.active_store || false,
        };
      }
    });

    // 6️⃣ Estadísticas globales
    const stats = {
      total_afiliados: data.length,
      con_sharecarts: data.filter((row) => row.totals.sharecarts > 0).length,
      con_ordenes: data.filter((row) => row.totals.orders > 0).length,
      total_sharecarts: data.reduce(
        (sum, row) => sum + row.totals.sharecarts,
        0
      ),
      total_ordenes: data.reduce((sum, row) => sum + row.totals.orders, 0),
    };

    console.log("📊 Estadísticas combinadas:");
    console.log(`   - Afiliados totales: ${stats.total_afiliados}`);
    console.log(`   - Con sharecarts: ${stats.con_sharecarts}`);
    console.log(`   - Con órdenes: ${stats.con_ordenes}`);
    console.log(`   - Total sharecarts: ${stats.total_sharecarts}`);
    console.log(`   - Total órdenes: ${stats.total_ordenes}`);

    console.timeEnd("✅ Analytics data loaded");

    return {
      data,
      stats,
      meta: {
        source: "bigquery_only",
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    console.error("❌ Error en getCombinedAnalyticsData:", err);
    throw err;
  }
}
