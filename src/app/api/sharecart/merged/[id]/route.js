// app/api/carts/merged/[id]/route.js
import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { supabase } from '@/lib/supabase';

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
        share_cart as share_cart_code,
        customer_id
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
    // 2. Consultar Supabase (datos nuevos)
    // ============================================
    // Primero obtenemos los sharecarts
    const { data: supabaseRows, error: supabaseError } = await supabase
      .from("sharecarts")
      .select("*")
      .eq("owner_id", customerId.toString())
      .order("created_at", { ascending: false });

    if (supabaseError) {
      console.error("Error en Supabase sharecarts:", supabaseError);
    }

    // Obtenemos los tokens de todos los sharecarts de Supabase
    const supabaseTokens = supabaseRows?.map(cart => cart.token) || [];

    // Consultamos órdenes en Supabase que están asociadas a estos sharecarts
    let supabaseOrders = [];
    if (supabaseTokens.length > 0) {
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders") // Ajusta el nombre de la tabla según tu esquema
        .select("*, order_items(*)") // Incluye items si es necesario
        .in("sharecart_token", supabaseTokens)
        .in("status", ["completed", "paid", "fulfilled", "processing"]); // Estados que consideras "venta asignada"
      
      if (ordersError) {
        console.error("Error en Supabase orders:", ordersError);
      } else {
        supabaseOrders = ordersData || [];
      }
    }

    // Creamos un mapa de órdenes por sharecart token para acceso rápido
    const supabaseOrderMap = {};
    supabaseOrders.forEach(order => {
      if (order.sharecart_token) {
        supabaseOrderMap[order.sharecart_token] = order;
      }
    });

    // ============================================
    // 3. Combinar y enriquecer datos
    // ============================================
    const mergedCarts = [];

    // Procesar carritos de BigQuery (históricos)
    bigQueryRows.forEach(cart => {
      const associatedOrder = supabaseOrderMap[cart.code];
      const hasSales = cart.order_number || associatedOrder ? true : false;
      
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
        // Status: priorizar órdenes de Supabase si existen
        status: associatedOrder ? 'Completed' : cart.status,
        order_number: associatedOrder?.order_number || cart.order_number,
        has_sales: hasSales,
        platform: 'legacy',
        // Datos de orden de Supabase si existe
        supabase_order: associatedOrder || null,
        // Datos del sharecart de Supabase si existe
        supabase_cart_data: supabaseRows?.find(s => s.token === cart.code) || null
      });
    });

    // Procesar carritos de Supabase que no están en BigQuery
    supabaseRows?.forEach(cart => {
      // Verificar si ya existe en BigQuery data
      const existsInBigQuery = bigQueryRows.some(b => b.code === cart.token);
      
      if (!existsInBigQuery) {
        const associatedOrder = supabaseOrderMap[cart.token];
        const hasSales = associatedOrder ? true : false;
        
        mergedCarts.push({
          source: 'supabase',
          id: cart.token,
          token: cart.token,
          created_at: cart.created_at,
          full_created_at: cart.created_at,
          client_name: cart.name || cart.client_name,
          phone: cart.phone,
          email: cart.email,
          items_count: cart.items?.length || 0,
          items_value: this.calculateCartValue(cart.items), // Necesitarás implementar esta función
          // Determinar status basado en órdenes asociadas
          status: associatedOrder ? 'Completed' : 'Pending',
          order_number: associatedOrder?.order_number || null,
          has_sales: hasSales,
          platform: 'new',
          items: cart.items,
          extra: cart.extra,
          location: cart.location,
          opens_count: cart.opens_count || 0,
          // Guardar referencia completa a la orden si existe
          order_data: associatedOrder || null
        });
      }
    });

    // Ordenar por fecha (más reciente primero)
    mergedCarts.sort((a, b) => 
      new Date(b.full_created_at) - new Date(a.full_created_at)
    );

    // ============================================
    // 4. Calcular métricas consolidadas
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
      
      // Nuevas métricas para tracking de ventas
      carts_with_sales: mergedCarts.filter(c => c.has_sales).length,
      supabase_carts_with_sales: mergedCarts.filter(c => 
        c.source === 'supabase' && c.has_sales
      ).length,
      bigquery_carts_with_sales: mergedCarts.filter(c => 
        c.source === 'bigquery' && c.has_sales
      ).length,
      cross_platform_carts: mergedCarts.filter(c => 
        c.supabase_order && c.source === 'bigquery'
      ).length, // Carritos que existen en ambos sistemas con venta
      
      // Métricas por plataforma
      sales_by_platform: {
        legacy: mergedCarts.filter(c => c.platform === 'legacy' && c.has_sales).length,
        new: mergedCarts.filter(c => c.platform === 'new' && c.has_sales).length
      }
    };

    return NextResponse.json({ 
      success: true, 
      data: mergedCarts,
      metrics,
      meta: {
        customerId,
        count: mergedCarts.length,
        dateRange: { from, to },
        order_stats: {
          supabase_orders_found: supabaseOrders.length,
          bigquery_orders_found: bigQueryRows.filter(r => r.order_number).length
        }
      }
    });

  } catch (error) {
    console.error('Error fusionando carritos:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
}

// Función auxiliar para calcular el valor del carrito en Supabase
function calculateCartValue(items) {
  if (!items || !Array.isArray(items)) return 0;
  
  return items.reduce((total, item) => {
    const price = parseFloat(item.price) || 0;
    const quantity = parseInt(item.quantity) || 1;
    return total + (price * quantity);
  }, 0);
}