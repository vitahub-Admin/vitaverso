// app/api/carts/merged/[id]/route.js
import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { supabase } from '@/lib/supabase';

// Función auxiliar para calcular valor de items en Supabase
function calculateItemsValue(items) {
  if (!items || !Array.isArray(items)) return 0;
  
  return items.reduce((total, item) => {
    const price = parseFloat(item.price) || 0;
    const quantity = parseInt(item.quantity) || 1;
    return total + (price * quantity);
  }, 0);
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const customerId = id ? parseInt(id, 10) : null;

    if (!customerId || isNaN(customerId)) {
      return NextResponse.json(
        { success: false, message: `CustomerId inválido: ${id}` },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    console.log(`Fusionando carritos para customer: ${customerId}`);

    // ============================================
    // 1. Consultar BigQuery (datos históricos)
    // ============================================
    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    let bigQueryQuery = `
      SELECT  
        EXTRACT(DATE FROM sh.created_at) AS created_at,
        sh.created_at as full_created_at,
        code,
        email,
        note AS client_name,
        opens_count,
        items_count,
        items_value / 100 AS items_value,
        CASE
          WHEN order_number IS NOT NULL THEN "Completed"
          ELSE "Pending"
        END AS status,
        order_number,
        share_cart as share_cart_code
      FROM vitahub-435120.sharecart.carritos sh
      LEFT JOIN vitahub-435120.Shopify.customers c ON c.id = sh.customer_id
      LEFT JOIN vitahub-435120.silver.orders o ON sh.code = o.share_cart
      WHERE sh.customer_id = @customerId
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY code 
        ORDER BY EXTRACT(DATE FROM sh.created_at) DESC
      ) = 1
    `;

    if (from && to) {
      bigQueryQuery += ` AND DATE(sh.created_at) BETWEEN @from AND @to`;
    }

    const bigQueryOptions = {
      query: bigQueryQuery,
      location: 'us-east1',
      params: {
        customerId,
        ...(from && to ? { from, to } : {}),
      },
    };

    const [bigQueryRows] = await bigquery.query(bigQueryOptions);

    // ============================================
    // 2. Consultar TODAS las órdenes de este cliente
    // Solo para saber qué share_carts tienen ventas
    // ============================================
    // Opción 1: Si specialist_ref existe
    let ordersQuery = `
      SELECT DISTINCT share_cart
      FROM vitahub-435120.silver.orders
      WHERE specialist_ref = @customerId
      AND share_cart IS NOT NULL
      AND share_cart != ''
    `;

    // Opción 2: Si specialist_ref no funciona, usar otra relación
    // ordersQuery = `
    //   SELECT DISTINCT o.share_cart
    //   FROM vitahub-435120.silver.orders o
    //   JOIN vitahub-435120.sharecart.carritos sc ON o.share_cart = sc.code
    //   WHERE sc.customer_id = @customerId
    //   AND o.share_cart IS NOT NULL
    //   AND o.share_cart != ''
    // `;

    const ordersOptions = {
      query: ordersQuery,
      location: 'us-east1',
      params: { customerId },
    };

    let shareCartsWithOrders = new Set(); // Usamos Set para evitar duplicados
    
    try {
      const [ordersResult] = await bigquery.query(ordersOptions);
      // Crear un Set con todos los share_carts que tienen órdenes
      ordersResult.forEach(order => {
        if (order.share_cart) {
          shareCartsWithOrders.add(order.share_cart);
        }
      });
      console.log(`Sharecarts con ventas encontrados: ${shareCartsWithOrders.size}`);
    } catch (ordersError) {
      console.log('Error consultando órdenes, continuando sin esa info:', ordersError.message);
      // Continuamos sin la info de órdenes
    }

    // ============================================
    // 3. Consultar Supabase (datos nuevos)
    // ============================================
    const { data: supabaseRows, error } = await supabase
      .from("sharecarts")
      .select("*")
      .eq("owner_id", customerId.toString())
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error en Supabase:", error);
    }

    // ============================================
    // 4. Combinar y enriquecer datos
    // ============================================
    const mergedCarts = [];

    // Procesar carritos de BigQuery
    bigQueryRows.forEach(cart => {
      const hasSale = shareCartsWithOrders.has(cart.code) || !!cart.order_number;
      
      mergedCarts.push({
        source: 'bigquery',
        id: cart.code,
        token: cart.code,
        created_at: cart.created_at,
        full_created_at: cart.full_created_at,
        client_name: cart.client_name,
        email: cart.email,
        opens_count: cart.opens_count,
        items_count: cart.items_count,
        items_value: cart.items_value,
        status: hasSale ? 'Completed' : 'Pending',
        order_number: cart.order_number,
        has_sale: hasSale,
        platform: 'legacy',
        supabase_data: supabaseRows?.find(s => s.token === cart.code) || null
      });
    });

    // Procesar carritos de Supabase que no están en BigQuery
    supabaseRows?.forEach(cart => {
      // Verificar si ya existe en BigQuery data
      const existsInBigQuery = bigQueryRows.some(b => b.code === cart.token);
      
      // Verificar si este carrito de Supabase tiene venta en BigQuery
      const hasSale = shareCartsWithOrders.has(cart.token);
      
      if (!existsInBigQuery) {
        mergedCarts.push({
          source: 'supabase',
          id: cart.token,
          token: cart.token,
          created_at: cart.created_at,
          full_created_at: cart.created_at,
          client_name: cart.name,
          phone: cart.phone,
          items_count: cart.items?.length || 0,
          items_value: calculateItemsValue(cart.items),
          status: hasSale ? 'Completed' : 'pending',
          order_number: hasSale ? 'VENTA_DETECTADA' : null, // Placeholder si queremos
          has_sale: hasSale,
          platform: 'new',
          items: cart.items,
          extra: cart.extra,
          location: cart.location
        });
      }
    });

    // Ordenar por fecha (más reciente primero)
    mergedCarts.sort((a, b) => 
      new Date(b.full_created_at) - new Date(a.full_created_at)
    );

    // ============================================
    // 5. Calcular métricas consolidadas
    // ============================================
    const metrics = {
      total_carts: mergedCarts.length,
      bigquery_carts: bigQueryRows.length,
      supabase_carts: supabaseRows?.length || 0,
      completed_carts: mergedCarts.filter(c => c.status === 'Completed').length,
      pending_carts: mergedCarts.filter(c => c.status === 'Pending' || c.status === 'pending').length,
      total_items: mergedCarts.reduce((sum, c) => sum + (c.items_count || 0), 0),
      total_value: mergedCarts.reduce((sum, c) => sum + (c.items_value || 0), 0),
      total_opens: mergedCarts.reduce((sum, c) => sum + (c.opens_count || 0), 0),
      
      // Métricas de ventas
      carts_with_sales: mergedCarts.filter(c => c.has_sale).length,
      supabase_carts_with_sales: mergedCarts.filter(c => 
        c.source === 'supabase' && c.has_sale
      ).length,
      bigquery_carts_with_sales: mergedCarts.filter(c => 
        c.source === 'bigquery' && c.has_sale
      ).length,
      conversion_rate: mergedCarts.length > 0 ? 
        ((mergedCarts.filter(c => c.has_sale).length / mergedCarts.length) * 100).toFixed(2) + '%' : '0%'
    };

    return NextResponse.json({ 
      success: true, 
      data: mergedCarts,
      metrics,
      meta: {
        customerId,
        count: mergedCarts.length,
        dateRange: { from, to },
        summary: {
          sharecarts_with_orders_count: shareCartsWithOrders.size,
          sharecarts_with_orders_sample: Array.from(shareCartsWithOrders).slice(0, 10) // Solo muestra primeros 10 para debug
        }
      }
    });

  } catch (error) {
    console.error('Error fusionando carritos:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message
    }, { status: 500 });
  }
}