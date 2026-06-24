import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

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
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const { data, error } = await supabase
      .from('affiliates')
      .select('first_name, last_name, email, phone, social_media, clabe_interbancaria, city, state, address, shopify_collection_id, profession, status, email_verified')
      .eq('shopify_customer_id', customerIdNum)
      .single();

    if (error?.code === 'PGRST116') {
      return NextResponse.json({ success: false, ok: false, message: 'Afiliado no encontrado' }, { status: 404 });
    }
    if (error) throw error;

    return NextResponse.json({
      success: true,
      ok: true,
      data: {
        nombre: data.first_name || '',
        apellido: data.last_name || '',
        email: data.email || '',
        telefono: data.phone || '',
        red_social: data.social_media || '',
        clabe: data.clabe_interbancaria || '',
        direccion: data.address || '',
        ciudad: data.city || '',
        estado: data.state || '',
        shopify_collection_id: data.shopify_collection_id || null,
        profesion: data.profession || '',
        status: data.status || '',
        email_verified: !!data.email_verified,
      },
      // alias para compatibilidad con la app móvil
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
      _debug: { customer_id_used: customerIdNum },
    });
  } catch (error) {
    console.error('❌ Error en GET /api/affiliates/profile:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const body = await req.json();
    const { updates } = body;

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: 'No hay datos para actualizar' }, { status: 400 });
    }

    const supabaseUpdates = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (FIELD_MAP[key]) supabaseUpdates[FIELD_MAP[key]] = value;
    });

    if (supabaseUpdates.clabe_interbancaria && !/^\d{18}$/.test(supabaseUpdates.clabe_interbancaria)) {
      return NextResponse.json({ success: false, message: 'La CLABE debe tener exactamente 18 dígitos numéricos' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('affiliates')
      .update(supabaseUpdates)
      .eq('shopify_customer_id', customerIdNum)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      ok: true,
      message: 'Perfil actualizado correctamente',
      data: {
        nombre: data.first_name,
        apellido: data.last_name,
        email: data.email,
        telefono: data.phone,
        red_social: data.social_media,
        clabe: data.clabe_interbancaria,
      },
    });
  } catch (error) {
    console.error('❌ Error en PATCH /api/affiliates/profile:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
