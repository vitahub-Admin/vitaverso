import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function calculateItemsValue(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    const price = parseFloat(item.price) || 0;
    const quantity = parseInt(item.quantity) || 1;
    return total + price * quantity;
  }, 0);
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const customerId = id ? parseInt(id, 10) : null;

    if (!customerId || isNaN(customerId)) {
      return NextResponse.json(
        { success: false, message: `CustomerId inválido: ${id}` },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to');

    // 1. Carritos del afiliado en Supabase
    let cartsQuery = supabase
      .from('sharecarts')
      .select('*')
      .eq('owner_id', customerId.toString())
      .order('updated_at', { ascending: false });

    if (from && to) {
      cartsQuery = cartsQuery.gte('created_at', from).lte('created_at', to);
    }

    const { data: carts, error: cartsError } = await cartsQuery;
    if (cartsError) throw cartsError;

    // 2. Tokens de carrito que tienen órdenes confirmadas
    const { data: ordersWithCart } = await supabase
      .from('orders')
      .select('share_cart')
      .eq('specialist_ref', customerId.toString())
      .not('share_cart', 'is', null)
      .neq('share_cart', '');

    const shareCartsWithOrders = new Set(
      (ordersWithCart || []).map(o => o.share_cart)
    );

    // 3. Armar lista con status calculado
    const mergedCarts = (carts || []).map(cart => {
      const hasSale = shareCartsWithOrders.has(cart.token);
      return {
        source:          'supabase',
        id:              cart.token,
        token:           cart.token,
        created_at:      cart.created_at,
        full_created_at: cart.created_at,
        client_name:     cart.name,
        phone:           cart.phone,
        items_count:     Array.isArray(cart.items) ? cart.items.length : 0,
        items_value:     calculateItemsValue(cart.items),
        status:          hasSale ? 'Completed' : 'Pending',
        has_sale:        hasSale,
        platform:        'new',
        items:           cart.items,
        extra:           cart.extra,
        location:        cart.location,
      };
    });

    // 4. Métricas consolidadas
    const completed = mergedCarts.filter(c => c.has_sale).length;
    const metrics = {
      total_carts:       mergedCarts.length,
      completed_carts:   completed,
      pending_carts:     mergedCarts.length - completed,
      total_items:       mergedCarts.reduce((s, c) => s + (c.items_count || 0), 0),
      carts_with_sales:  completed,
      conversion_rate:   mergedCarts.length > 0
        ? ((completed / mergedCarts.length) * 100).toFixed(2) + '%'
        : '0%',
    };

    return NextResponse.json({
      success: true,
      data:    mergedCarts,
      metrics,
      meta: {
        customerId,
        count:     mergedCarts.length,
        dateRange: { from, to },
      },
    });

  } catch (error) {
    console.error('Error obteniendo carritos:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
