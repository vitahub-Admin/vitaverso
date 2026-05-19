import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyCustomerToken, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);

  const { data: transactions, error } = await supabase
    .from('point_transactions_live')
    .select('id, points, direction, category, description, reference_id, reference_type, processed_at, metadata')
    .eq('customer_id', shopifyCustomerId)
    .eq('status', 'confirmed')
    .order('processed_at', { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let totalIn = 0;
  let totalOut = 0;
  for (const tx of transactions || []) {
    const amount = Number(tx.points);
    if (tx.direction === 'IN') totalIn += amount;
    if (tx.direction === 'OUT') totalOut += amount;
  }

  const formatted = (transactions || []).slice(0, 30).map((tx) => ({
    id: tx.id,
    amount: Number(tx.points),
    type: tx.direction === 'IN' ? 'earning' : 'withdrawal',
    category: tx.category,
    description: tx.description,
    processed_at: tx.processed_at,
  }));

  return NextResponse.json({
    ok: true,
    wallet: {
      available: totalIn - totalOut,
      total_earned: totalIn,
      total_withdrawn: totalOut,
    },
    transactions: formatted,
    _debug: {
      customer_id_used: shopifyCustomerId,
      raw_user_id: decoded.userId,
      tx_count_found: (transactions || []).length,
    },
  });
}
