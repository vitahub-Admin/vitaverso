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
          AND o.customer_email != ''
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
      ),
      ordenes_con_ganancia AS (
        SELECT 
          customer_email,
          customer_first_name,
          customer_phone,
          order_number,
          share_cart,
          created_at,
          -- Calcular ganancia considerando descuento: (precio * cantidad - descuento) * comisión
          (
            (line_items_price * line_items_quantity) - 
            COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
          ) * COALESCE(comission, 0) as ganancia_producto
        FROM COMISIONES_FILTRADAS
        WHERE rn = 1  -- ✅ EVITAR DUPLICADOS por comisiones históricas
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
        c.last_name as apellido_cliente,
        m.customer_email as email_cliente,
        m.telefono_cliente,
        m.cantidad_ordenes,
        m.cantidad_carritos,
        m.ganancia_total,
        m.fecha_ultima_orden,
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
      console.log('Sample row with corrected commission:', {
        nombre_cliente: rows[0].nombre_cliente,
        apellido_cliente: rows[0].apellido_cliente,
        email_cliente: rows[0].email_cliente,
        cantidad_ordenes: rows[0].cantidad_ordenes,
        cantidad_carritos: rows[0].cantidad_carritos,
        ganancia_total: rows[0].ganancia_total
      });
    }
// En Contacts API, después de obtener los rows:
console.log('💰 CONTACTS - Resumen por orden:');
const contactsSummary = rows.reduce((acc, row) => {
  const orderNum = row.order_number;
  if (!acc[orderNum]) acc[orderNum] = { total: 0, products: [] };
  acc[orderNum].total += parseFloat(row.ganancia_total || 0);
  acc[orderNum].products.push({
    product: row.line_items_name,
    ganancia: row.ganancia_total
  });
  return acc;
}, {});

Object.entries(contactsSummary).forEach(([order, data]) => {
  console.log(`Orden ${order}: $${data.total.toFixed(2)}`, data.products);
});
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