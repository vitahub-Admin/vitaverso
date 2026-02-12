import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * GET
 * Lista exchanges del afiliado
 */
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

    return NextResponse.json({
      success: true,
      exchanges: data || [],
      meta: {
        count: data?.length ?? 0,
      },
    });

  } catch (err) {
    console.error('❌ Error GET /api/affiliate/points/exchange:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
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

    const body = await req.json();
    const { points_requested, affiliate_note } = body;

    const amount = Number(points_requested);

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, message: 'Monto inválido' },
        { status: 400 }
      );
    }

    const MIN_WITHDRAW = 200; // Ajustable

    if (amount < MIN_WITHDRAW) {
      return NextResponse.json(
        { success: false, message: `El retiro mínimo es ${MIN_WITHDRAW}` },
        { status: 400 }
      );
    }

    /**
     * 1️⃣ Calcular saldo disponible REAL
     */
    const { data: transactions } = await supabase
      .from('point_transactions')
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

    const availableBalance = totalIn - totalOut;

    if (amount > availableBalance) {
      return NextResponse.json(
        { success: false, message: 'Saldo insuficiente' },
        { status: 400 }
      );
    }

    /**
     * 2️⃣ Crear exchange PENDING
     */
    const { data: exchange, error } = await supabase
      .from('point_exchanges')
      .insert([
        {
          customer_id: customerIdNum,
          points_requested: amount,
          exchange_type: 'cash',
          status: 'pending',
          affiliate_note: affiliate_note || null,
          metadata: {
            source: 'affiliate_wallet',
          },
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Solicitud enviada correctamente',
      exchange,
    });

  } catch (err) {
    console.error('❌ Error POST exchange:', err);

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
