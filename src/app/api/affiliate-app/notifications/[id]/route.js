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

    const { error } = await supabase
      .from('affiliate_notifications')
      .delete()
      .eq('id', params.id)
      .eq('customer_id', customerId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
