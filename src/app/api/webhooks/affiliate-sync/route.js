// src/app/api/webhooks/affiliate-sync/route.js

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertAffiliate } from '@/app/services/vambeService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Campos que justifican un sync con Vambe
const VAMBE_RELEVANT_FIELDS = [
  'first_name', 'last_name', 'email', 'phone',
  'profession', 'city', 'state', 'status',
  'shopify_customer_id', 'shopify_collection_id', 'referral_id',
];

async function matchPendingInvitees(affiliate) {
  if (!affiliate?.email) return;

  const { error } = await supabase
    .from('scheduled_call_invitees')
    .update({ affiliate_id: affiliate.id })
    .eq('email', affiliate.email)
    .is('affiliate_id', null);

  if (error) {
    console.error('[Invitees] Error matching:', error.message);
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
    const old = payload.old_record;

    if (!affiliate?.phone) {
      return NextResponse.json({ success: true, skipped: 'no phone' });
    }

    // ── Solo procesar si cambió algo relevante para Vambe ──
    if (old) {
      const hasRelevantChange = VAMBE_RELEVANT_FIELDS.some(
        field => affiliate[field] !== old[field]
      );

      if (!hasRelevantChange) {
        return NextResponse.json({ success: true, skipped: 'no relevant fields changed' });
      }
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