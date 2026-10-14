import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function DELETE(req, { params }) {
  try {
    const customerId = await resolveCustomerId(req);
    if (!customerId) return unauthorized();

    // Next 15+: params es una promesa. Con params.id directo llegaba undefined y no
    // se borraba nada (respondía ok igual).
    const { id } = await params;

    const { error } = await supabase
      .from('affiliate_notifications')
      .delete()
      .eq('id', id)
      .eq('customer_id', customerId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
