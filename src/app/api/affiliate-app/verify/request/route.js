import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const N8N_WEBHOOK = 'https://vitahub1.app.n8n.cloud/webhook/27419b17-55d8-4121-ac41-20fd71cef515';

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .select('email, first_name, email_verified')
      .eq('shopify_customer_id', customerIdNum)
      .single();

    if (error || !affiliate) return NextResponse.json({ ok: false, error: 'Afiliado no encontrado' }, { status: 404 });
    if (affiliate.email_verified) return NextResponse.json({ ok: false, error: 'La cuenta ya está verificada' }, { status: 400 });

    const code    = generateCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase
      .from('affiliates')
      .update({ verify_code: code, verify_code_expires_at: expires })
      .eq('shopify_customer_id', customerIdNum);

    // Disparar n8n
    await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:  affiliate.email,
        nombre: affiliate.first_name,
        code,
      }),
    });

    return NextResponse.json({ ok: true, message: 'Código enviado al email registrado' });
  } catch (err) {
    console.error('❌ verify/request:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
