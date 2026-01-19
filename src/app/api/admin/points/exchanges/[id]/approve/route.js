import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req, { params }) {
  try {
    const exchangeId = Number(params.id);
    if (Number.isNaN(exchangeId)) {
      return NextResponse.json(
        { success: false, message: 'ID inválido' },
        { status: 400 }
      );
    }

    /**
     * 1. Traemos exchange
     */
    const { data: exchange, error } = await supabase
      .from('point_exchanges')
      .select('*')
      .eq('id', exchangeId)
      .single();

    if (error || !exchange) {
      return NextResponse.json(
        { success: false, message: 'Exchange no encontrado' },
        { status: 404 }
      );
    }

    if (exchange.status !== 'pending') {
      return NextResponse.json(
        { success: false, message: 'Exchange ya procesado' },
        { status: 400 }
      );
    }

    /**
     * 2. Calculamos saldo real
     */
    const { data: txs, error: txErr } = await supabase
      .from('point_transactions')
      .select('points')
      .eq('customer_id', exchange.customer_id)
      .eq('status', 'confirmed');

    if (txErr) throw txErr;

    const available = txs.reduce(
      (sum, t) => sum + Number(t.points),
      0
    );

    if (available < exchange.points_requested) {
      /**
       * ❌ Saldo insuficiente → REJECT
       */
      await supabase
        .from('point_exchanges')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
          processed_by_type: 'system',
          admin_note: 'Saldo insuficiente al momento de aprobar',
        })
        .eq('id', exchangeId);

      return NextResponse.json({
        success: false,
        message: 'Saldo insuficiente, exchange rechazado',
      });
    }

    /**
     * 3. Creamos OUT transaction
     */
    const { error: txCreateError } = await supabase
      .from('point_transactions')
      .insert([
        {
          customer_id: exchange.customer_id,
          points: -exchange.points_requested,
          direction: 'OUT',
          category: 'exchange',
          status: 'confirmed',
          reference_id: exchange.id,
          reference_type: 'point_exchange',
          description: `Canje aprobado (${exchange.exchange_type})`,
          actor_type: 'admin',
        },
      ]);

    if (txCreateError) throw txCreateError;

    /**
     * 4. Marcamos exchange como aprobado
     */
    const { error: updateError } = await supabase
      .from('point_exchanges')
      .update({
        status: 'approved',
        processed_at: new Date().toISOString(),
        processed_by_type: 'admin',
      })
      .eq('id', exchangeId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: 'Exchange aprobado correctamente',
    });

  } catch (err) {
    console.error('❌ Admin approve exchange:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
