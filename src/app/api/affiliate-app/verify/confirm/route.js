import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const { code } = await req.json();
    if (!code) return NextResponse.json({ ok: false, error: 'Código requerido' }, { status: 400 });

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .select('verify_code, verify_code_expires_at, email_verified')
      .eq('shopify_customer_id', customerIdNum)
      .single();

    if (error || !affiliate) return NextResponse.json({ ok: false, error: 'Afiliado no encontrado' }, { status: 404 });
    if (affiliate.email_verified) return NextResponse.json({ ok: true, message: 'Ya verificado' });

    if (!affiliate.verify_code || affiliate.verify_code !== code) {
      return NextResponse.json({ ok: false, error: 'Código incorrecto' }, { status: 400 });
    }

    if (new Date(affiliate.verify_code_expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: 'El código expiró, solicitá uno nuevo' }, { status: 400 });
    }

    await supabase
      .from('affiliates')
      .update({ email_verified: true, verify_code: null, verify_code_expires_at: null })
      .eq('shopify_customer_id', customerIdNum);

    return NextResponse.json({ ok: true, message: '¡Cuenta verificada correctamente!' });
  } catch (err) {
    console.error('❌ verify/confirm:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
