import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  // ← Esta es la correcta
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    if (!q || q.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Mínimo 2 caracteres para búsqueda' },
        { status: 400 }
      );
    }
    
    // Búsqueda inteligente
    let query = supabase
      .from('affiliates')
      .select('id, email, first_name, last_name, phone, profession, status')
      .or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .limit(limit);
    
    // Si parece un número, buscar también por IDs
    if (!isNaN(q)) {
      const numQ = Number(q);
      query = query.or(`shopify_customer_id.eq.${numQ},shopify_collection_id.eq.${numQ}`);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data,
      count: data.length
    });
    
  } catch (error) {
    console.error('❌ GET /admin/affiliates/search error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
