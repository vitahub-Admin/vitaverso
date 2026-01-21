// lib/analyticsData.js
import { BigQuery } from "@google-cloud/bigquery";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export async function getCombinedAnalyticsData() {

  try {
    console.time('✅ Analytics data loaded');
    
    // 1️⃣ Obtener TODOS los afiliados de Supabase
    const { data: allAffiliates, error: supabaseError } = await supabase
      .from("affiliates")
      .select("shopify_customer_id, first_name, last_name, email, active_store,id")
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

    // 3️⃣ Query para sharecarts históricos (BigQuery) y órdenes
    const query = `
      /* =========================
         SHARECARTS HISTÓRICOS (BigQuery)
      ========================== */
      WITH HISTORICAL_SHARECARTS AS (
        SELECT
          sh.customer_id AS specialist_id,
          FORMAT_DATE('%Y-%m', DATE(sh.created_at)) AS year_month,
          COUNT(DISTINCT sh.code) AS sharecarts
        FROM \`vitahub-435120.sharecart.carritos\` sh
        WHERE sh.customer_id IS NOT NULL
        GROUP BY sh.customer_id, FORMAT_DATE('%Y-%m', DATE(sh.created_at))
      ),

      /* =========================
         ÓRDENES (solo BigQuery)
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
         COMBINAR HISTÓRICOS
      ========================== */
      COMBINED_HISTORICAL AS (
        SELECT
          COALESCE(hs.specialist_id, o.specialist_id) AS specialist_id,
          COALESCE(hs.year_month, o.year_month) AS year_month,
          COALESCE(hs.sharecarts, 0) AS historical_sharecarts,
          COALESCE(o.orders, 0) AS orders
        FROM HISTORICAL_SHARECARTS hs
        FULL OUTER JOIN ORDENES o
          ON hs.specialist_id = o.specialist_id
         AND hs.year_month = o.year_month
      )

      /* =========================
         RESULTADO TEMPORAL (luego sumamos Supabase)
      ========================== */
      SELECT
        specialist_id AS affiliate_shopify_customer_id,
        SUM(historical_sharecarts) AS total_historical_sharecarts,
        SUM(orders) AS total_orders,
        ARRAY_AGG(
          STRUCT(
            year_month,
            historical_sharecarts,
            orders
          )
          ORDER BY year_month
        ) AS monthly
      FROM COMBINED_HISTORICAL
      GROUP BY specialist_id
    `;

    const [bigQueryRows] = await bigquery.query({ query, location: "us-east1" });
    console.log(`📊 Afiliados con actividad histórica: ${bigQueryRows.length}`);

    // 4️⃣ Obtener sharecarts NUEVOS de Supabase
    const { data: newSharecarts, error: newSharecartsError } = await supabase
      .from("sharecarts")
      .select("owner_id, created_at")
      .not("owner_id", "is", null);

    if (newSharecartsError) {
      console.error("⚠️ Error fetching new sharecarts:", newSharecartsError);
      // Continuamos aunque falle esta parte
    }

    console.log(`📊 Sharecarts nuevos en Supabase: ${newSharecarts?.length || 0}`);

    // 5️⃣ Procesar sharecarts nuevos por afiliado y mes
    const newSharecartsByAffiliate = {};
    
    newSharecarts?.forEach(cart => {
      try {
        const ownerId = parseInt(cart.owner_id);
        if (isNaN(ownerId)) return;
        
        const date = new Date(cart.created_at);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!newSharecartsByAffiliate[ownerId]) {
          newSharecartsByAffiliate[ownerId] = {};
        }
        
        if (!newSharecartsByAffiliate[ownerId][yearMonth]) {
          newSharecartsByAffiliate[ownerId][yearMonth] = 0;
        }
        
        newSharecartsByAffiliate[ownerId][yearMonth]++;
      } catch (err) {
        console.warn("⚠️ Error procesando sharecart nuevo:", cart, err);
      }
    });

    // 6️⃣ Crear mapa de actividad combinada
    const activityMap = {};
    
    // Procesar datos históricos
    bigQueryRows.forEach(row => {
      const monthlyObj = {};
      row.monthly.forEach(m => {
        monthlyObj[m.year_month] = {
          sharecarts: m.historical_sharecarts,
          orders: m.orders,
        };
      });
      
      activityMap[row.affiliate_shopify_customer_id] = {
        totals: {
          sharecarts: row.total_historical_sharecarts,
          orders: row.total_orders,
        },
        monthly: monthlyObj,
      };
    });

    // 7️⃣ Agregar sharecarts nuevos al mapa
    Object.entries(newSharecartsByAffiliate).forEach(([ownerIdStr, monthsData]) => {
      const ownerId = parseInt(ownerIdStr);
      
      if (!activityMap[ownerId]) {
        activityMap[ownerId] = {
          totals: {
            sharecarts: 0,
            orders: 0,
          },
          monthly: {},
        };
      }
      
      // Sumar por mes
      Object.entries(monthsData).forEach(([yearMonth, count]) => {
        if (!activityMap[ownerId].monthly[yearMonth]) {
          activityMap[ownerId].monthly[yearMonth] = {
            sharecarts: 0,
            orders: 0,
          };
        }
        
        activityMap[ownerId].monthly[yearMonth].sharecarts += count;
      });
      
      // Actualizar totales
      const totalNew = Object.values(monthsData).reduce((a, b) => a + b, 0);
      activityMap[ownerId].totals.sharecarts += totalNew;
    });

    // 8️⃣ Combinar con TODOS los afiliados
    // En la función getCombinedAnalyticsData(), busca esta parte:
const data = allAffiliates.map(affiliate => {
  const shopifyId = affiliate.shopify_customer_id;
  const hasActivity = activityMap[shopifyId];
  
  if (hasActivity) {
    return {
      id: affiliate.id, // ← ESTE ES EL ID DE SUPABASE (IMPORTANTE)
      affiliate_shopify_customer_id: shopifyId,
      first_name: affiliate.first_name || "",
      last_name: affiliate.last_name || "",
      email: affiliate.email || "",
      totals: {
        sharecarts: hasActivity.totals.sharecarts || 0,
        orders: hasActivity.totals.orders || 0,
      },
      monthly: hasActivity.monthly || {},
      activo_carrito: (hasActivity.totals.sharecarts || 0) > 0,
      vendio: (hasActivity.totals.orders || 0) > 0,
      activo_tienda: affiliate.active_store || false,
    };
  } else {
    return {
      id: affiliate.id, // ← ESTE ES EL ID DE SUPABASE (IMPORTANTE)
      affiliate_shopify_customer_id: shopifyId,
      first_name: affiliate.first_name || "",
      last_name: affiliate.last_name || "",
      email: affiliate.email || "",
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
    // 9️⃣ Estadísticas
    const stats = {
      total_afiliados: data.length,
      con_sharecarts: data.filter(row => row.totals.sharecarts > 0).length,
      con_ordenes: data.filter(row => row.totals.orders > 0).length,
      total_sharecarts: data.reduce((sum, row) => sum + row.totals.sharecarts, 0),
      total_ordenes: data.reduce((sum, row) => sum + row.totals.orders, 0),
    };

    console.log("📊 Estadísticas combinadas:");
    console.log(`   - Afiliados totales: ${stats.total_afiliados}`);
    console.log(`   - Con sharecarts: ${stats.con_sharecarts}`);
    console.log(`   - Con órdenes: ${stats.con_ordenes}`);
    console.log(`   - Total sharecarts: ${stats.total_sharecarts}`);
    console.log(`   - Total órdenes: ${stats.total_ordenes}`);
    
    console.timeEnd('✅ Analytics data loaded');
    // En getCombinedAnalyticsData(), antes del return:
// console.log("🔍 Verificando estructura de datos...");
// console.log("Total afiliados procesados:", data.length);
// if (data.length > 0) {
//   console.log("Primer registro procesado:", data[0]);
//   console.log("¿Tiene id?", 'id' in data[0]);
//   console.log("¿Tiene affiliate_shopify_customer_id?", 'affiliate_shopify_customer_id' in data[0]);
// }

    return { 
      data, 
      stats,
      meta: {
        source: 'combined',
        timestamp: new Date().toISOString(),
      }
    };

  } catch (err) {
    console.error("❌ Error en getCombinedAnalyticsData:", err);
    throw err;
  }
}