import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { idDeSesion } from '@/lib/sesionWeb';

// ventas_efectivo está cerrada a la llave pública: se lee con la de servicio
const servicio = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

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

    // Antes exigía las dos fechas; con solo `from` alcanza para pedir "de 2026
    // en adelante", que es lo que necesita Mis Protocolos.
    if (from) cartsQuery = cartsQuery.gte('created_at', from);
    if (to)   cartsQuery = cartsQuery.lte('created_at', to);

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

    // 2a. Ventas que no pasan por una orden de Shopify:
    //     · venta de consultorio con tarjeta (local_orders): la cierra nuestro webhook, no genera fila en orders
    //     · cobro en efectivo (ventas_efectivo): el paciente ya pagó en mano; la orden de Shopify sale cuando el
    //       profesional paga su carrito de ventas locales
    //     Ambas están cerradas a la llave pública: se leen con la de servicio, acotadas al profesional.
    const [{ data: locales }, { data: efectivos }] = await Promise.all([
      servicio.from('local_orders').select('sharecart_token')
        .eq('owner_id', String(customerId)).eq('estado', 'pagado').not('sharecart_token', 'is', null),
      servicio.from('ventas_efectivo').select('sharecart_token, estado, total')
        .eq('owner_id', customerId).neq('estado', 'cancelada').not('sharecart_token', 'is', null),
    ]);
    const ventaLocalPagada = new Set((locales || []).map(l => l.sharecart_token));
    const efectivoPorToken = Object.fromEntries(
      (efectivos || []).map(v => [v.sharecart_token, { estado: v.estado, total: Number(v.total) }])
    );
    // El detalle del efectivo (estado y monto) es un dato financiero: solo se entrega a su dueño
    const esDueño = idDeSesion(await cookies()) === String(customerId);

    // 2b. Enriquecer items del nuevo formato (tienen variant_id pero sin title)
    //     Buscar en product_catalog para obtener título y precio real
    const allVariantIds = new Set();
    for (const cart of carts || []) {
      for (const item of cart.items || []) {
        const vid = item.variant_id ?? item.id;
        // Enriquecer cualquier item que tenga variant_id pero no title
        if (vid && !item.title) {
          allVariantIds.add(Number(vid));
        }
      }
    }

    const variantMap = {};
    if (allVariantIds.size > 0) {
      const { data: catalogRows } = await supabase
        .from('product_catalog')
        .select('variant_id, title, variant_title, price')
        .in('variant_id', [...allVariantIds]);

      for (const row of catalogRows || []) {
        variantMap[row.variant_id] = row;
      }
    }

    function enrichItems(items) {
      if (!Array.isArray(items)) return items;
      return items.map(item => {
        const vid = Number(item.variant_id ?? item.id ?? 0);
        const catalog = variantMap[vid];
        if (!catalog) return item;
        return {
          ...item,
          variant_id:    vid,
          title:         item.title         || catalog.title,
          variant_title: item.variant_title || catalog.variant_title || null,
          price:         item.price         ?? catalog.price,
        };
      });
    }

    // 3. Armar lista con status calculado
    const mergedCarts = (carts || []).map(cart => {
      const enriched = enrichItems(cart.items);
      // Vendido: orden de Shopify, venta de consultorio pagada, o cobro en efectivo ya liquidado
      const hasSale = shareCartsWithOrders.has(cart.token)
        || ventaLocalPagada.has(cart.token)
        || efectivoPorToken[cart.token]?.estado === 'pagada';
      return {
        source:          'supabase',
        id:              cart.token,
        token:           cart.token,
        created_at:      cart.created_at,
        full_created_at: cart.created_at,
        client_name:     cart.name,
        phone:           cart.phone,
        items_count:     Array.isArray(cart.items) ? cart.items.length : 0,
        items_value:     calculateItemsValue(enriched),
        status:          hasSale ? 'Completed' : 'Pending',
        has_sale:        hasSale,
        efectivo:        (esDueño && efectivoPorToken[cart.token]) || null,   // { estado: 'por_pagar' | 'pagada', total }
        platform:        'new',
        items:           enriched,
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
