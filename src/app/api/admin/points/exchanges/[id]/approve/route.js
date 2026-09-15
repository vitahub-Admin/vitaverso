import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sendPushToAffiliate } from '@/lib/affiliateNotifications';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req, context) {
  try {
    const { id } = await context.params;

    const exchangeId = Number(id);
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
      .from('point_transactions_live')
      .select('points, direction')
      .eq('customer_id', exchange.customer_id)
      .eq('status', 'confirmed');

    if (txErr) throw txErr;

    let totalIn = 0;
let totalOut = 0;

for (const tx of txs || []) {
  const val = Number(tx.points);

  if (tx.direction === 'IN') totalIn += val;
  if (tx.direction === 'OUT') totalOut += val;
}

const available = totalIn - totalOut;

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
     * 3. Creamos OUT transaction + bonus si es store_credit
     */
    const { error: txCreateError } = await supabase
      .from('point_transactions_live')
      .insert([
        {
          customer_id: exchange.customer_id,
          points: exchange.points_requested,
          direction: 'OUT',
          category: 'exchange',
          status: 'confirmed',
          reference_id: String(exchange.id),
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

    // Aviso solo para retiros a CLABE: los créditos en tienda se generan solos y
    // ya mandan su propio aviso desde la ruta de store-credit.
    //
    // Se espera la llamada: en serverless una promesa sin await puede cortarse al
    // devolver la respuesta y el push nunca sale. Un fallo del push no revierte la
    // aprobación, por eso va en su propio try.
    if (exchange.exchange_type === 'cash') {
      const monto = Number(exchange.points_requested).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      try {
        await sendPushToAffiliate(
          exchange.customer_id,
          '¡Tu pago fue aprobado! 💸',
          `Tu pago de $${monto} MXN fue aprobado y se verá reflejado en tu cuenta en las próximas horas.`,
          { type: 'exchange_approved', exchangeId: exchange.id }
        );
      } catch (pushErr) {
        console.error('⚠️ Push de pago aprobado no enviado:', pushErr?.message);
      }
    }

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
