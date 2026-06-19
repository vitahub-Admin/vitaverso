import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// GET — últimas 30 notificaciones del afiliado
export async function GET(req) {
  try {
    const customerId = await resolveCustomerId(req);
    if (!customerId) return unauthorized();

    const { data, error } = await supabase
      .from('affiliate_notifications')
      .select('id, title, body, data, read_at, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    return NextResponse.json({ ok: true, notifications: data || [] });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// PATCH — marcar todas como leídas
export async function PATCH(req) {
  try {
    const customerId = await resolveCustomerId(req);
    if (!customerId) return unauthorized();

    const { error } = await supabase
      .from('affiliate_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('customer_id', customerId)
      .is('read_at', null);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
