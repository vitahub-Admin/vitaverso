import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

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

    await resend.emails.send({
      from: 'Vitahub Pro <noreply@pro.vitahub.mx>',
      to: affiliate.email,
      subject: 'Tu código de verificación',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
          <img src="https://vitahub.mx/logo.png" alt="Vitahub" style="height:40px;margin-bottom:24px" />
          <h2 style="color:#1b3f7a;margin:0 0 8px">Hola, ${affiliate.first_name}</h2>
          <p style="color:#555;margin:0 0 24px">Tu código de verificación para Vitahub Pro es:</p>
          <div style="background:#1b3f7a;color:#fff;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;border-radius:10px">
            ${code}
          </div>
          <p style="color:#999;font-size:12px;margin-top:24px">Este código expira en 15 minutos. Si no solicitaste esto, ignorá este mensaje.</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, message: 'Código enviado al email registrado' });
  } catch (err) {
    console.error('❌ verify/request:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
