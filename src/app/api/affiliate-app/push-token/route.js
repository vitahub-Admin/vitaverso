import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyCustomerToken, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Token requerido' }, { status: 400 });
  }

  const { error } = await supabase
    .from('affiliates')
    .update({ push_token: token })
    .eq('shopify_customer_id', shopifyCustomerId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
