// scripts/update-affiliate-stats.js
import { BigQuery } from "@google-cloud/bigquery";
import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

// Configuración de clientes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
});

// ────────────────────────────────────────────────────────────────────────────
// 1. OBTENER TODOS LOS AFILIADOS DE SUPABASE
// ────────────────────────────────────────────────────────────────────────────
async function getAllAffiliates() {
  const PAGE_SIZE = 1000;
  let allAffiliates = [];
  let page = 0;

  console.log("📋 Obteniendo afiliados desde Supabase...");

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("affiliates")
      .select("id, shopify_customer_id, first_name, last_name, email, active_store, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`Supabase error: ${error.message}`);

    allAffiliates = [...allAffiliates, ...data];

    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`   ✅ Total afiliados: ${allAffiliates.length}`);
  return allAffiliates;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. OBTENER DATOS HISTÓRICOS DE BIGQUERY (MISMA LÓGICA QUE TU LIB)
// ────────────────────────────────────────────────────────────────────────────
async function getHistoricalDataFromBigQuery() {
  console.log("📊 Consultando BigQuery para obtener datos históricos...");

  const query = `
    WITH SHARECARTS AS (
      SELECT
        sh.owner_id AS specialist_id,
        FORMAT_DATE('%Y-%m', DATE(sh.created_at)) AS year_month,
        COUNT(*) AS sharecarts
      FROM \`vitahub-435120.bronce.carritos\` sh
      WHERE sh.owner_id IS NOT NULL
      GROUP BY sh.owner_id, year_month
    ),

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
        STRUCT(year_month, sharecarts, orders)
        ORDER BY year_month
      ) AS monthly
    FROM COMBINED
    GROUP BY specialist_id
  `;

  const [rows] = await bigquery.query({ query, location: "us-east1" });
  
  // Crear mapa con los datos
  const activityMap = {};
  
  rows.forEach((row) => {
    const monthlyObj = {};
    row.monthly.forEach((m) => {
      monthlyObj[m.year_month] = { sharecarts: m.sharecarts, orders: m.orders };
    });

    activityMap[row.affiliate_shopify_customer_id] = {
      totals: {
        sharecarts: Number(row.total_sharecarts) || 0,
        orders: Number(row.total_orders) || 0,
      },
      monthly: monthlyObj,
    };
  });
  
  console.log(`   ✅ Afiliados con actividad en BigQuery: ${Object.keys(activityMap).length}`);
  return activityMap;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. ACTUALIZAR SUPABASE CON LOS DATOS OBTENIDOS
// ────────────────────────────────────────────────────────────────────────────
async function updateAffiliatesStats() {
  console.log("\n🚀 INICIANDO ACTUALIZACIÓN DE MÉTRICAS");
  console.log("═".repeat(60));
  console.time("⏱️  Tiempo total");
  
  try {
    // Paso 1: Obtener todos los afiliados
    const affiliates = await getAllAffiliates();
    
    // Paso 2: Obtener datos históricos de BigQuery
    const activityMap = await getHistoricalDataFromBigQuery();
    
    // Paso 3: Preparar actualizaciones
    console.log("\n💾 Actualizando registros en Supabase...");
    
    let updatedCount = 0;
    let zeroCount = 0;
    let errorCount = 0;
    const now = new Date().toISOString();
    
    // Procesar en batches para mejor performance
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < affiliates.length; i += BATCH_SIZE) {
      const batch = affiliates.slice(i, i + BATCH_SIZE);
      
      for (const affiliate of batch) {
        const shopifyId = affiliate.shopify_customer_id;
        const activity = activityMap[shopifyId];
        
        let totalSharecarts = 0;
        let totalOrders = 0;
        
        if (activity) {
          totalSharecarts = activity.totals.sharecarts;
          totalOrders = activity.totals.orders;
        }
        
        // Actualizar el afiliado en Supabase
        const { error } = await supabase
          .from("affiliates")
          .update({
            total_sharecarts: totalSharecarts,
            total_orders: totalOrders,
            stats_updated_at: now,
          })
          .eq("id", affiliate.id);
        
        if (error) {
          console.error(`   ❌ Error actualizando afiliado ${affiliate.id}:`, error.message);
          errorCount++;
        } else {
          if (totalOrders > 0 || totalSharecarts > 0) {
            updatedCount++;
          } else {
            zeroCount++;
          }
        }
      }
      
      // Mostrar progreso cada 1000 registros
      if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= affiliates.length) {
        const processed = Math.min(i + BATCH_SIZE, affiliates.length);
        console.log(`   📦 Procesados ${processed}/${affiliates.length} afiliados`);
      }
    }
    
    // Paso 4: Mostrar estadísticas finales
    console.log("\n" + "═".repeat(60));
    console.log("📊 RESUMEN DE ACTUALIZACIÓN");
    console.log("═".repeat(60));
    console.log(`   ✅ Afiliados con actividad:     ${updatedCount}`);
    console.log(`   ⭕ Afiliados sin actividad:     ${zeroCount}`);
    console.log(`   ❌ Errores:                    ${errorCount}`);
    console.log(`   📈 Total procesados:           ${affiliates.length}`);
    console.log(`   🕐 Última actualización:       ${now}`);
    console.log("═".repeat(60));
    
    // Mostrar algunos ejemplos
    console.log("\n📋 EJEMPLOS DE AFILIADOS ACTUALIZADOS:");
    const sampleAffiliates = affiliates.slice(0, 5);
    for (const affiliate of sampleAffiliates) {
      const activity = activityMap[affiliate.shopify_customer_id];
      console.log(`   • ${affiliate.first_name} ${affiliate.last_name} (ID: ${affiliate.shopify_customer_id})`);
      console.log(`     - Órdenes: ${activity?.totals.orders || 0} | Sharecarts: ${activity?.totals.sharecarts || 0}`);
    }
    
    console.timeEnd("⏱️  Tiempo total");
    
    return {
      success: true,
      total_affiliates: affiliates.length,
      updated_with_stats: updatedCount,
      updated_with_zero: zeroCount,
      errors: errorCount,
      timestamp: now,
    };
    
  } catch (err) {
    console.error("\n❌ ERROR FATAL:", err);
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. EJECUTAR SCRIPT
// ────────────────────────────────────────────────────────────────────────────
updateAffiliatesStats()
  .then(result => {
    console.log("\n✨ ¡Proceso completado exitosamente!");
    console.log("📋 Detalles completos:", JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error("\n💥 Error fatal:", err);
    process.exit(1);
  });