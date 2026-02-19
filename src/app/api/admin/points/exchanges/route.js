import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status'); // pending | history | approved | rejected
    const limit = Number(searchParams.get('limit') ?? 50);

    let query = supabase
      .from('point_exchanges')
      .select(`
        id,
        customer_id,
        points_requested,
        exchange_type,
        status,
        requested_at,
        processed_at,
        admin_note,
        affiliate_note,
        affiliate:affiliates (
  first_name,
  last_name
)
      `)
      .limit(limit);

    if (status === 'history') {
      query = query
        .in('status', ['approved', 'rejected'])
        .order('processed_at', { ascending: false });
    } else if (status) {
      query = query
        .eq('status', status)
        .order('requested_at', { ascending: false });
    } else {
      query = query.order('requested_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      exchanges: data || [],
    });

  } catch (err) {
    console.error('❌ Admin GET exchanges:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
