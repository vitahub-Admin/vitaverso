import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export async function GET(req) {
  
  try {
    // Leer customerId desde cookie
    const customerId = req.cookies.get("customerId")?.value;

    if (!customerId) {
      return new Response(
        JSON.stringify({ success: false, message: "No hay customerId en cookies" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
    });

    // Ejemplo de query: trae datos de una tabla
    const query1 = `SELECT order_number 
    FROM \`vitahub-435120.Shopify.orders\` 
    WHERE referrer_id = ${customerId}`;

    const query = `WITH ORDEN_PRODUCTO AS (
      SELECT 
        o.*,
        p.variant_id,
      FROM vitahub-435120.Shopify.orders o
      LEFT JOIN vitahub-435120.Shopify.products p 
        ON o.line_items_sku = p.variant_sku 
        AND o.line_items_product_id = p.id),
    ORDEN_PRODUCTO_VARIANTE AS (
      SELECT 
        ORDEN_PRODUCTO.*,
        pv.comission
      FROM ORDEN_PRODUCTO
      LEFT JOIN vitahub-435120.Shopify.product_comission pv 
        ON pv.variant_id = ORDEN_PRODUCTO.variant_id
    )
    SELECT 
      DATE(ORDEN_PRODUCTO_VARIANTE.created_at) as created_at,
      financial_status,
      order_number,
      line_items_name,
      line_items_quantity,
      line_items_price,
      line_items_sku,
      CASE
      WHEN discount_codes_code = "VITA10" THEN 0 ELSE discount_allocations_amount
      END AS discount_allocations_amount,
      customer_email,
      customer_phone,
      customer_first_name,
      share_cart,
      COALESCE(specialist_ref, referrer_id) AS specialist_id,
      COALESCE(referrer_email,c.email) as referrer_email,
      COALESCE(comission,0) as comission,
      CASE
        WHEN COALESCE(specialist_ref, referrer_id) IS NOT NULL OR share_cart IS NOT NULL THEN 1
        ELSE 0
      END AS flag_carrito_referido
    FROM ORDEN_PRODUCTO_VARIANTE
    LEFT JOIN vitahub-435120.Shopify.customers c
    ON ORDEN_PRODUCTO_VARIANTE.specialist_ref = c.id OR ORDEN_PRODUCTO_VARIANTE.referrer_id = c.id
    WHERE COALESCE(specialist_ref, referrer_id) IS NOT NULL`

    // Pasar parámetros de manera segura
    const options = {
      query,
      location: 'us-east1', // depende de dónde esté tu dataset
      params: { id },
    };

    // Ejecutamos la query
    const [rows] = await bigquery.query(options);
    // //const [rows] = await bigquery.query({
    //   query: 'SELECT * FROM `vitahub-435120.Shopify.customers` LIMIT 5',
    //   location: 'us-east1', 
    //   useLegacySql: false,
    // });

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error en BigQuery:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
