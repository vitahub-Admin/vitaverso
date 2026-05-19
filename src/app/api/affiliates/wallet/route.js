import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);

    if (!customerIdNum || Number.isNaN(customerIdNum)) {
      return unauthorized();
    }

    const { data: transactions, error } = await supabase
      .from('point_transactions_live')
      .select(`
        id,
        points,
        direction,
        category,
        description,
        reference_id,
        reference_type,
        processed_at,
        metadata
      `)
      .eq('customer_id', customerIdNum)
      .eq('status', 'confirmed')
      .order('processed_at', { ascending: false });

    if (error) throw error;

    let totalIn = 0;
    let totalOut = 0;

    for (const tx of transactions || []) {
      const amount = Number(tx.points);
      if (tx.direction === 'IN') totalIn += amount;
      if (tx.direction === 'OUT') totalOut += amount;
    }

    const formattedTransactions = (transactions || [])
      .slice(0, 20)
      .map((tx) => ({
        id: tx.id,
        amount: Number(tx.points),
        type: tx.direction === 'IN' ? 'earning' : 'withdrawal',
        category: tx.category,
        description: tx.description,
        reference_id: tx.reference_id,
        reference_type: tx.reference_type,
        processed_at: tx.processed_at,
      }));

    return NextResponse.json({
      success: true,
      ok: true,
      wallet: {
        available: totalIn - totalOut,
        total_earned: totalIn,
        total_withdrawn: totalOut,
        currency: 'MXN',
      },
      transactions: formattedTransactions,
      meta: {
        transaction_count: transactions?.length || 0,
        last_transaction_at: transactions?.[0]?.processed_at || null,
      },
      _debug: { customer_id_used: customerIdNum },
    });
  } catch (err) {
    console.error('❌ Error GET /api/affiliates/wallet:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
