import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyCustomerToken, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req, context) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);
  const { id } = await context.params;

  // Verificar que la capacitación existe
  const { data: cap, error: capError } = await supabase
    .from('capacitaciones')
    .select('id, title')
    .eq('id', id)
    .single();

  if (capError || !cap) {
    return NextResponse.json({ ok: false, error: 'Capacitación no encontrada' }, { status: 404 });
  }

  const { error } = await supabase
    .from('capacitacion_inscripciones')
    .insert([{ capacitacion_id: id, customer_id: shopifyCustomerId }]);

  if (error?.code === '23505') {
    return NextResponse.json({ ok: false, error: 'Ya estás inscripto' }, { status: 409 });
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, message: `Inscripto a "${cap.title}"` }, { status: 201 });
}

export async function DELETE(req, context) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);
  const { id } = await context.params;

  const { error } = await supabase
    .from('capacitacion_inscripciones')
    .delete()
    .eq('capacitacion_id', id)
    .eq('customer_id', shopifyCustomerId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
