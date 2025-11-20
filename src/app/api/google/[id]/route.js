import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    console.log('🔍 Orders API called - Specialist ID:', id);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "No hay id en parámetros" },
        { status: 400 }
      );
    }

    const numericCustomerId = parseInt(id);

    if (isNaN(numericCustomerId)) {
      return NextResponse.json(
        { success: false, message: "ID no es un número válido" },
        { status: 400 }
      );
    }

    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    console.log('✅ BigQuery configured');

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
        WHERE COALESCE(o.specialist_ref, o.referrer_id) = @customerId
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
              CASE WHEN pc.updated_at <= op.created_at THEN 0 ELSE 1 END,
              pc.updated_at DESC
          ) as rn
        FROM ORDEN_PRODUCTO op
        LEFT JOIN \`vitahub-435120.Shopify.product_comission\` pc 
          ON pc.variant_id = op.variant_id
      ),
      PRODUCTOS_ORDEN AS (
        SELECT 
          order_number,
          financial_status,
          created_at,  -- ✅ MANTENER created_at como TIMESTAMP
          customer_email,
          customer_first_name,
          share_cart,
          -- Agrupar productos por orden (solo información esencial)
          ARRAY_AGG(STRUCT(
            line_items_name as producto,
            line_items_quantity as cantidad,
            -- Calcular ganancia por producto
            (
              (line_items_price * line_items_quantity) - 
              COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
            ) * COALESCE(comission, 0) as ganancia_producto,
            handle as product_handle,
            duration as duracion,
            inventory_quantity as inventario,
            comission as comision
          )) as productos,
          -- Totales de la orden
          SUM(line_items_quantity) as total_items,
          SUM((
            (line_items_price * line_items_quantity) - 
            COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
          ) * COALESCE(comission, 0)) as ganancia_total
        FROM COMISIONES_FILTRADAS
        WHERE rn = 1
        GROUP BY 
          order_number, financial_status, created_at, customer_email, 
          customer_first_name, share_cart
      )
      SELECT 
        po.order_number,
        po.financial_status,
        po.created_at,  -- ✅ ESPECIFICAR po.created_at
        po.customer_email,
        po.customer_first_name as nombre_cliente,
        c.last_name as apellido_cliente,
        po.share_cart,
        po.productos,
        po.total_items,
        po.ganancia_total
      FROM PRODUCTOS_ORDEN po
      LEFT JOIN \`vitahub-435120.Shopify.customers\` c 
        ON po.customer_email = c.email
      WHERE 1=1
    `;

    let finalQuery = query;
    if (from && to) {
      finalQuery += ` AND DATE(po.created_at) BETWEEN @from AND @to`;  // ✅ ESPECIFICAR po.created_at
    }

    finalQuery += ` ORDER BY po.created_at DESC, po.order_number DESC`;  // ✅ ESPECIFICAR po.created_at

    const options = {
      query: finalQuery,
      location: 'us-east1',
      params: {
        customerId: numericCustomerId,
        ...(from && to ? { from, to } : {}),
      },
    };

    console.log('🔍 Executing orders query...');
    const [rows] = await bigquery.query(options);
    
    console.log('✅ Orders query success, rows:', rows.length);
    if (rows.length > 0) {
      console.log('Sample order:', {
        order_number: rows[0].order_number,
        created_at: rows[0].created_at,
        nombre_cliente: rows[0].nombre_cliente,
        apellido_cliente: rows[0].apellido_cliente,
        ganancia_total: rows[0].ganancia_total
      });
    }

    return NextResponse.json({ 
      success: true, 
      data: rows,
      message: `Encontradas ${rows.length} órdenes`
    });
    
  } catch (error) {
    console.error('❌ Error en BigQuery Orders:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message
      }, 
      { status: 500 }
    );
  }
}