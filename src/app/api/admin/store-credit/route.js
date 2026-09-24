import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId } from '@/lib/customerAppAuth';
import { esAdmin } from '@/lib/adminIds';
import { crearCuponDeCredito } from '@/lib/storeCredit';
import { sendPushToAffiliate } from '@/lib/affiliateNotifications';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const STORE_FRONT_URL = 'https://vitahub.mx/discount';
const MONTO_MAXIMO = 2000;   // tope de seguridad: un cero de más no regala una fortuna

/**
 * POST /api/admin/store-credit
 * Regala crédito de tienda a un afiliado: genera el cupón en Shopify en el
 * momento y se lo deja disponible en su app.
 *
 * body: { affiliateId, amount, note? }
 *
 * No toca el saldo de puntos: es un regalo de Vitahub, no dinero que el
 * afiliado ganó. Por eso tampoco se puede retirar por transferencia — la
 * única forma de usarlo es comprando en la tienda, que es el punto.
 */
export async function POST(req) {
  try {
    const sesion = await resolveCustomerId(req);
    if (!esAdmin(sesion)) {
      return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 403 });
    }

    const body = await req.json();
    const affiliateId = String(body.affiliateId || '').trim();
    const amount      = Number(body.amount);
    const note        = (body.note || '').trim();

    if (!affiliateId) {
      return NextResponse.json({ success: false, message: 'Falta el afiliado' }, { status: 400 });
    }
    if (!amount || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, message: 'Monto inválido' }, { status: 400 });
    }
    if (amount > MONTO_MAXIMO) {
      return NextResponse.json(
        { success: false, message: `El máximo por cupón es $${MONTO_MAXIMO}` },
        { status: 400 }
      );
    }

    // El afiliado tiene que existir: un ID mal tipeado generaría un cupón fantasma
    const { data: afiliado } = await supabase
      .from('affiliates')
      .select('shopify_customer_id, first_name, last_name')
      .eq('shopify_customer_id', affiliateId)
      .maybeSingle();

    if (!afiliado) {
      return NextResponse.json({ success: false, message: 'Afiliado no encontrado' }, { status: 404 });
    }

    const nombre = `${afiliado.first_name || ''} ${afiliado.last_name || ''}`.trim();

    // 1. El cupón en Shopify
    const { code, priceRuleId } = await crearCuponDeCredito({
      monto:  amount,
      titulo: `Crédito Vitahub — ${nombre || affiliateId}`,
    });

    // 2. Queda registrado como canje ya aprobado, para que aparezca en su app
    //    junto con los que pidió él. `source: admin_gift` lo distingue.
    const { data: registro, error: regErr } = await supabase
      .from('point_exchanges')
      .insert([{
        customer_id:       affiliateId,
        points_requested:  amount,
        exchange_type:     'store_credit',
        status:            'approved',
        processed_at:      new Date().toISOString(),
        processed_by_type: 'admin',
        admin_note:        note || 'Crédito otorgado por Vitahub',
        metadata: {
          source:        'admin_gift',
          request_type:  'store_credit',
          discount_code: code,
          price_rule_id: priceRuleId,
          credit_amount: amount,
          otorgado_por:  String(sesion),
        },
      }])
      .select()
      .single();

    if (regErr) throw regErr;

    // 3. Avisarle (no bloquea: el cupón ya existe)
    sendPushToAffiliate(
      affiliateId,
      '¡Tienes crédito! 🎁',
      `Vitahub te regaló $${amount} MXN para tu próxima compra. Código: ${code}`,
      { type: 'store_credit_ready', code, exchangeId: registro?.id }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      code,
      url: `${STORE_FRONT_URL}/${code}`,
      amount,
      exchange_id: registro?.id,
    }, { status: 201 });

  } catch (err) {
    console.error('❌ POST admin/store-credit:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
