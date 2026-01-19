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

/**
 * POST
 * Crear exchange request (PENDING)
 */
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

    const {
      points_requested,
      exchange_type,
      affiliate_note,
      target_reference,
      metadata,
    } = body;

    /**
     * Validaciones
     */
    if (!points_requested || Number(points_requested) <= 0) {
      return NextResponse.json(
        { success: false, message: 'points_requested inválido' },
        { status: 400 }
      );
    }

    if (!['cash', 'discount', 'product'].includes(exchange_type)) {
      return NextResponse.json(
        { success: false, message: 'exchange_type inválido' },
        { status: 400 }
      );
    }

    /**
     * Creamos request
     * ⚠️ NO se valida saldo acá
     * ⚠️ NO se tocan puntos
     */
    const { data: exchange, error } = await supabase
      .from('point_exchanges')
      .insert([
        {
          customer_id: customerIdNum,
          points_requested: Number(points_requested),
          exchange_type,
          affiliate_note: affiliate_note || null,
          target_reference: target_reference || null,
          status: 'pending',
          metadata: metadata || {
            source: 'affiliate',
            requested_from: 'frontend',
          },
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Solicitud de canje creada',
      exchange,
      meta: {
        points_requested: Number(points_requested),
        estimated_value_mxn: Number(points_requested), // 1 punto = 1 MXN
      },
    });

  } catch (err) {
    console.error('❌ Error POST /api/affiliate/points/exchange:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
