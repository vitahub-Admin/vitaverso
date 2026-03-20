// src/app/api/webhooks/affiliate-sync/route.js

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertAffiliate } from '@/app/services/vambeService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);
async function matchPendingInvitees(affiliate) {
  if (!affiliate?.email) return;

  const { error } = await supabase
    .from('scheduled_call_invitees')
    .update({ affiliate_id: affiliate.id })
    .eq('email', affiliate.email)
    .is('affiliate_id', null); // solo los que no tienen match

  if (error) {
    console.error('[Invitees] Error matching:', error.message);
  } else {
    console.log(`[Invitees] Match intentado para ${affiliate.email}`);
  }
}

export async function POST(req) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const affiliate = payload.record;

    if (!affiliate?.phone) {
      return NextResponse.json({ success: true, skipped: 'no phone' });
    }

    // Sync con Vambe
    const vambeResult = await upsertAffiliate(affiliate, supabase);

    // Match invitees huérfanos
    await matchPendingInvitees(affiliate);

    return NextResponse.json({ success: true, data: vambeResult });

  } catch (error) {
    console.error('❌ webhook affiliate-sync:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}