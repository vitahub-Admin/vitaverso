// src/app/api/webhooks/affiliate-sync/route.js

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertAffiliate } from '@/app/services/vambeService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    // Validar secret de Supabase
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();

    // Supabase envía { type, table, record, old_record }
    const affiliate = payload.record;

    // Solo procesar si tiene teléfono
    if (!affiliate?.phone) {
      return NextResponse.json({ success: true, skipped: 'no phone' });
    }

    const result = await upsertAffiliate(affiliate, supabase);

    return NextResponse.json({ success: true, data: result });

  } catch (error) {
    console.error('❌ webhook affiliate-sync:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}