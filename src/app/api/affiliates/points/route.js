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
     * 1. Traemos transacciones CONFIRMADAS
     */
    const { data: transactions, error } = await supabase
      .from('point_transactions')
      .select(`
        id,
        points,
        direction,
        category,
        status,
        description,
        processed_at,
        created_at
      `)
      .eq('customer_id', customerIdNum)
      .eq('status', 'confirmed')
      .order('processed_at', { ascending: false });

    if (error) throw error;

    /**
     * 2. Calculamos saldo disponible
     */
    let totalIn = 0;
    let totalOut = 0;

    for (const tx of transactions) {
      if (tx.direction === 'IN') totalIn += Number(tx.points);
      if (tx.direction === 'OUT') totalOut += Number(tx.points);
    }

    const availablePoints = totalIn - totalOut;

    /**
     * 3. Response
     */
    return NextResponse.json({
      success: true,
      balance: {
        available: availablePoints,
        total_earned: totalIn,
        total_spent: totalOut,
      },
      transactions: transactions.slice(0, 20),
      meta: {
        transaction_count: transactions.length,
        last_transaction_at: transactions[0]?.processed_at ?? null,
        conversion_rate: 0.1, // 10 pts = $1 MXN
        currency: 'MXN',
      },
    });

  } catch (err) {
    console.error('❌ Error GET /api/affiliate/points:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
