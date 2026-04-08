// POST /api/admin/sharecarts/recovery
// Recibe { from, to } en formato YYYY-MM-DD desde N8N.
// Devuelve carritos pendientes que NO convirtieron a orden, y los marca como exportados.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { BigQuery } from '@google-cloud/bigquery';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export async function GET() {
  const { data } = await supabase
    .from('sharecarts')
    .select('recovery_exported_at')
    .not('recovery_exported_at', 'is', null)
    .order('recovery_exported_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ last_export: data?.recovery_exported_at ?? null });
}

export async function POST(req) {
  try {
    const { from, to } = await req.json();

    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: 'Se requieren los parámetros from y to (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // 1. Traer sharecarts del rango con phone, no exportados aún
    const { data: carts, error: cartsError } = await supabase
      .from('sharecarts')
      .select('id, phone, name, token, owner_id, created_at')
      .gte('created_at', `${from}T00:00:00Z`)
      .lte('created_at', `${to}T23:59:59Z`)
      .not('phone', 'is', null)
      .neq('phone', '')
      .is('recovery_exported_at', null)
      .order('created_at', { ascending: true });

    if (cartsError) throw cartsError;
    if (!carts?.length) {
      return NextResponse.json({ success: true, count: 0, data: [] });
    }

    // 2. Traer tokens que ya convirtieron a orden en BigQuery (desde `from` hasta hoy)
    const bqQuery = `
      SELECT DISTINCT share_cart
      FROM \`vitahub-435120.silver.orders\`
      WHERE share_cart IS NOT NULL
        AND TIMESTAMP_TRUNC(created_at, DAY) >= TIMESTAMP(@from)
    `;

    const [bqRows] = await bigquery.query({
      query:    bqQuery,
      location: 'us-east1',
      params:   { from },
    });

    const convertedTokens = new Set(bqRows.map(r => r.share_cart));

    // 3. LEFT JOIN: quedarse solo con los que NO convirtieron
    const filtered = carts.filter(c => !convertedTokens.has(c.token));

    // 3b. Deduplicar por phone: quedarse con el sharecart más nuevo por número
    const latestByPhone = new Map();
    for (const c of filtered) {
      const existing = latestByPhone.get(c.phone);
      if (!existing || c.created_at > existing.created_at) {
        latestByPhone.set(c.phone, c);
      }
    }
    const pendingCarts = [...latestByPhone.values()];

    if (!pendingCarts.length) {
      return NextResponse.json({ success: true, count: 0, data: [] });
    }

    // 4. Traer nombres de especialistas por owner_id
    const ownerIds = [...new Set(pendingCarts.map(c => c.owner_id).filter(Boolean))];

    const { data: affiliates } = await supabase
      .from('affiliates')
      .select('shopify_customer_id, first_name, last_name')
      .in('shopify_customer_id', ownerIds);

    const affiliateMap = {};
    affiliates?.forEach(a => {
      affiliateMap[a.shopify_customer_id] = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
    });

    // 5. Marcar como exportados TODOS los filtered (incluyendo duplicados de phone)
    const allFilteredIds = filtered.map(c => c.id);
    const { error: updateError } = await supabase
      .from('sharecarts')
      .update({ recovery_exported_at: new Date().toISOString() })
      .in('id', allFilteredIds);

    if (updateError) throw updateError;

    // 6. Formatear respuesta para N8N
    const data = pendingCarts.map(c => ({
      phone:      c.phone,
      name:       c.name ?? '',
      specialist: affiliateMap[c.owner_id] ?? '',
      url_params: `${c.token}&sref=${c.owner_id}`,
      created_at: c.created_at,
    }));

    return NextResponse.json({ success: true, count: data.length, data });

  } catch (err) {
    console.error('❌ POST /api/admin/sharecarts/recovery:', err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
