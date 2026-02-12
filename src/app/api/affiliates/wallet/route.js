import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET() {
  try {
    const cookieStore = await cookies();

    const customerId = cookieStore.get('customerId')?.value;

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'No hay sesión activa' },
        { status: 401 }
      );
    }

    const customerIdNum = Number(customerId);

    if (Number.isNaN(customerIdNum)) {
      return NextResponse.json(
        { success: false, message: 'CustomerId inválido' },
        { status: 400 }
      );
    }

    /**
     * 1️⃣ Traemos SOLO confirmadas
     */
    const { data: transactions, error } = await supabase
      .from('point_transactions')
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

    /**
     * 2️⃣ Calculamos saldo
     */
    let totalIn = 0;
    let totalOut = 0;

    for (const tx of transactions || []) {
      const amount = Number(tx.points);

      if (tx.direction === 'IN') totalIn += amount;
      if (tx.direction === 'OUT') totalOut += amount;
    }

    const availableBalance = totalIn - totalOut;

    /**
     * 3️⃣ Transformamos para frontend
     */
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

    /**
     * 4️⃣ Response
     */
    return NextResponse.json({
      success: true,
      wallet: {
        available: availableBalance,
        total_earned: totalIn,
        total_withdrawn: totalOut,
        currency: 'MXN',
      },
      transactions: formattedTransactions,
      meta: {
        transaction_count: transactions?.length || 0,
        last_transaction_at: transactions?.[0]?.processed_at || null,
      },
    });
  } catch (err) {
    console.error('❌ Error GET /api/affiliate/wallet:', err);

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
