import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';
import { sendPushToAffiliate } from '@/lib/affiliateNotifications';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const SHOPIFY_STORE   = process.env.SHOPIFY_STORE;         // 7798ab-86.myshopify.com
const SHOPIFY_TOKEN   = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VER = '2024-01';
const SHOPIFY_BASE    = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VER}`;
const STORE_FRONT_URL = 'https://vitahub.mx/discount';

const MIN_AMOUNT = 200;

function randomCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `VH-${code}`;
}

async function shopifyPost(path, body) {
  const res = await fetch(`${SHOPIFY_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.errors ?? json));
  return json;
}

async function getCodeUsageCount(code) {
  try {
    const res = await fetch(
      `${SHOPIFY_BASE}/discount_codes/lookup.json?code=${encodeURIComponent(code)}`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data.discount_code?.usage_count ?? 0;
  } catch {
    return 0;
  }
}

// ─── GET — fetch approved store_credit codes for this affiliate ───────────────
export async function GET(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const { data, error } = await supabase
      .from('point_exchanges')
      .select('id, points_requested, status, metadata, requested_at, processed_at')
      .eq('customer_id', customerIdNum)
      .eq('exchange_type', 'store_credit')
      .eq('status', 'approved')
      .order('processed_at', { ascending: false });

    if (error) throw error;

    const exchanges = (data || []).filter((ex) => ex.metadata?.discount_code);

    const codes = await Promise.all(
      exchanges.map(async (ex) => {
        const usage = await getCodeUsageCount(ex.metadata.discount_code);
        return {
          id: ex.id,
          amount: Number(ex.metadata?.credit_amount ?? ex.points_requested),
          code: ex.metadata.discount_code,
          url: `${STORE_FRONT_URL}/${ex.metadata.discount_code}`,
          requested_at: ex.requested_at,
          processed_at: ex.processed_at,
          used: usage > 0,
        };
      })
    );

    return NextResponse.json({ ok: true, codes });
  } catch (err) {
    console.error('❌ GET store-credit:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// ─── POST — request & auto-create store credit discount ──────────────────────
export async function POST(req) {
  let exchangeId = null;

  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const body = await req.json();
    const amount = Number(body.points_requested ?? body.amount ?? 0);

    if (!amount || amount < MIN_AMOUNT) {
      return NextResponse.json({ ok: false, error: `El mínimo es $${MIN_AMOUNT}` }, { status: 400 });
    }

    // Check no pending exchange
    const { data: pending } = await supabase
      .from('point_exchanges')
      .select('id')
      .eq('customer_id', customerIdNum)
      .eq('status', 'pending')
      .limit(1);

    if (pending?.length > 0) {
      return NextResponse.json({ ok: false, error: 'Ya tenés una solicitud pendiente' }, { status: 400 });
    }

    // Check balance
    const { data: txs } = await supabase
      .from('point_transactions_live')
      .select('points, direction')
      .eq('customer_id', customerIdNum)
      .eq('status', 'confirmed');

    let totalIn = 0;
    let totalOut = 0;
    for (const tx of txs || []) {
      const val = Number(tx.points);
      if (tx.direction === 'IN') totalIn += val;
      if (tx.direction === 'OUT') totalOut += val;
    }

    if (amount > totalIn - totalOut) {
      return NextResponse.json({ ok: false, error: 'Saldo insuficiente' }, { status: 400 });
    }

    // 1. Create pending exchange
    const { data: exchange, error: exErr } = await supabase
      .from('point_exchanges')
      .insert([{
        customer_id: customerIdNum,
        points_requested: amount,
        exchange_type: 'store_credit',
        status: 'pending',
        affiliate_note: body.note || null,
        metadata: { source: 'affiliate_app', request_type: 'store_credit' },
      }])
      .select()
      .single();

    if (exErr) throw exErr;
    exchangeId = exchange.id;

    const { data: bonusSetting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'store_credit_bonus_rate')
      .maybeSingle();
    const bonusRate = Number(bonusSetting?.value ?? 0.05);

    const creditAmount = +(amount * (1 + bonusRate)).toFixed(2);
    const bonusAmount  = +(amount * bonusRate).toFixed(2);
    const code = randomCode();

    // 2. Create Shopify price rule
    const { price_rule } = await shopifyPost('/price_rules.json', {
      price_rule: {
        title: `Crédito afiliado ${code}`,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        value_type: 'fixed_amount',
        value: `-${creditAmount}`,
        customer_selection: 'all',
        once_per_customer: true,
        usage_limit: 1,
        starts_at: new Date().toISOString(),
        combines_with: {
          order_discounts: true,
          product_discounts: true,
          shipping_discounts: true,
        },
      },
    });

    // 3. Create Shopify discount code
    await shopifyPost(`/price_rules/${price_rule.id}/discount_codes.json`, {
      discount_code: { code },
    });

    // 4. Approve exchange and save metadata
    const { error: updateErr } = await supabase
      .from('point_exchanges')
      .update({
        status: 'approved',
        processed_at: new Date().toISOString(),
        processed_by_type: 'system',
        metadata: {
          source: 'affiliate_app',
          request_type: 'store_credit',
          discount_code: code,
          price_rule_id: price_rule.id,
          credit_amount: creditAmount,
          bonus_rate: bonusRate,
          bonus_amount: bonusAmount,
        },
      })
      .eq('id', exchangeId);

    if (updateErr) throw updateErr;

    // 5. OUT transaction (costo del canje)
    const { error: txErr } = await supabase
      .from('point_transactions_live')
      .insert([{
        customer_id: customerIdNum,
        points: amount,
        direction: 'OUT',
        category: 'exchange',
        status: 'confirmed',
        reference_id: String(exchangeId),
        reference_type: 'point_exchange',
        description: `Crédito en tienda — ${code}`,
        actor_type: 'system',
      }]);

    if (txErr) throw txErr;

    // 6. Push notification (non-blocking)
    sendPushToAffiliate(
      customerIdNum,
      '¡Crédito listo! 🎁',
      `Tu crédito de $${creditAmount} MXN está disponible. Código: ${code}`,
      { type: 'store_credit_ready', code, exchangeId }
    ).catch(() => {});

    return NextResponse.json({
      ok: true,
      code,
      url: `${STORE_FRONT_URL}/${code}`,
      amount: creditAmount,
      exchange_id: exchangeId,
    }, { status: 201 });

  } catch (err) {
    console.error('❌ POST store-credit:', err);

    // If exchange was created but Shopify failed, reject it
    if (exchangeId) {
      await supabase
        .from('point_exchanges')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
          admin_note: `Error automático: ${err.message?.slice(0, 200)}`,
        })
        .eq('id', exchangeId);
    }

    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
