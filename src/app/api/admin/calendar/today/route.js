// src/app/api/onboarding/today/route.js

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD, opcional

    // Rango del día en México (UTC-6)
    const mexicoOffset = -6 * 60;
    const base = dateParam
      ? new Date(`${dateParam}T12:00:00Z`) // mediodía UTC → fecha correcta en MX
      : new Date();

    const mexicoNow = new Date(base.getTime() + (mexicoOffset - base.getTimezoneOffset()) * 60000);

    const startOfDay = new Date(mexicoNow);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(mexicoNow);
    endOfDay.setHours(23, 59, 59, 999);

    // Traer eventos de hoy con sus invitees y el perfil del afiliado
    const { data: calls, error } = await supabase
      .from('scheduled_calls')
      .select(`
        id,
        google_event_id,
        event_name,
        event_type,
        source,
        meet_link,
        starts_at,
        ends_at,
        status,
        scheduled_call_invitees (
          id,
          email,
          name,
          status,
          attended,
          notes,
          affiliate_id,
          affiliates (
            id,
            first_name,
            last_name,
            email,
            phone,
            profession,
            city,
            state,
            vambe_contact_id
          )
        )
      `)
      .gte('starts_at', startOfDay.toISOString())
      .lte('starts_at', endOfDay.toISOString())
      .not('meet_link', 'is', null)
      .order('starts_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data: calls });

  } catch (error) {
    console.error('❌ GET /api/onboarding/today:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}