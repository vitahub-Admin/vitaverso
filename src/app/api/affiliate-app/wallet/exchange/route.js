import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyCustomerToken, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const ALLOWED_TYPES = ['cash', 'discount', 'store_credit'];
const MIN_WITHDRAW = 20;

export async function GET(req) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);

  const { data, error } = await supabase
    .from('point_exchanges')
    .select('id, points_requested, exchange_type, status, affiliate_note, admin_note, requested_at, processed_at')
    .eq('customer_id', shopifyCustomerId)
    .order('requested_at', { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, exchanges: data || [] });
}

export async function POST(req) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);
  const { points_requested, exchange_type, affiliate_note } = await req.json();

  const amount = Number(points_requested);

  if (!amount || amount <= 0) {
    return NextResponse.json({ ok: false, error: 'Monto inválido' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(exchange_type)) {
    return NextResponse.json({ ok: false, error: 'Tipo de retiro inválido' }, { status: 400 });
  }
  if (amount < MIN_WITHDRAW) {
    return NextResponse.json({ ok: false, error: `El mínimo es ${MIN_WITHDRAW} puntos` }, { status: 400 });
  }

  // Verificar que no haya un exchange pendiente
  const { data: pending } = await supabase
    .from('point_exchanges')
    .select('id')
    .eq('customer_id', shopifyCustomerId)
    .eq('status', 'pending')
    .limit(1);

  if (pending?.length > 0) {
    return NextResponse.json({ ok: false, error: 'Ya tenés una solicitud pendiente' }, { status: 400 });
  }

  // Calcular saldo disponible
  const { data: txs } = await supabase
    .from('point_transactions_live')
    .select('points, direction')
    .eq('customer_id', shopifyCustomerId)
    .eq('status', 'confirmed');

  let totalIn = 0;
  let totalOut = 0;
  for (const tx of txs || []) {
    const val = Number(tx.points);
    if (tx.direction === 'IN') totalIn += val;
    if (tx.direction === 'OUT') totalOut += val;
  }

  if (amount > totalIn - totalOut) {
    return NextResponse.json({ ok: false, error: 'Saldo insuficiente' }, { status: 400 });
  }

  const { data: exchange, error } = await supabase
    .from('point_exchanges')
    .insert([{
      customer_id: shopifyCustomerId,
      points_requested: amount,
      exchange_type,
      status: 'pending',
      affiliate_note: affiliate_note || null,
      metadata: { source: 'affiliate_app', request_type: exchange_type },
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, exchange }, { status: 201 });
}
