// app/api/google/client-details/[id]/route.js
import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    console.log('🔍 Client Details API called:');
    console.log('Specialist ID:', id);
    console.log('Customer Email:', email);

    if (!id || !email) {
      return NextResponse.json(
        { success: false, message: "Faltan parámetros requeridos" },
        { status: 400 }
      );
    }

    const numericCustomerId = parseInt(id);

    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    const query = `
      WITH ORDEN_PRODUCTO AS (
        SELECT 
          o.*,
          p.variant_id,
          p.handle,
          p.duration,
          p.inventory_quantity
        FROM \`vitahub-435120.silver.orders\` o
        LEFT JOIN \`vitahub-435120.silver.product\` p 
          ON o.line_items_sku = p.variant_sku 
          AND o.line_items_product_id = p.id
        WHERE COALESCE(o.specialist_ref, o.referrer_id) = @specialistId
          AND o.customer_email = @customerEmail
          AND o.customer_email IS NOT NULL
          AND LOWER(o.line_items_name) NOT LIKE '%tip%'
      ),
      COMISIONES_FILTRADAS AS (
        SELECT 
          op.*,
          pc.comission,
          ROW_NUMBER() OVER (
            PARTITION BY op.order_number, op.variant_id
            ORDER BY 
              CASE WHEN pc.updated_at <= op.created_at
                   THEN 0 ELSE 1 END,
              pc.updated_at DESC
          ) as rn
        FROM ORDEN_PRODUCTO op
        LEFT JOIN \`vitahub-435120.Shopify.product_comission\` pc 
          ON pc.variant_id = op.variant_id
      )
      SELECT 
        order_number,
        share_cart,
        financial_status,
        created_at,
        updated_at,
        line_items_name,
        line_items_quantity,
        line_items_price,
        COALESCE(comission, 0) as comission,
        line_items_price * COALESCE(comission, 0) * line_items_quantity as ganancia_producto,
        duration,
        handle,
        inventory_quantity
      FROM COMISIONES_FILTRADAS
      WHERE rn = 1
      ORDER BY order_number DESC, created_at DESC
    `;

    const options = {
      query,
      location: 'us-east1',
      params: { 
        specialistId: numericCustomerId,
        customerEmail: email 
      },
    };

    console.log('🔍 Executing client details query...');
    const [rows] = await bigquery.query(options);
    
    console.log('✅ Client details query success, rows:', rows.length);
    if (rows.length > 0) {
      console.log('Sample row:', {
        order_number: rows[0].order_number,
        product: rows[0].line_items_name,
        comission: rows[0].comission,
        ganancia: rows[0].ganancia_producto,
        inventory: rows[0].inventory_quantity
      });
    }

    return NextResponse.json({ 
      success: true, 
      data: rows,
      message: `Encontradas ${rows.length} órdenes`
    });
    
  } catch (error) {
    console.error('❌ Error en BigQuery Client Details:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        details: "Error ejecutando consulta en BigQuery"
      }, 
      { status: 500 }
    );
  }
}