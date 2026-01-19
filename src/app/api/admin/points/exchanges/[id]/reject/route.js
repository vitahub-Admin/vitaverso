import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req, { params }) {
  try {
    const exchangeId = Number(params.id);
    const body = await req.json();
    const { admin_note } = body;

    if (Number.isNaN(exchangeId)) {
      return NextResponse.json(
        { success: false, message: 'ID inválido' },
        { status: 400 }
      );
    }

    const { data: exchange } = await supabase
      .from('point_exchanges')
      .select('status')
      .eq('id', exchangeId)
      .single();

    if (!exchange || exchange.status !== 'pending') {
      return NextResponse.json(
        { success: false, message: 'Exchange no pendiente' },
        { status: 400 }
      );
    }

    await supabase
      .from('point_exchanges')
      .update({
        status: 'rejected',
        processed_at: new Date().toISOString(),
        processed_by_type: 'admin',
        admin_note: admin_note || 'Rechazado por administrador',
      })
      .eq('id', exchangeId);

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
