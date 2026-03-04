import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

    const body = await req.json();
    const { admin_note } = body;

    const { data: exchange, error } = await supabase
      .from('point_exchanges')
      .select('status')
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
        { success: false, message: 'Exchange no pendiente' },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from('point_exchanges')
      .update({
        status: 'rejected',
        processed_at: new Date().toISOString(),
        processed_by_type: 'admin',
        admin_note: admin_note || 'Rechazado por administrador',
      })
      .eq('id', exchangeId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: 'Exchange rechazado',
    });

  } catch (err) {
    console.error('❌ Admin reject exchange:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}