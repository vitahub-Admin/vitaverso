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
    // 2. Consultar Supabase (datos nuevos)
    // ============================================
    const { data: supabaseRows, error } = await supabase
      .from("sharecarts")
      .select("*")
      .eq("owner_id", customerId.toString()) // Supabase usa string
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error en Supabase:", error);
    }

    // ============================================
    // 3. Combinar y enriquecer datos
    // ============================================
    const mergedCarts = [];

    // Procesar carritos de BigQuery
    bigQueryRows.forEach(cart => {
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
        status: cart.status,
        order_number: cart.order_number,
        platform: 'legacy',
        // Buscar match en Supabase por token
        supabase_data: supabaseRows?.find(s => s.token === cart.code) || null
      });
    });

    // Procesar carritos de Supabase que no están en BigQuery
    supabaseRows?.forEach(cart => {
      // Verificar si ya existe en BigQuery data
      const existsInBigQuery = bigQueryRows.some(b => b.code === cart.token);
      
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
          status: 'pending', // Por defecto
          platform: 'new',
          items: cart.items, // Items detallados
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
      total_opens: mergedCarts.reduce((sum, c) => sum + (c.opens_count || 0), 0)
    };

    return NextResponse.json({ 
      success: true, 
      data: mergedCarts,
      metrics,
      meta: {
        customerId,
        count: mergedCarts.length,
        dateRange: { from, to }
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