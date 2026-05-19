import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const ALLOWED_TYPES = ['cash', 'discount', 'store_credit'];
const MIN_WITHDRAW = 20;

export async function GET(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const { data, error } = await supabase
      .from('point_exchanges')
      .select(`
        id,
        points_requested,
        exchange_type,
        status,
        target_value,
        target_currency,
        target_reference,
        requested_at,
        processed_at,
        admin_note,
        affiliate_note,
        created_at
      `)
      .eq('customer_id', customerIdNum)
      .order('requested_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, ok: true, exchanges: data || [], meta: { count: data?.length ?? 0 } });
  } catch (err) {
    console.error('❌ Error GET /api/affiliates/wallet/exchange:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const body = await req.json();
    const { points_requested, exchange_type, affiliate_note } = body;

    const amount = Number(points_requested);

    if (!amount || amount <= 0) return NextResponse.json({ success: false, message: 'Monto inválido' }, { status: 400 });
    if (!ALLOWED_TYPES.includes(exchange_type)) return NextResponse.json({ success: false, message: 'Tipo de retiro inválido' }, { status: 400 });
    if (amount < MIN_WITHDRAW) return NextResponse.json({ success: false, message: `El mínimo es ${MIN_WITHDRAW}` }, { status: 400 });

    const { data: pending } = await supabase
      .from('point_exchanges')
      .select('id')
      .eq('customer_id', customerIdNum)
      .eq('status', 'pending')
      .limit(1);

    if (pending?.length > 0) return NextResponse.json({ success: false, message: 'Ya tenés una solicitud pendiente' }, { status: 400 });

    const { data: transactions } = await supabase
      .from('point_transactions_live')
      .select('points, direction')
      .eq('customer_id', customerIdNum)
      .eq('status', 'confirmed');

    let totalIn = 0;
    let totalOut = 0;
    for (const tx of transactions || []) {
      const val = Number(tx.points);
      if (tx.direction === 'IN') totalIn += val;
      if (tx.direction === 'OUT') totalOut += val;
    }

    if (amount > totalIn - totalOut) return NextResponse.json({ success: false, message: 'Saldo insuficiente' }, { status: 400 });

    const { data: exchange, error } = await supabase
      .from('point_exchanges')
      .insert([{
        customer_id: customerIdNum,
        points_requested: amount,
        exchange_type,
        status: 'pending',
        affiliate_note: affiliate_note || null,
        metadata: { source: 'affiliate_app', request_type: exchange_type },
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, ok: true, message: 'Solicitud enviada correctamente', exchange }, { status: 201 });
  } catch (err) {
    console.error('❌ Error POST exchange:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
