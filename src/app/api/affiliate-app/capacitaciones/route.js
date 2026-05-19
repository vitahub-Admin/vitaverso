import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyCustomerToken, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);

  const [capacitacionesRes, inscripcionesRes] = await Promise.all([
    supabase
      .from('capacitaciones')
      .select('id, title, description, event_date, event_time, image_url, link')
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true }),
    supabase
      .from('capacitacion_inscripciones')
      .select('capacitacion_id')
      .eq('customer_id', shopifyCustomerId),
  ]);

  if (capacitacionesRes.error) {
    return NextResponse.json({ ok: false, error: capacitacionesRes.error.message }, { status: 500 });
  }

  const enrolledIds = new Set((inscripcionesRes.data || []).map((i) => i.capacitacion_id));

  const data = (capacitacionesRes.data || []).map((c) => ({
    ...c,
    inscripto: enrolledIds.has(c.id),
  }));

  return NextResponse.json({ ok: true, data });
}
