import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const GQL_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;

// "180 días", "de 30 a 60 días", "45", null → número o null
function normalizeDuration(raw) {
  if (!raw) return null;
  const match = String(raw).match(/\d+/);
  return match ? match[0] : null;
}

async function fetchProductDetails(productIds) {
  if (!productIds.length) return {};

  const gids = productIds.map(id => `gid://shopify/Product/${id}`);

  const query = `
    query($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          handle
          totalInventory
          duration: metafield(namespace: "custom", key: "duraci_n_del_producto") { value }
        }
      }
    }
  `;

  try {
    const res = await fetch(GQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables: { ids: gids } }),
    });
    const { data } = await res.json();
    const map = {};
    for (const node of (data?.nodes || [])) {
      if (!node) continue;
      const numericId = String(node.id).split('/').pop();
      map[numericId] = {
        handle:             node.handle || null,
        inventory_quantity: node.totalInventory ?? 0,
        duration:           node.duration?.value || null,
      };
    }
    return map;
  } catch {
    return {};
  }
}

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!id || !email) {
      return NextResponse.json({ success: false, message: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    // 1. Órdenes del cliente referidas por este especialista
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('order_id, order_name, financial_status, shopify_created_at, shopify_updated_at, line_items, share_cart, total_discounts')
      .eq('specialist_ref', String(id))
      .eq('customer_email', email)
      .order('shopify_created_at', { ascending: false });

    if (ordersError) throw ordersError;
    if (!orders?.length) {
      return NextResponse.json({ success: true, data: [], message: 'Sin órdenes encontradas' });
    }

    // 2. Productos únicos para buscar comisión y detalles de Shopify
    const productIds = [...new Set(
      orders.flatMap(o => (o.line_items || []).map(i => i.product_id).filter(Boolean))
    )];

    // 3. Comisiones por product_id
    const { data: commissions } = await supabase
      .from('product_variant_commissions')
      .select('product_id, commission_percent')
      .in('product_id', productIds)
      .eq('active', true);

    const commMap = {};
    for (const c of (commissions || [])) {
      commMap[String(c.product_id)] = Number(c.commission_percent);
    }

    // 4. Detalles de Shopify (handle, inventory, duration) — un solo call GraphQL
    const productDetails = await fetchProductDetails(productIds);

    // 5. Expandir line_items en filas planas, igual que devolvía BQ
    const rows = [];
    for (const order of orders) {
      const items = order.line_items || [];
      if (!items.length) continue;

      // Prorratear descuento de orden entre líneas por valor
      const orderSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0);
      const totalDiscount  = Number(order.total_discounts || 0);

      for (const item of items) {
        if (!item.title) continue;

        const pid        = String(item.product_id || '');
        const commission = commMap[pid] ?? 0;
        const price      = Number(item.price || 0);
        const qty        = item.quantity || 1;
        const details    = productDetails[pid] || {};

        // Descuento proporcional a esta línea
        const lineSubtotal    = price * qty;
        const lineDiscount    = orderSubtotal > 0 ? totalDiscount * (lineSubtotal / orderSubtotal) : 0;
        const gananciaProducto = (lineSubtotal - lineDiscount) * (commission / 100);

        rows.push({
          order_number:               order.order_name?.replace('#', '') || String(order.order_id),
          share_cart:                 order.share_cart || null,
          financial_status:           order.financial_status || null,
          // BQ devolvía { value: "..." } — mantenemos compatibilidad con el frontend
          created_at:                 { value: order.shopify_created_at },
          updated_at:                 { value: order.shopify_updated_at },
          line_items_name:            item.title,
          line_items_quantity:        qty,
          line_items_price:           price,
          discount_allocations_amount: lineDiscount,
          comission:                  commission / 100,
          ganancia_producto:          gananciaProducto,
          handle:                     details.handle            ?? null,
          inventory_quantity:         details.inventory_quantity ?? 0,
          duration:                   normalizeDuration(details.duration),
        });
      }
    }

    return NextResponse.json({
      success: true,
      data:    rows,
      message: `Encontradas ${rows.length} líneas`,
    });

  } catch (error) {
    console.error('Error en client-details:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
