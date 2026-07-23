import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ success: false, message: 'No hay id en parámetros' }, { status: 400 });
    }

    // 1. Órdenes del especialista con email
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('order_id, order_name, customer_email, customer_name, customer_phone, share_cart, shopify_created_at, line_items, total_discounts')
      .eq('specialist_ref', String(id))
      .not('customer_email', 'is', null)
      .neq('customer_email', '');

    if (ordersError) throw ordersError;
    if (!orders?.length) {
      return NextResponse.json({ success: true, data: [], message: 'Sin contactos encontrados' });
    }

    // 2. Comisiones por product_id
    const productIds = [...new Set(
      orders.flatMap(o => (o.line_items || []).map(i => i.product_id).filter(Boolean))
    )];

    const { data: commissions } = await supabase
      .from('product_variant_commissions')
      .select('product_id, commission_percent')
      .in('product_id', productIds)
      .eq('active', true);

    const commMap = {};
    for (const c of (commissions || [])) {
      commMap[String(c.product_id)] = Number(c.commission_percent);
    }

    // 3. Agregar métricas por cliente
    const clientMap = {};

    for (const order of orders) {
      const email = order.customer_email;
      if (!email) continue;

      if (!clientMap[email]) {
        const nameParts = (order.customer_name || '').trim().split(/\s+/);
        clientMap[email] = {
          nombre_cliente:               nameParts[0] || null,
          apellido_cliente:             nameParts.slice(1).join(' ') || null,
          email_cliente:                email,
          telefono_cliente:             order.customer_phone || null,
          cantidad_ordenes:             0,
          cantidad_carritos:            new Set(),
          ganancia_total:               0,
          fecha_ultima_orden:           null,
          fecha_ultima_orden_formateada: null,
        };
      }

      const client = clientMap[email];
      client.cantidad_ordenes++;

      if (order.share_cart) client.cantidad_carritos.add(order.share_cart);

      // Ganancia de esta orden
      const items         = order.line_items || [];
      const orderSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0);
      const totalDiscount = Number(order.total_discounts || 0);

      for (const item of items) {
        if (!item.title || LOWER_includes_tip(item.title)) continue;
        const commission   = commMap[String(item.product_id || '')] ?? 0;
        const price        = Number(item.price || 0);
        const qty          = item.quantity || 1;
        const lineSubtotal = price * qty;
        const lineDiscount = orderSubtotal > 0 ? totalDiscount * (lineSubtotal / orderSubtotal) : 0;
        client.ganancia_total += (lineSubtotal - lineDiscount) * (commission / 100);
      }

      // Fecha más reciente
      if (!client.fecha_ultima_orden || order.shopify_created_at > client.fecha_ultima_orden) {
        client.fecha_ultima_orden = order.shopify_created_at;
        client.fecha_ultima_orden_formateada = order.shopify_created_at
          ? order.shopify_created_at.slice(0, 10)
          : null;
      }
    }

    // 4. Serializar y ordenar por última orden desc
    const data = Object.values(clientMap)
      .map(c => ({ ...c, cantidad_carritos: c.cantidad_carritos.size }))
      .sort((a, b) => (b.fecha_ultima_orden || '') .localeCompare(a.fecha_ultima_orden || ''));

    return NextResponse.json({
      success: true,
      data,
      message: `Encontrados ${data.length} contactos`,
    });

  } catch (error) {
    console.error('Error en contacts:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function LOWER_includes_tip(title) {
  return title.toLowerCase().includes('tip');
}
