import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const customerId = id ? parseInt(id, 10) : null;
    if (!customerId || isNaN(customerId)) {
      return NextResponse.json(
        { success: false, message: `CustomerId inválido o no numérico: ${id}` },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to');

    // 1. Sharecarts del especialista
    let cartsQuery = supabase
      .from('sharecarts')
      .select('token, name, created_at, items, extra')
      .eq('owner_id', String(customerId))
      .order('created_at', { ascending: false });

    if (from && to) {
      cartsQuery = cartsQuery
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59');
    }

    const { data: carts, error: cartsError } = await cartsQuery;
    if (cartsError) throw cartsError;

    if (!carts?.length) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { customerId, count: 0, dateRange: { from, to } },
      });
    }

    // 2. Detectar cuáles tokens tienen orden → Completed
    const tokens = carts.map((c) => c.token).filter(Boolean);
    const { data: ordersWithCart } = await supabase
      .from('orders')
      .select('share_cart')
      .in('share_cart', tokens)
      .not('share_cart', 'is', null);

    const completedTokens = new Set((ordersWithCart || []).map((o) => o.share_cart));

    // 3. Construir respuesta (compatible con Sheet.jsx)
    const data = carts.map((cart) => {
      const bq         = cart.extra?.bq || {};
      const itemsCount = cart.items?.length > 0 ? cart.items.length : (bq.items_count ?? 0);
      const itemsValue = bq.items_value ?? 0;

      return {
        created_at:  { value: cart.created_at },
        code:        cart.token,
        client_name: cart.name || null,
        email:       null,
        opens_count: bq.opens_count ?? 0,
        items_count: itemsCount,
        items_value: itemsValue,
        status:      completedTokens.has(cart.token) ? 'Completed' : 'Pending',
      };
    });

    return NextResponse.json({
      success: true,
      data,
      meta: { customerId, count: data.length, dateRange: { from, to } },
    });

  } catch (error) {
    console.error('Error en carts:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
