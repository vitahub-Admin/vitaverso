import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

// ID específico para mostrar datos fake
const FAKE_CUSTOMER_ID = 10025223455041;

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

    // ✅ VERIFICAR SI ES EL ID PARA DATOS FAKE
    if (numericCustomerId === FAKE_CUSTOMER_ID) {
      console.log('🎬 Usando datos fake para customerId:', FAKE_CUSTOMER_ID);
      
      // DATOS FAKE DIRECTAMENTE EN EL CÓDIGO (más simple)
          // DATOS FAKE MEJORADOS CON MÁS VARIEDAD
          const fakeOrders = [
            {
              "order_number": 2895,
              "financial_status": "paid",
              "customer_email": "ana.rodriguez@vitahub.mx",
              "nombre_cliente": "Ana",
              "apellido_cliente": "Rodríguez",
              "created_at": {
                "value": "2025-12-28T17:33:35.000Z"
              },
              "ganancia_total": 45.8,
              "total_items": 1,
              "share_cart": "CART-A1B2",
              "productos": [
                {
                  "producto": "Extracto de Ashwagandha Optimizada 125mg de Life Extension | Ayuda a reducir el estrés y la ansiedad, contribuyendo al descanso | 60 cápsulas vegetarianas - 60 cápsulas",
                  "cantidad": 1,
                  "ganancia_producto": 45.8,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 27,
                  "product_handle": "extracto-de-ashwagandha-optimizada-125mg-de-life-extension"
                }
              ]
            },
            {
              "order_number": 2894,
              "financial_status": "paid",
              "customer_email": "carlos.mendoza@vitahub.mx",
              "nombre_cliente": "Carlos",
              "apellido_cliente": "Mendoza",
              "created_at": {
                "value": "2025-12-26T14:20:00.000Z"
              },
              "ganancia_total": 210,
              "total_items": 1,
              "share_cart": null,
              "productos": [
                {
                  "producto": "Proteína Hidrolizada de Suero Isolate Whey Protein AMZ Nutrition | Recuperación muscular | 1.6 o 2.3 kg - 2.310KG / Vainilla",
                  "cantidad": 1,
                  "ganancia_producto": 210,
                  "comision": 0.2,
                  "duracion": "70",
                  "inventario": 15,
                  "product_handle": "proteina-aislada-de-suero-isolate-whey-amz-nutrition"
                }
              ]
            },
            {
              "order_number": 2881,
              "financial_status": "paid",
              "customer_email": "sofia.garcia@vitahub.mx",
              "nombre_cliente": "Sofía",
              "apellido_cliente": "García",
              "created_at": {
                "value": "2025-12-24T10:45:00.000Z"
              },
              "ganancia_total": 360,
              "total_items": 2,
              "share_cart": "CART-C3D4",
              "productos": [
                {
                  "producto": "Creatina Monohidratada 300g AMZ Nutrition | Aumento de fuerza y masa muscular",
                  "cantidad": 1,
                  "ganancia_producto": 120,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 12,
                  "product_handle": "creatina-monohidratada-300g-amz-nutrition"
                },
                {
                  "producto": "Omega-3 1000mg 120 perlas AMZ Nutrition | Salud cardiovascular",
                  "cantidad": 1,
                  "ganancia_producto": 240,
                  "comision": 0.2,
                  "duracion": "90",
                  "inventario": 25,
                  "product_handle": "omega-3-1000mg-120-perlas-amz-nutrition"
                }
              ]
            },
            {
              "order_number": 2875,
              "financial_status": "paid",
              "customer_email": "miguel.lopez@vitahub.mx",
              "nombre_cliente": "Miguel",
              "apellido_cliente": "López",
              "created_at": {
                "value": "2025-12-22T18:54:36.000Z"
              },
              "ganancia_total": 86.5,
              "total_items": 2,
              "share_cart": "CART-E5F6",
              "productos": [
                {
                  "producto": "Citrato de Magnesio 400 mg de NOW Foods | Apoyo al Sistema Nervioso y Energía | 90 cápsulas vegetarianas",
                  "cantidad": 1,
                  "ganancia_producto": 28.4,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 42,
                  "product_handle": "citrato-de-magnesio-400-mg-de-now-foods"
                },
                {
                  "producto": "Multivitamínico Complejo B 60 tabletas AMZ Nutrition",
                  "cantidad": 1,
                  "ganancia_producto": 58.1,
                  "comision": 0.2,
                  "duracion": "60",
                  "inventario": 18,
                  "product_handle": "multivitaminico-complejo-b-60-tabletas-amz-nutrition"
                }
              ]
            },
            {
              "order_number": 2872,
              "financial_status": "paid",
              "customer_email": "laura.martinez@vitahub.mx",
              "nombre_cliente": "Laura",
              "apellido_cliente": "Martínez",
              "created_at": {
                "value": "2025-12-20T11:30:00.000Z"
              },
              "ganancia_total": 510,
              "total_items": 3,
              "share_cart": "CART-G7H8",
              "productos": [
                {
                  "producto": "Proteína Hidrolizada de Suero Isolate Whey Protein AMZ Nutrition | 2.310KG / Chocolate",
                  "cantidad": 1,
                  "ganancia_producto": 210,
                  "comision": 0.2,
                  "duracion": "70",
                  "inventario": 3,
                  "product_handle": "proteina-aislada-de-suero-isolate-whey-amz-nutrition"
                },
                {
                  "producto": "BCAA 2:1:1 300g AMZ Nutrition | Recuperación muscular",
                  "cantidad": 1,
                  "ganancia_producto": 150,
                  "comision": 0.2,
                  "duracion": "60",
                  "inventario": 15,
                  "product_handle": "bcaa-2-1-1-300g-amz-nutrition"
                },
                {
                  "producto": "Glutamina 300g AMZ Nutrition | Recuperación intestinal y muscular",
                  "cantidad": 1,
                  "ganancia_producto": 150,
                  "comision": 0.2,
                  "duracion": "50",
                  "inventario": 7,
                  "product_handle": "glutamina-300g-amz-nutrition"
                }
              ]
            },
            {
              "order_number": 2824,
              "financial_status": "paid",
              "customer_email": "javier.perez@vitahub.mx",
              "nombre_cliente": "Javier",
              "apellido_cliente": "Pérez",
              "created_at": {
                "value": "2025-12-18T15:20:00.000Z"
              },
              "ganancia_total": 420,
              "total_items": 2,
              "share_cart": null,
              "productos": [
                {
                  "producto": "Pre-entreno AMZ Nutrition | Energía y enfoque | 300g",
                  "cantidad": 1,
                  "ganancia_producto": 240,
                  "comision": 0.2,
                  "duracion": "45",
                  "inventario": 8,
                  "product_handle": "pre-entreno-amz-nutrition-300g"
                },
                {
                  "producto": "Proteína Hidrolizada de Suero Isolate Whey Protein | 1.617KG / Fresa",
                  "cantidad": 1,
                  "ganancia_producto": 180,
                  "comision": 0.2,
                  "duracion": "49",
                  "inventario": 5,
                  "product_handle": "proteina-aislada-de-suero-isolate-whey-amz-nutrition"
                }
              ]
            },
            {
              "order_number": 2641,
              "financial_status": "refunded",
              "customer_email": "patricia.gomez@vitahub.mx",
              "nombre_cliente": "Patricia",
              "apellido_cliente": "Gómez",
              "created_at": {
                "value": "2025-12-17T09:15:00.000Z"
              },
              "ganancia_total": 95.6,
              "total_items": 1,
              "share_cart": "CART-I9J0",
              "productos": [
                {
                  "producto": "Vitamina D3 5000 UI + K2 MK7 de NOW Foods | Salud ósea e inmunidad | 120 cápsulas blandas",
                  "cantidad": 1,
                  "ganancia_producto": 95.6,
                  "comision": 0.2,
                  "duracion": "120",
                  "inventario": 32,
                  "product_handle": "vitamina-d3-5000-ui-k2-mk7-de-now-foods"
                }
              ]
            },
            {
              "order_number": 2571,
              "financial_status": "paid",
              "customer_email": "raul.hernandez@vitahub.mx",
              "nombre_cliente": "Raúl",
              "apellido_cliente": "Hernández",
              "created_at": {
                "value": "2025-12-16T13:45:00.000Z"
              },
              "ganancia_total": 280,
              "total_items": 2,
              "share_cart": "CART-K1L2",
              "productos": [
                {
                  "producto": "Jarabe de Agave Orgánico Ambar 100% Natural de NBF | 500 ml",
                  "cantidad": 1,
                  "ganancia_producto": 45,
                  "comision": 0.1,
                  "duracion": "30",
                  "inventario": 22,
                  "product_handle": "jarabe-de-agave-organico-ambar-100-natural-de-nbf"
                },
                {
                  "producto": "Colágeno Hidrolizado Tipo 1 y 3 de Vital Proteins | Piel, cabello y uñas | 300g",
                  "cantidad": 1,
                  "ganancia_producto": 235,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 14,
                  "product_handle": "colageno-hidrolizado-tipo-1-3-vital-proteins"
                }
              ]
            },
            {
              "order_number": 2570,
              "financial_status": "paid",
              "customer_email": "claudia.diaz@vitahub.mx",
              "nombre_cliente": "Claudia",
              "apellido_cliente": "Díaz",
              "created_at": {
                "value": "2026-01-05T16:30:00.000Z"
              },
              "ganancia_total": 620,
              "total_items": 4,
              "share_cart": "CART-M3N4",
              "productos": [
                {
                  "producto": "Proteína de Chícharo AMZ Nutrition | Opción vegana | 1.5KG / Natural",
                  "cantidad": 1,
                  "ganancia_producto": 180,
                  "comision": 0.2,
                  "duracion": "60",
                  "inventario": 9,
                  "product_handle": "proteina-de-chicharo-amz-nutrition"
                },
                {
                  "producto": "Ashwagandha 500mg | 60 cápsulas",
                  "cantidad": 1,
                  "ganancia_producto": 65,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 21,
                  "product_handle": "ashwagandha-500mg-60-capsulas"
                },
                {
                  "producto": "Magnesio L-Threonate | Soporte cognitivo | 90 cápsulas",
                  "cantidad": 1,
                  "ganancia_producto": 195,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 17,
                  "product_handle": "magnesio-l-threonate-soporte-cognitivo"
                },
                {
                  "producto": "Probiótico 50 Billones UFC | Salud intestinal | 30 cápsulas",
                  "cantidad": 1,
                  "ganancia_producto": 180,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 11,
                  "product_handle": "probiotico-50-billones-ufc"
                }
              ]
            },
            {
              "order_number": 2500,
              "financial_status": "paid",
              "customer_email": "fernando.castro@vitahub.mx",
              "nombre_cliente": "Fernando",
              "apellido_cliente": "Castro",
              "created_at": {
                "value": "2026-01-10T10:00:00.000Z"
              },
              "ganancia_total": 320,
              "total_items": 2,
              "share_cart": null,
              "productos": [
                {
                  "producto": "Testo Booster AMZ Nutrition | Soporte hormonal natural | 90 cápsulas",
                  "cantidad": 1,
                  "ganancia_producto": 165,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 6,
                  "product_handle": "testo-booster-amz-nutrition"
                },
                {
                  "producto": "Termogénico Quema Grasa | Extracto de Té Verde | 120 cápsulas",
                  "cantidad": 1,
                  "ganancia_producto": 155,
                  "comision": 0.2,
                  "duracion": "30",
                  "inventario": 13,
                  "product_handle": "termogenico-quema-grasa-te-verde"
                }
              ]
            }
          ];
          
      console.log('✅ Datos fake cargados directamente:', fakeOrders.length, 'órdenes');
      
      // Si quieres filtros de fecha, puedes agregarlos aquí
      let filteredOrders = fakeOrders;
      if (from && to) {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        
        filteredOrders = fakeOrders.filter(order => {
          const orderDate = new Date(order.created_at.value || order.created_at);
          return orderDate >= fromDate && orderDate <= toDate;
        });
      }
      
      // Ordenar
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