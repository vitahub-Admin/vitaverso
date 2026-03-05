import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status');
    const limit = Number(searchParams.get('limit') ?? 50);
    const exportType = searchParams.get('export'); // csv

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
        affiliates (
          first_name,
          last_name,
          email,
          phone,
          clabe_interbancaria
        )
      `);

    if (!exportType) {
      query = query.limit(limit);
    }

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

    // MODO CSV
    if (exportType === 'csv') {
      const rows = data.map((ex) => ({
        id: ex.id,
        full_name: `${ex.affiliates?.first_name ?? ''} ${ex.affiliates?.last_name ?? ''}`,
        email: ex.affiliates?.email ?? '',
        phone: ex.affiliates?.phone ?? '',
        clabe: ex.affiliates?.clabe_interbancaria ?? '',
        points_requested: ex.points_requested,
        exchange_type: ex.exchange_type,
        status: ex.status,
        requested_at: ex.requested_at,
        processed_at: ex.processed_at ?? '',
        admin_note: ex.admin_note ?? '',
      }));

      const headers = Object.keys(rows[0] || {}).join(',');
      const csv = [
        headers,
        ...rows.map((row) =>
          Object.values(row)
            .map((val) => `"${String(val).replace(/"/g, '""')}"`)
            .join(',')
        ),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="exchanges.csv"',
        },
      });
    }

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