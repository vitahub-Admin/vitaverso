import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const GQL_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const FAKE_CUSTOMER_ID = 10025223455041;

function normalizeDuration(raw) {
  if (!raw) return null;
  const match = String(raw).match(/\d+/);
  return match ? match[0] : null;
}

// Shopify GraphQL en batches de 250 IDs
async function fetchProductDetails(productIds) {
  if (!productIds.length) return {};
  const map = {};
  for (let i = 0; i < productIds.length; i += 250) {
    const chunk = productIds.slice(i, i + 250);
    const gids  = chunk.map(id => `gid://shopify/Product/${id}`);
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
      const res  = await fetch(GQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
        body: JSON.stringify({ query, variables: { ids: gids } }),
      });
      const { data } = await res.json();
      for (const node of (data?.nodes || [])) {
        if (!node) continue;
        const numId = String(node.id).split('/').pop();
        map[numId] = {
          handle:             node.handle || null,
          inventory_quantity: node.totalInventory ?? 0,
          duration:           normalizeDuration(node.duration?.value),
        };
      }
    } catch { /* shopify no crítico */ }
  }
  return map;
}

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to');

    if (!id) {
      return NextResponse.json({ success: false, message: 'No hay id en parámetros' }, { status: 400 });
    }

    const numericCustomerId = parseInt(id);
    if (isNaN(numericCustomerId)) {
      return NextResponse.json({ success: false, message: 'ID no es un número válido' }, { status: 400 });
    }

    // ── Datos fake para videos/demos ──────────────────────────────────────────
    if (numericCustomerId === FAKE_CUSTOMER_ID) {
      const fakeOrders = [
        { order_number: 2895, financial_status: 'paid', customer_email: 'ana.rodriguez@vitahub.mx', nombre_cliente: 'Ana', apellido_cliente: 'Rodríguez', created_at: { value: '2025-12-28T17:33:35.000Z' }, ganancia_total: 45.8, total_items: 1, share_cart: 'CART-A1B2', productos: [{ producto: 'Extracto de Ashwagandha Optimizada 125mg de Life Extension | 60 cápsulas vegetarianas', cantidad: 1, ganancia_producto: 45.8, comision: 0.2, duracion: '30', inventario: 27, product_handle: 'extracto-de-ashwagandha-optimizada-125mg-de-life-extension' }] },
        { order_number: 2894, financial_status: 'paid', customer_email: 'carlos.mendoza@vitahub.mx', nombre_cliente: 'Carlos', apellido_cliente: 'Mendoza', created_at: { value: '2025-12-26T14:20:00.000Z' }, ganancia_total: 210, total_items: 1, share_cart: null, productos: [{ producto: 'Proteína Hidrolizada de Suero Isolate Whey Protein AMZ Nutrition | 2.310KG / Vainilla', cantidad: 1, ganancia_producto: 210, comision: 0.2, duracion: '70', inventario: 15, product_handle: 'proteina-aislada-de-suero-isolate-whey-amz-nutrition' }] },
        { order_number: 2881, financial_status: 'paid', customer_email: 'sofia.garcia@vitahub.mx', nombre_cliente: 'Sofía', apellido_cliente: 'García', created_at: { value: '2025-12-24T10:45:00.000Z' }, ganancia_total: 360, total_items: 2, share_cart: 'CART-C3D4', productos: [{ producto: 'Creatina Monohidratada 300g AMZ Nutrition', cantidad: 1, ganancia_producto: 120, comision: 0.2, duracion: '30', inventario: 12, product_handle: 'creatina-monohidratada-300g-amz-nutrition' }, { producto: 'Omega-3 1000mg 120 perlas AMZ Nutrition', cantidad: 1, ganancia_producto: 240, comision: 0.2, duracion: '90', inventario: 25, product_handle: 'omega-3-1000mg-120-perlas-amz-nutrition' }] },
        { order_number: 2875, financial_status: 'paid', customer_email: 'miguel.lopez@vitahub.mx', nombre_cliente: 'Miguel', apellido_cliente: 'López', created_at: { value: '2025-12-22T18:54:36.000Z' }, ganancia_total: 86.5, total_items: 2, share_cart: 'CART-E5F6', productos: [{ producto: 'Citrato de Magnesio 400 mg de NOW Foods | 90 cápsulas', cantidad: 1, ganancia_producto: 28.4, comision: 0.2, duracion: '30', inventario: 42, product_handle: 'citrato-de-magnesio-400-mg-de-now-foods' }, { producto: 'Multivitamínico Complejo B 60 tabletas AMZ Nutrition', cantidad: 1, ganancia_producto: 58.1, comision: 0.2, duracion: '60', inventario: 18, product_handle: 'multivitaminico-complejo-b-60-tabletas-amz-nutrition' }] },
        { order_number: 2872, financial_status: 'paid', customer_email: 'laura.martinez@vitahub.mx', nombre_cliente: 'Laura', apellido_cliente: 'Martínez', created_at: { value: '2025-12-20T11:30:00.000Z' }, ganancia_total: 510, total_items: 3, share_cart: 'CART-G7H8', productos: [{ producto: 'Proteína Hidrolizada Isolate Whey 2.310KG / Chocolate', cantidad: 1, ganancia_producto: 210, comision: 0.2, duracion: '70', inventario: 3, product_handle: 'proteina-aislada-de-suero-isolate-whey-amz-nutrition' }, { producto: 'BCAA 2:1:1 300g AMZ Nutrition', cantidad: 1, ganancia_producto: 150, comision: 0.2, duracion: '60', inventario: 15, product_handle: 'bcaa-2-1-1-300g-amz-nutrition' }, { producto: 'Glutamina 300g AMZ Nutrition', cantidad: 1, ganancia_producto: 150, comision: 0.2, duracion: '50', inventario: 7, product_handle: 'glutamina-300g-amz-nutrition' }] },
        { order_number: 2824, financial_status: 'paid', customer_email: 'javier.perez@vitahub.mx', nombre_cliente: 'Javier', apellido_cliente: 'Pérez', created_at: { value: '2025-12-18T15:20:00.000Z' }, ganancia_total: 420, total_items: 2, share_cart: null, productos: [{ producto: 'Pre-entreno AMZ Nutrition | 300g', cantidad: 1, ganancia_producto: 240, comision: 0.2, duracion: '45', inventario: 8, product_handle: 'pre-entreno-amz-nutrition-300g' }, { producto: 'Proteína Isolate Whey 1.617KG / Fresa', cantidad: 1, ganancia_producto: 180, comision: 0.2, duracion: '49', inventario: 5, product_handle: 'proteina-aislada-de-suero-isolate-whey-amz-nutrition' }] },
        { order_number: 2641, financial_status: 'refunded', customer_email: 'patricia.gomez@vitahub.mx', nombre_cliente: 'Patricia', apellido_cliente: 'Gómez', created_at: { value: '2025-12-17T09:15:00.000Z' }, ganancia_total: 95.6, total_items: 1, share_cart: 'CART-I9J0', productos: [{ producto: 'Vitamina D3 5000 UI + K2 MK7 de NOW Foods | 120 cápsulas', cantidad: 1, ganancia_producto: 95.6, comision: 0.2, duracion: '120', inventario: 32, product_handle: 'vitamina-d3-5000-ui-k2-mk7-de-now-foods' }] },
        { order_number: 2571, financial_status: 'paid', customer_email: 'raul.hernandez@vitahub.mx', nombre_cliente: 'Raúl', apellido_cliente: 'Hernández', created_at: { value: '2025-12-16T13:45:00.000Z' }, ganancia_total: 280, total_items: 2, share_cart: 'CART-K1L2', productos: [{ producto: 'Jarabe de Agave Orgánico Ambar 100% Natural de NBF | 500 ml', cantidad: 1, ganancia_producto: 45, comision: 0.1, duracion: '30', inventario: 22, product_handle: 'jarabe-de-agave-organico-ambar-100-natural-de-nbf' }, { producto: 'Colágeno Hidrolizado Tipo 1 y 3 de Vital Proteins | 300g', cantidad: 1, ganancia_producto: 235, comision: 0.2, duracion: '30', inventario: 14, product_handle: 'colageno-hidrolizado-tipo-1-3-vital-proteins' }] },
        { order_number: 2570, financial_status: 'paid', customer_email: 'claudia.diaz@vitahub.mx', nombre_cliente: 'Claudia', apellido_cliente: 'Díaz', created_at: { value: '2026-01-05T16:30:00.000Z' }, ganancia_total: 620, total_items: 4, share_cart: 'CART-M3N4', productos: [{ producto: 'Proteína de Chícharo AMZ Nutrition | 1.5KG / Natural', cantidad: 1, ganancia_producto: 180, comision: 0.2, duracion: '60', inventario: 9, product_handle: 'proteina-de-chicharo-amz-nutrition' }, { producto: 'Ashwagandha 500mg | 60 cápsulas', cantidad: 1, ganancia_producto: 65, comision: 0.2, duracion: '30', inventario: 21, product_handle: 'ashwagandha-500mg-60-capsulas' }, { producto: 'Magnesio L-Threonate | 90 cápsulas', cantidad: 1, ganancia_producto: 195, comision: 0.2, duracion: '30', inventario: 17, product_handle: 'magnesio-l-threonate-soporte-cognitivo' }, { producto: 'Probiótico 50 Billones UFC | 30 cápsulas', cantidad: 1, ganancia_producto: 180, comision: 0.2, duracion: '30', inventario: 11, product_handle: 'probiotico-50-billones-ufc' }] },
        { order_number: 2500, financial_status: 'paid', customer_email: 'fernando.castro@vitahub.mx', nombre_cliente: 'Fernando', apellido_cliente: 'Castro', created_at: { value: '2026-01-10T10:00:00.000Z' }, ganancia_total: 320, total_items: 2, share_cart: null, productos: [{ producto: 'Testo Booster AMZ Nutrition | 90 cápsulas', cantidad: 1, ganancia_producto: 165, comision: 0.2, duracion: '30', inventario: 6, product_handle: 'testo-booster-amz-nutrition' }, { producto: 'Termogénico Quema Grasa Extracto de Té Verde | 120 cápsulas', cantidad: 1, ganancia_producto: 155, comision: 0.2, duracion: '30', inventario: 13, product_handle: 'termogenico-quema-grasa-te-verde' }] },
      ];

      let filtered = fakeOrders;
      if (from && to) {
        const fromDate = new Date(from);
        const toDate   = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filtered = fakeOrders.filter(o => {
          const d = new Date(o.created_at.value);
          return d >= fromDate && d <= toDate;
        });
      }
      filtered.sort((a, b) => new Date(b.created_at.value) - new Date(a.created_at.value) || b.order_number - a.order_number);
      return NextResponse.json({ success: true, data: filtered, message: `🎥 ${filtered.length} órdenes demo`, isFakeData: true });
    }

    // ── Datos reales desde Supabase ───────────────────────────────────────────
    let ordersQuery = supabase
      .from('orders')
      .select('order_id, order_name, financial_status, customer_email, customer_name, share_cart, shopify_created_at, line_items, total_discounts')
      .eq('specialist_ref', String(id))
      .not('customer_email', 'is', null)
      .order('shopify_created_at', { ascending: false });

    if (from && to) {
      ordersQuery = ordersQuery.gte('shopify_created_at', from).lte('shopify_created_at', to + 'T23:59:59');
    }

    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    if (!orders?.length) {
      return NextResponse.json({ success: true, data: [], message: 'Sin órdenes encontradas' });
    }

    // Comisiones
    const productIds = [...new Set(
      orders.flatMap(o => (o.line_items || []).map(i => i.product_id).filter(Boolean))
    )];

    const [{ data: commissions }, productDetails] = await Promise.all([
      supabase.from('product_variant_commissions').select('product_id, commission_percent').in('product_id', productIds).eq('active', true),
      fetchProductDetails(productIds),
    ]);

    const commMap = {};
    for (const c of (commissions || [])) commMap[String(c.product_id)] = Number(c.commission_percent);

    // Construir respuesta agrupada por orden
    const data = orders.map(order => {
      const items         = (order.line_items || []).filter(i => i.title && !i.title.toLowerCase().includes('tip'));
      const orderSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0);
      const totalDiscount = Number(order.total_discounts || 0);

      const nameParts      = (order.customer_name || '').trim().split(/\s+/);
      const nombre_cliente = nameParts[0] || null;
      const apellido_cliente = nameParts.slice(1).join(' ') || null;

      let ganancia_total = 0;
      let total_items    = 0;

      const productos = items.map(item => {
        const pid          = String(item.product_id || '');
        const commission   = commMap[pid] ?? 0;
        const price        = Number(item.price || 0);
        const qty          = item.quantity || 1;
        const lineSubtotal = price * qty;
        const lineDiscount = orderSubtotal > 0 ? totalDiscount * (lineSubtotal / orderSubtotal) : 0;
        const ganancia     = (lineSubtotal - lineDiscount) * (commission / 100);
        const details      = productDetails[pid] || {};

        ganancia_total += ganancia;
        total_items    += qty;

        return {
          producto:       item.title,
          cantidad:       qty,
          ganancia_producto: ganancia,
          comision:       commission / 100,
          duracion:       details.duration           ?? null,
          inventario:     details.inventory_quantity ?? 0,
          product_handle: details.handle             ?? null,
        };
      });

      return {
        order_number:     order.order_name?.replace('#', '') || String(order.order_id),
        financial_status: order.financial_status || null,
        created_at:       { value: order.shopify_created_at },
        customer_email:   order.customer_email,
        nombre_cliente,
        apellido_cliente,
        share_cart:       order.share_cart || null,
        productos,
        total_items,
        ganancia_total,
      };
    });

    return NextResponse.json({ success: true, data, message: `Encontradas ${data.length} órdenes` });

  } catch (error) {
    console.error('Error en ganancias:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
