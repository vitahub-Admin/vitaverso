// src/app/api/cron/route.js

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncCalendarEvents, syncCalendlyInvitees } from '@/app/services/googleCalendarService';
import { syncInviteesMatch } from '@/lib/syncInviteesMatch';
import { sendRestockNotifications } from '@/lib/restockNotifications';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function extractNumericId(gid) {
  return gid ? Number(gid.split('/').pop()) : null;
}

async function syncVariantCommissions() {
  const SHOPIFY_STORE        = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  let cursor = null;
  let hasNextPage = true;
  let total = 0;

  while (hasNextPage) {
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `query ($cursor: String) {
            products(first: 50, after: $cursor) {
              edges {
                cursor
                node {
                  id
                  variants(first: 100) {
                    edges {
                      node {
                        id
                        metafield(namespace: "custom", key: "comision_afiliado") { value }
                      }
                    }
                  }
                }
              }
              pageInfo { hasNextPage }
            }
          }`,
          variables: { cursor },
        }),
      }
    );

    const data = await res.json();
    const products = data?.data?.products?.edges || [];

    const rows = [];
    for (const { node: product, cursor: c } of products) {
      const productId = extractNumericId(product.id);
      for (const { node: variant } of product.variants.edges) {
        rows.push({
          variant_id:         extractNumericId(variant.id),
          product_id:         productId,
          commission_percent: Number(variant.metafield?.value ?? 0) || 0,
          active:             true,
          source:             'shopify',
          updated_at:         new Date().toISOString(),
        });
      }
      cursor = c;
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('product_variant_commissions')
        .upsert(rows, { onConflict: 'variant_id' });
      if (error) throw new Error(`Upsert error: ${error.message}`);
    }

    total += rows.length;
    hasNextPage = data?.data?.products?.pageInfo?.hasNextPage ?? false;
    if (hasNextPage) await new Promise(r => setTimeout(r, 300));
  }

  return { synced: total };
}

export const maxDuration = 300;

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {};

  // ── Sync Google Calendar ───────────────────────────
  try {
    results.calendar = await syncCalendarEvents();
  } catch (err) {
    console.error('❌ Sync calendar failed:', err);
    results.calendar = { error: err.message };
  }

  // ── Sync Calendly invitees ─────────────────────────
  try {
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(0, 0, 0, 0);
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
    sunday.setHours(23, 59, 59, 999);
    results.calendlyInvitees = await syncCalendlyInvitees({
      timeMin: yesterday.toISOString(),
      timeMax: sunday.toISOString(),
    });
  } catch (err) {
    console.error('❌ Sync Calendly invitees failed:', err);
    results.calendlyInvitees = { error: err.message };
  }

  // ── Re-match invitees ──────────────────────────────
  try {
    results.inviteesMatch = await syncInviteesMatch();
  } catch (err) {
    console.error('❌ Re-match invitees failed:', err);
    results.inviteesMatch = { error: err.message };
  }

  // ── Restock notifications ──────────────────────────
  try {
    results.restockNotifications = await sendRestockNotifications();
  } catch (err) {
    console.error('❌ Restock notifications failed:', err);
    results.restockNotifications = { error: err.message };
  }

  // ── Sync comisiones de variantes ───────────────────
  try {
    results.variantCommissions = await syncVariantCommissions();
    console.log(`✅ Comisiones sincronizadas: ${results.variantCommissions.synced} variantes`);
  } catch (err) {
    console.error('❌ Sync comisiones failed:', err);
    results.variantCommissions = { error: err.message };
  }

  // ── Cancelar booking appointments vencidos ─────────
  try {
    const expiryThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: cancelled, error } = await supabase
      .from('booking_appointments')
      .update({ status: 'cancelled', cancelled_reason: 'payment_timeout' })
      .eq('status', 'pending_payment')
      .lt('created_at', expiryThreshold)
      .select('id');
    if (error) throw error;
    results.bookingCleanup = { cancelled: cancelled?.length ?? 0 };
  } catch (err) {
    console.error('❌ Booking cleanup failed:', err);
    results.bookingCleanup = { error: err.message };
  }

  return NextResponse.json({ success: true, results });
}