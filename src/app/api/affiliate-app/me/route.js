import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyCustomerToken, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const FIELD_MAP = {
  nombre: 'first_name',
  apellido: 'last_name',
  telefono: 'phone',
  red_social: 'social_media',
  clabe: 'clabe_interbancaria',
  direccion: 'address',
  ciudad: 'city',
  estado: 'state',
};

export async function GET(req) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);

  const { data, error } = await supabase
    .from('affiliates')
    .select('first_name, last_name, email, phone, social_media, clabe_interbancaria, city, state, address, profession, status, email_verified')
    .eq('shopify_customer_id', shopifyCustomerId)
    .single();

  if (error?.code === 'PGRST116') {
    return NextResponse.json({ ok: false, error: 'Afiliado no encontrado' }, { status: 404 });
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    affiliate: {
      nombre: data.first_name || '',
      apellido: data.last_name || '',
      email: data.email || '',
      telefono: data.phone || '',
      red_social: data.social_media || '',
      clabe: data.clabe_interbancaria || '',
      direccion: data.address || '',
      ciudad: data.city || '',
      estado: data.state || '',
      profesion: data.profession || '',
      status: data.status || '',
      email_verified: !!data.email_verified,
    },
  });
}

export async function PATCH(req) {
  const decoded = verifyCustomerToken(req);
  if (!decoded) return unauthorized();

  const shopifyCustomerId = Number(decoded.userId);
  const body = await req.json();
  const { updates } = body;

  if (!updates || Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No hay datos para actualizar' }, { status: 400 });
  }

  const supabaseUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (FIELD_MAP[key]) supabaseUpdates[FIELD_MAP[key]] = value;
  }

  if (supabaseUpdates.clabe_interbancaria && !/^\d{18}$/.test(supabaseUpdates.clabe_interbancaria)) {
    return NextResponse.json(
      { ok: false, error: 'La CLABE debe tener exactamente 18 dígitos' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('affiliates')
    .update(supabaseUpdates)
    .eq('shopify_customer_id', shopifyCustomerId)
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    affiliate: {
      nombre: data.first_name,
      apellido: data.last_name,
      email: data.email,
      telefono: data.phone,
      red_social: data.social_media,
      clabe: data.clabe_interbancaria,
      ciudad: data.city,
      estado: data.state,
    },
  });
}
