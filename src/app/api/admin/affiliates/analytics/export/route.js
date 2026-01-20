// pages/api/admin/affiliates/analytics/export.js
import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { createClient } from "@supabase/supabase-js";
import { toCSV, prepareDataForCSV } from "@/lib/analyticsExport";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export async function GET() {
  try {
    /* =========================
       1️⃣ BigQuery setup
    ========================== */
    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
    });

    /* =========================
       2️⃣ Query de Sharecarts y Orders (SIMPLIFICADA - solo datos del frontend)
    ========================== */
    const query = `
      /* 1. SHARECARTS BASE */
      WITH SHARECARTS_BASE AS (
        SELECT
          sh.customer_id AS specialist_id,
          FORMAT_DATE('%Y-%m', DATE(sh.created_at)) AS year_month,
          sh.code,
          CASE WHEN o.order_number IS NOT NULL THEN "Completed" ELSE "Pending" END AS status
        FROM \`vitahub-435120.sharecart.carritos\` sh
        LEFT JOIN \`vitahub-435120.silver.orders\` o
          ON sh.code = o.share_cart
        WHERE sh.customer_id IS NOT NULL
      ),

      SHARECARTS_MONTHLY AS (
        SELECT
          specialist_id,
          year_month,
          COUNT(DISTINCT code) AS sharecarts,
          COUNTIF(status = "Completed") AS completed_sharecarts,
          COUNTIF(status = "Pending") AS pending_sharecarts
        FROM SHARECARTS_BASE
        GROUP BY specialist_id, year_month
      ),

      /* 2. ORDENES BASE */
      ORDEN_PRODUCTO AS (
        SELECT
          COALESCE(o.specialist_ref, o.referrer_id) AS specialist_id,
          FORMAT_DATE('%Y-%m', DATE(o.created_at)) AS year_month,
          o.order_number
        FROM \`vitahub-435120.silver.orders\` o
        WHERE o.customer_email IS NOT NULL
          AND COALESCE(o.specialist_ref, o.referrer_id) IS NOT NULL
      ),

      ORDENES_MONTHLY AS (
        SELECT
          specialist_id,
          year_month,
          COUNT(DISTINCT order_number) AS orders
        FROM ORDEN_PRODUCTO
        GROUP BY specialist_id, year_month
      ),

      /* 3. UNIFICACION MENSUAL */
      MONTHLY AS (
        SELECT
          COALESCE(sc.specialist_id, o.specialist_id) AS specialist_id,
          COALESCE(sc.year_month, o.year_month) AS year_month,
          COALESCE(sc.sharecarts, 0) AS sharecarts,
          COALESCE(o.orders, 0) AS orders
        FROM SHARECARTS_MONTHLY sc
        FULL OUTER JOIN ORDENES_MONTHLY o
          ON sc.specialist_id = o.specialist_id
         AND sc.year_month = o.year_month
      ),

      /* 4. TOTALES */
      TOTALS AS (
        SELECT
          specialist_id,
          SUM(sharecarts) AS total_sharecarts,
          SUM(orders) AS total_orders
        FROM MONTHLY
        GROUP BY specialist_id
      )

      /* 5. FINAL - Solo actividad */
      SELECT
        t.specialist_id AS affiliate_shopify_customer_id,
        t.total_sharecarts,
        t.total_orders,
        ARRAY_AGG(
          STRUCT(
            m.year_month,
            m.sharecarts,
            m.orders
          )
          ORDER BY m.year_month
        ) AS monthly
      FROM TOTALS t
      JOIN MONTHLY m
        ON m.specialist_id = t.specialist_id
      GROUP BY t.specialist_id, t.total_sharecarts, t.total_orders
      ORDER BY t.total_orders DESC
    `;

    const [rows] = await bigquery.query({ query, location: "us-east1" });

    console.log(`📊 Export: ${rows.length} afiliados con actividad`);

    /* =========================
       3️⃣ Traer TODOS los afiliados de Supabase
    ========================== */
    const { data: allAffiliates, error: supabaseError } = await supabase
      .from("affiliates")
      .select("shopify_customer_id, first_name, last_name, email, active_store")
      .order("created_at", { ascending: false });

    if (supabaseError) {
      console.error("❌ Error fetching affiliates for export:", supabaseError);
      return NextResponse.json({ 
        success: false, 
        error: supabaseError.message 
      }, { status: 500 });
    }

    console.log(`📊 Export: ${allAffiliates.length} afiliados totales`);

    /* =========================
       4️⃣ Crear mapa de actividad (igual que en el frontend)
    ========================== */
    const activityMap = {};
    
    rows.forEach(row => {
      const monthlyObj = {};
      row.monthly.forEach(m => {
        monthlyObj[m.year_month] = {
          sharecarts: m.sharecarts,
          orders: m.orders,
        };
      });
      
      activityMap[row.affiliate_shopify_customer_id] = {
        totals: {
          sharecarts: row.total_sharecarts,
          orders: row.total_orders,
        },
        monthly: monthlyObj,
      };
    });

    /* =========================
       5️⃣ Preparar datos (igual que en el frontend)
    ========================== */
    const data = prepareDataForCSV(allAffiliates, activityMap);

    console.log(`📊 Export: ${data.length} registros procesados`);

    /* =========================
       6️⃣ Generar CSV
    ========================== */
    const csvContent = toCSV(data);
    
    // Crear nombre de archivo con fecha
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const filename = `analytics_afiliados_${dateStr}.csv`;

    /* =========================
       7️⃣ Devolver CSV como respuesta
    ========================== */
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (err) {
    console.error("❌ Export analytics error:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}