// app/api/google/contacts/[id]/route.js
import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    console.log('CustomerId from params (id):', id);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "No hay id en parámetros" },
        { status: 400 }
      );
    }

    const numericCustomerId = parseInt(id);
    console.log('Numeric customerId:', numericCustomerId);

    if (isNaN(numericCustomerId)) {
      return NextResponse.json(
        { success: false, message: "id no es un número válido" },
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

    console.log('✅ BigQuery configured, executing query...');

    // QUERY ACTUALIZADA - Incluyendo last_name en el SELECT final
    const query = `
      WITH ORDEN_PRODUCTO AS (
        SELECT 
          o.*,
          p.variant_id
        FROM \`vitahub-435120.silver.orders\` o
        LEFT JOIN \`vitahub-435120.Shopify.products\` p 
          ON o.line_items_sku = p.variant_sku 
          AND o.line_items_product_id = p.id
      ),
      ORDEN_PRODUCTO_VARIANTE AS (
        SELECT 
          ORDEN_PRODUCTO.*,
          pv.comission
        FROM ORDEN_PRODUCTO
        LEFT JOIN \`vitahub-435120.Shopify.product_comission\` pv 
          ON pv.variant_id = ORDEN_PRODUCTO.variant_id
      ),
      ordenes_con_ganancia AS (
        SELECT 
          customer_email,
          customer_first_name,
          customer_phone,
          order_number,
          share_cart,
          created_at,
          -- Calcular ganancia por producto (precio * comisión * cantidad)
          line_items_price * COALESCE(comission, 0) * line_items_quantity as ganancia_producto
        FROM ORDEN_PRODUCTO_VARIANTE
        WHERE COALESCE(specialist_ref, referrer_id) = @customerId
          AND customer_email IS NOT NULL
          AND customer_email != ''
      ),
      metricas_por_cliente AS (
        SELECT 
          customer_email,
          customer_first_name as nombre_cliente,
          customer_phone as telefono_cliente,
          COUNT(DISTINCT order_number) as cantidad_ordenes,
          COUNT(DISTINCT share_cart) as cantidad_carritos,
          SUM(ganancia_producto) as ganancia_total,
          MAX(created_at) as fecha_ultima_orden
        FROM ordenes_con_ganancia
        GROUP BY 
          customer_email, 
          customer_first_name, 
          customer_phone
      )
      SELECT 
        m.nombre_cliente,
        c.last_name as apellido_cliente,  -- ✅ INCLUIR last_name
        m.customer_email as email_cliente,
        m.telefono_cliente,
        m.cantidad_carritos,
        m.ganancia_total,
        m.fecha_ultima_orden,
        -- Formatear fecha para mejor visualización
        FORMAT_DATE('%Y-%m-%d', DATE(m.fecha_ultima_orden)) as fecha_ultima_orden_formateada
      FROM metricas_por_cliente m
      LEFT JOIN \`vitahub-435120.Shopify.customers\` c 
        ON m.customer_email = c.email
      ORDER BY m.fecha_ultima_orden DESC
    `;

    const options = {
      query,
      location: 'us-east1',
      params: { customerId: numericCustomerId },
    };

    console.log('🔍 Executing BigQuery with params:', options.params);
    
    const [rows] = await bigquery.query(options);
    
    console.log('✅ BigQuery success, rows returned:', rows.length);
    if (rows.length > 0) {
      console.log('Sample row with last_name:', {
        nombre_cliente: rows[0].nombre_cliente,
        apellido_cliente: rows[0].apellido_cliente,
        email_cliente: rows[0].email_cliente,
        ganancia_total: rows[0].ganancia_total
      });
    }

    return NextResponse.json({ 
      success: true, 
      data: rows,
      message: `Encontrados ${rows.length} contactos`
    });
    
  } catch (error) {
    console.error('❌ Error en BigQuery:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        details: 'Error ejecutando la consulta de contactos'
      }, 
      { status: 500 }
    );
  }
}