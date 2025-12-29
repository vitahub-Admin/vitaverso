
import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  // ← Esta es la correcta
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    
    // ========== PARÁMETROS DE ENTRADA ==========
    // Paginación
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    // Filtros básicos
    const status = searchParams.get('status');
    const profession = searchParams.get('profession');
    
    // Búsqueda de texto (reemplaza endpoint /search)
    const search = searchParams.get('search');
    const searchField = searchParams.get('searchField') || 'all'; // 'all', 'email', 'name', 'phone'
    
    // Ordenamiento
    const orderBy = searchParams.get('orderBy') || 'created_at';
    const order = searchParams.get('order') || 'desc';
    
    // Filtros de fecha (para dashboard)
    const createdAfter = searchParams.get('createdAfter');
    const createdBefore = searchParams.get('createdBefore');
    
    // ========== CONSTRUIR QUERY ==========
    let query = supabase
      .from('affiliates')
      .select('*', { count: 'exact' });
    
    // FILTROS SIMPLES
    if (status) query = query.eq('status', status);
    if (profession) query = query.eq('profession', profession);
    
    // BÚSQUEDA DE TEXTO (INTELIGENTE)
    if (search && search.trim().length >= 2) {
      const searchTerm = `%${search.trim()}%`;
      
      if (searchField === 'email') {
        query = query.ilike('email', searchTerm);
      } 
      else if (searchField === 'name') {
        query = query.or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm}`);
      }
      else if (searchField === 'phone') {
        query = query.ilike('phone', searchTerm);
      }
      else {
        // Búsqueda en TODOS los campos relevantes
        query = query.or(`
          email.ilike.${searchTerm},
          first_name.ilike.${searchTerm},
          last_name.ilike.${searchTerm},
          phone.ilike.${searchTerm},
          referral_id.ilike.${searchTerm}
        `);
        
        // Si es un número, buscar también en IDs
        if (!isNaN(search)) {
          const numSearch = Number(search);
          query = query.or(`
            shopify_customer_id.eq.${numSearch},
            shopify_collection_id.eq.${numSearch}
          `);
        }
      }
    }
    
    // FILTROS DE FECHA
    if (createdAfter) {
      query = query.gte('created_at', createdAfter);
    }
    if (createdBefore) {
      query = query.lte('created_at', createdBefore);
    }
    
    // ========== EJECUTAR CON PAGINACIÓN ==========
    const { data, error, count } = await query
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    
    // ========== RESPUESTA ENRIQUECIDA ==========
    return NextResponse.json({
      success: true,
      data,
      meta: {
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
          hasNextPage: offset + limit < count,
          hasPrevPage: page > 1
        },
        filters: {
          status,
          profession,
          search: search || null,
          searchField,
          orderBy,
          order,
          dateRange: {
            createdAfter,
            createdBefore
          }
        }
      }
    });
    
  } catch (error) {
    console.error('❌ GET /admin/affiliates error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        details: error.details 
      },
      { status: 500 }
    );
  }
}