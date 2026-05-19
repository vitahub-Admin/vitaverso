// scripts/backfill_orders.js
// Importa el histórico de órdenes desde Shopify Admin REST → Supabase.
// Aplica la misma lógica de status que el webhook: ok / suspect / corrected.
//
// Uso: node scripts/backfill_orders.js

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAttr(noteAttributes, name) {
  return noteAttributes?.find(a => a.name === name)?.value || '';
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapOrder(order, sharecartMap) {
  const customer = order.customer || {};
  const specialistRefRaw = getAttr(order.note_attributes, 'specialist_ref');
  const shareCart        = getAttr(order.note_attributes, 'share_cart') || null;

  const isBlank = !specialistRefRaw || specialistRefRaw === '0000';

  let status       = 'ok';
  let correctedRef = null;
  const specialistRef = isBlank ? null : specialistRefRaw;

  if (isBlank) {
    if (shareCart && sharecartMap[shareCart]) {
      correctedRef = String(sharecartMap[shareCart]);
      status = 'corrected';
    } else {
      status = 'suspect';
    }
  }

  return {
    order_id:           order.id,
    order_name:         order.name,
    customer_id:        customer.id        || null,
    customer_name:      [customer.first_name, customer.last_name].filter(Boolean).join(' ') || null,
    customer_email:     customer.email     || null,
    customer_phone:     customer.phone     || null,
    specialist_ref:     specialistRef,
    corrected_ref:      correctedRef,
    share_cart:         shareCart,
    financial_status:   order.financial_status   || null,
    fulfillment_status: order.fulfillment_status || null,
    discount_title:     order.discount_codes?.[0]?.code || null,
    total:              Number(order.total_price),
    total_discounts:    Number(order.total_discounts),
    shopify_created_at: order.created_at,
    shopify_updated_at: order.updated_at,
    status,
    line_items: (order.line_items || []).map(item => ({
      sku:           item.sku           || null,
      name:          item.name          || null,
      variant_title: item.variant_title || null,
      quantity:      Number(item.quantity),
      price:         Number(item.price),
    })),
  };
}

async function backfill() {
  console.log('🚀 Backfill Shopify → Supabase iniciado\n');

  // ── 1. Paginar todas las órdenes de Shopify ──────────────────────────────
  console.log('📦 Trayendo órdenes de Shopify...');

  const fields = 'id,order_number,name,customer,note_attributes,financial_status,fulfillment_status,line_items,discount_codes,total_price,total_discounts,created_at,updated_at';
  let url = `https://${SHOPIFY_STORE}/admin/api/2025-01/orders.json?status=any&limit=250&fields=${fields}`;
  const allOrders = [];

  while (url) {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
    });

    if (!res.ok) {
      console.error(`❌ Shopify error ${res.status}: ${await res.text()}`);
      break;
    }

    const { orders } = await res.json();
    allOrders.push(...orders);
    process.stdout.write(`\r  → ${allOrders.length} órdenes traídas...`);

    const link      = res.headers.get('link') || '';
    const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;

    if (url) await sleep(500);
  }

  console.log(`\n✅ ${allOrders.length} órdenes totales\n`);

  if (!allOrders.length) {
    console.log('⚠️  Sin órdenes. Abortando.');
    return;
  }

  // ── 2. Bulk lookup share_cart tokens en Supabase ────────────────────────
  const suspectTokens = [...new Set(
    allOrders
      .filter(o => {
        const ref = getAttr(o.note_attributes, 'specialist_ref');
        return (!ref || ref === '0000') && getAttr(o.note_attributes, 'share_cart');
      })
      .map(o => getAttr(o.note_attributes, 'share_cart'))
  )];

  const sharecartMap = {};
  if (suspectTokens.length > 0) {
    console.log(`🔍 Buscando ${suspectTokens.length} share_cart tokens...`);
    const { data: carts } = await supabase
      .from('sharecarts')
      .select('token, owner_id')
      .in('token', suspectTokens);

    for (const c of carts || []) {
      if (c.owner_id) sharecartMap[c.token] = c.owner_id;
    }
    console.log(`✅ ${Object.keys(sharecartMap).length} tokens resueltos\n`);
  }

  // ── 3. Mapear filas ──────────────────────────────────────────────────────
  const rows    = allOrders.map(o => mapOrder(o, sharecartMap));
  const batches = chunk(rows, 500);
  let inserted  = 0;
  let errors    = 0;

  console.log(`📤 Upserteando ${rows.length} órdenes en ${batches.length} lotes...\n`);

  for (let i = 0; i < batches.length; i++) {
    const { error } = await supabase
      .from('orders')
      .upsert(batches[i], { onConflict: 'order_id' });

    if (error) {
      console.error(`❌ Lote ${i + 1}/${batches.length} — ${error.message}`);
      errors += batches[i].length;
    } else {
      inserted += batches[i].length;
      console.log(`✅ Lote ${i + 1}/${batches.length} — ${inserted} insertadas`);
    }
  }

  // ── 4. Resumen ───────────────────────────────────────────────────────────
  const summary = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  console.log('\n─────────────────────────────────────');
  console.log(`📊 Total procesadas: ${rows.length}`);
  console.log(`✅ Insertadas:       ${inserted}`);
  console.log(`❌ Errores:          ${errors}`);
  console.log(`\n   ok:        ${summary.ok        || 0}`);
  console.log(`   suspect:   ${summary.suspect    || 0}`);
  console.log(`   corrected: ${summary.corrected  || 0}`);
  console.log('─────────────────────────────────────');
  console.log('🏁 Backfill finalizado');
}

backfill();
