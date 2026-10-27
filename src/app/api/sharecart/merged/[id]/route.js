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

    // 2a. Protocolos cobrados en efectivo. Esa venta no pasa por Shopify hasta que el profesional
    //     liquida, así que no aparece en `orders` y `has_sale` queda en falso. Se informa aparte
    //     (`efectivo`) sin tocar `has_sale`, que es la señal de conversión que usan Analytics e Inicio.
    //     Solo se muestra a su dueño: las ventas en efectivo son un dato financiero.
    const efectivoPorToken = {};
    const esDueño = idDeSesion(await cookies()) === String(customerId);
    const tokensEfectivo = (carts || []).filter(c => c.extra?.efectivo).map(c => c.token);
    if (esDueño && tokensEfectivo.length) {
      const { data: ventasEfectivo } = await servicio
        .from('ventas_efectivo')
        .select('sharecart_token, estado, total')
        .in('sharecart_token', tokensEfectivo)
        .neq('estado', 'cancelada');
      for (const v of ventasEfectivo || []) {
        efectivoPorToken[v.sharecart_token] = { estado: v.estado, total: Number(v.total) };
      }
    }

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
        items_value:     calculateItemsValue(enriched),
        status:          hasSale ? 'Completed' : 'Pending',
        has_sale:        hasSale,
        efectivo:        efectivoPorToken[cart.token] || null,   // { estado: 'por_pagar' | 'pagada', total }
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
