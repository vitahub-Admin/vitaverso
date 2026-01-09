import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import path from 'path';

// ID específico para mostrar datos fake (para videos demo)
const FAKE_CUSTOMER_ID = 10025223455041; // Cambia este número si quieres

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

    // ✅ VERIFICAR SI ES EL ID PARA DATOS FAKE (VIDEOS DEMO)
    if (numericCustomerId === FAKE_CUSTOMER_ID) {
      console.log('🎬 Usando datos fake para videos - customerId:', FAKE_CUSTOMER_ID);
      
      try {
        // Leer el archivo JSON con datos fake
        const fakeDataPath = path.join(process.cwd(), 'public', 'data', 'fake-orders.json');
        const fileContent = fs.readFileSync(fakeDataPath, 'utf8');
        const fakeOrders = JSON.parse(fileContent);
        
        console.log('✅ Datos fake cargados:', fakeOrders.length, 'órdenes');
        
        // Si hay filtros de fecha, aplicarlos
        let filteredOrders = fakeOrders;
        if (from && to) {
          const fromDate = new Date(from);
          const toDate = new Date(to);
          toDate.setHours(23, 59, 59, 999); // Incluir todo el día
          
          filteredOrders = fakeOrders.filter(order => {
            const orderDate = new Date(order.created_at.value || order.created_at);
            return orderDate >= fromDate && orderDate <= toDate;
          });
        }
        
        // Ordenar como en la query original
        filteredOrders.sort((a, b) => {
          const dateA = new Date(a.created_at.value || a.created_at);
          const dateB = new Date(b.created_at.value || b.created_at);
          return dateB - dateA || b.order_number - a.order_number;
        });
        
        return NextResponse.json({ 
          success: true, 
          data: filteredOrders,
          message: `🎥 ${filteredOrders.length} órdenes demo (para videos)`,
          isFakeData: true
        });
        
      } catch (fsError) {
        console.error('❌ Error cargando datos fake:', fsError);
        // Si falla la lectura del archivo, continuar con BigQuery
        console.log('⚠️ Continuando con BigQuery...');
      }
    }

    // ✅ CÓDIGO ORIGINAL PARA BIGQUERY (para IDs reales)
    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    console.log('✅ BigQuery configured para ID:', numericCustomerId);

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
          created_at,
          customer_email,
          customer_first_name,
          share_cart,
          ARRAY_AGG(STRUCT(
            line_items_name as producto,
            line_items_quantity as cantidad,
            (
              (line_items_price * line_items_quantity) - 
              COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
            ) * COALESCE(comission, 0) as ganancia_producto,
            handle as product_handle,
            duration as duracion,
            inventory_quantity as inventario,
            comission as comision
          )) as productos,
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
        po.created_at,
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
      finalQuery += ` AND DATE(po.created_at) BETWEEN @from AND @to`;
    }

    finalQuery += ` ORDER BY po.created_at DESC, po.order_number DESC`;

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