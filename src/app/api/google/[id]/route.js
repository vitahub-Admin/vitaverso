import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { cookies } from 'next/headers';

export async function GET(req) {
  try {
    // Leer customerId desde cookie
    const cookieStore = await cookies();
    const customerIdRaw = cookieStore.get("customerId")?.value;
    const customerId = customerIdRaw ? parseInt(customerIdRaw, 10) : null;

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "No hay customerId en cookies" },
        { status: 400 }
      );
    }

    // Leer parámetros de la URL (from y to)
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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
        WHERE COALESCE(o.specialist_ref, o.referrer_id) = @customerId
          AND o.customer_email IS NOT NULL
          AND LOWER(o.line_items_name) NOT LIKE '%tip%'
      ),
      COMISIONES_FILTRADAS AS (
        SELECT 
          op.*,
          pc.comission,
          pc.updated_at as comission_updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY op.order_number, op.variant_id
            ORDER BY 
              CASE WHEN pc.updated_at <= op.created_at THEN 0 ELSE 1 END,
              pc.updated_at DESC
          ) as rn
        FROM ORDEN_PRODUCTO op
        LEFT JOIN \`vitahub-435120.Shopify.product_comission\` pc 
          ON pc.variant_id = op.variant_id
      )
      SELECT 
        DATE(cf.created_at) as created_at,  -- ✅ ESPECIFICAR LA TABLA
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
        COALESCE(referrer_email, c.email) as referrer_email,
        COALESCE(comission, 0) as comission,
        -- Calcular ganancia
        (
          (line_items_price * line_items_quantity) - 
          COALESCE(CAST(
            CASE
              WHEN discount_codes_code = "VITA10" THEN 0 ELSE discount_allocations_amount
            END AS FLOAT64
          ), 0)
        ) * COALESCE(comission, 0) as ganancia_producto,
        CASE
          WHEN COALESCE(specialist_ref, referrer_id) IS NOT NULL OR share_cart IS NOT NULL THEN 1
          ELSE 0
        END AS flag_carrito_referido,
        handle,
        duration,
        inventory_quantity
      FROM COMISIONES_FILTRADAS cf  -- ✅ USAR ALIAS
      LEFT JOIN \`vitahub-435120.Shopify.customers\` c
        ON cf.specialist_ref = c.id OR cf.referrer_id = c.id
      WHERE cf.rn = 1  -- ✅ ESPECIFICAR LA TABLA
    `;

    // Si hay fechas, agregar filtro dinámico
    let finalQuery = query;
    if (from && to) {
      finalQuery += ` AND DATE(cf.created_at) BETWEEN @from AND @to`;  // ✅ ESPECIFICAR LA TABLA
    }

    const options = {
      query: finalQuery,
      location: 'us-east1',
      params: {
        customerId,
        ...(from && to ? { from, to } : {}),
      },
    };

    console.log('🔍 Executing ganancias query with corrected commissions...');
    const [rows] = await bigquery.query(options);
    
    console.log('✅ Ganancias query success, rows:', rows.length);
    if (rows.length > 0) {
      console.log('Sample row with corrected commission:', {
        order_number: rows[0].order_number,
        product: rows[0].line_items_name,
        price: rows[0].line_items_price,
        quantity: rows[0].line_items_quantity,
        discount: rows[0].discount_allocations_amount,
        comission: rows[0].comission,
        ganancia: rows[0].ganancia_producto
      });
    }
    // En Ganancias API, después de obtener los rows:
console.log('💰 GANANCIAS - Resumen por orden:');
const gananciasSummary = rows.reduce((acc, row) => {
  const orderNum = row.order_number;
  if (!acc[orderNum]) acc[orderNum] = { total: 0, products: [] };
  acc[orderNum].total += parseFloat(row.ganancia_producto || 0);
  acc[orderNum].products.push({
    product: row.line_items_name,
    ganancia: row.ganancia_producto,
    precio: row.line_items_price,
    cantidad: row.line_items_quantity,
    descuento: row.discount_allocations_amount,
    comision: row.comission
  });
  return acc;
}, {});

Object.entries(gananciasSummary).forEach(([order, data]) => {
  console.log(`Orden ${order}: $${data.total.toFixed(2)}`, data.products);
});

    return NextResponse.json({ 
      success: true, 
      data: rows,
      message: `Encontradas ${rows.length} órdenes`
    });
    
  } catch (error) {
    console.error('❌ Error en BigQuery:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        details: 'Error ejecutando la consulta de ganancias'
      }, 
      { status: 500 }
    );
  }
}