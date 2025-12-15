import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
    });

    const query = `
      WITH ORDEN_PRODUCTO AS (
        SELECT
          COALESCE(o.specialist_ref, o.referrer_id) AS specialist_id,
          o.order_number,
          o.created_at,
          o.line_items_quantity,
          o.line_items_price,
          o.discount_allocations_amount,
          p.variant_id,
          pc.comission,
          ROW_NUMBER() OVER (
            PARTITION BY o.order_number, p.variant_id
            ORDER BY
              CASE WHEN pc.updated_at <= o.created_at THEN 0 ELSE 1 END,
              pc.updated_at DESC
          ) AS rn
        FROM \`vitahub-435120.silver.orders\` o
        LEFT JOIN \`vitahub-435120.silver.product\` p
          ON o.line_items_sku = p.variant_sku
         AND o.line_items_product_id = p.id
        LEFT JOIN \`vitahub-435120.Shopify.product_comission\` pc
          ON pc.variant_id = p.variant_id
        WHERE o.customer_email IS NOT NULL
          AND LOWER(o.line_items_name) NOT LIKE '%tip%'
          AND COALESCE(o.specialist_ref, o.referrer_id) IS NOT NULL
          ${from && to ? "AND DATE(o.created_at) BETWEEN @from AND @to" : ""}
      ),
      
      ORDENES_LIMPIAS AS (
        SELECT
          specialist_id,
          order_number,
          created_at,
          SUM(line_items_quantity) AS total_items,
          SUM(
            (line_items_price * line_items_quantity) -
            COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
          ) AS net_amount,
          SUM(
            (
              (line_items_price * line_items_quantity) -
              COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
            ) * COALESCE(comission, 0)
          ) AS earning
        FROM ORDEN_PRODUCTO
        WHERE rn = 1
        GROUP BY specialist_id, order_number, created_at
      )
      
      SELECT
        o.specialist_id,
        sc.first_name,
        sc.last_name,
        sc.email,
        sc.tags,
        o.order_number,
        o.created_at,
        o.total_items,
        o.net_amount,
        o.earning
      FROM ORDENES_LIMPIAS o
      LEFT JOIN \`vitahub-435120.Shopify.customers\` sc
        ON sc.id = o.specialist_id
      ORDER BY o.specialist_id, o.created_at DESC
    `;

    const options = {
      query,
      location: "us-east1",
      params: from && to ? { from, to } : {},
    };

    const [rows] = await bigquery.query(options);

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        count: rows.length,
        dateRange: { from, to },
      },
    });
  } catch (error) {
    console.error("❌ Admin specialists summary error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
