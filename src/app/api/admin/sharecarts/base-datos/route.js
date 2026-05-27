// GET /api/admin/sharecarts/base-datos
// Carritos últimos 30 días que NO convirtieron en orden,
// sin duplicados por teléfono, sin teléfonos inválidos.
// Lógica de filtrado delegada al RPC get_pending_sharecarts() en Supabase.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const apiKey = req.headers.get('x-api-key');
  const cookieHeader = req.headers.get('cookie') ?? '';
  const hasAdminCookie = cookieHeader.includes('customerId=');

  if (apiKey !== process.env.SHARECART_API_KEY && !hasAdminCookie) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const isTest = searchParams.get('type') === 'test';

    const { data, error } = await supabase.rpc('get_pending_sharecarts', { p_test: isTest });
    if (error) throw error;

    const result = (data || []).map(c => ({
      name:  c.name ?? '',
      phone: c.phone,
    }));

    // En modo test no marcamos nada como exportado
    if (!isTest && result.length > 0) {
      supabase
        .from('base_datos_exports')
        .upsert(
          result.map(c => ({
            phone:            c.phone,
            name:             c.name,
            last_exported_at: new Date().toISOString(),
          })),
          { onConflict: 'phone' }
        )
        .then(({ error }) => {
          if (error) console.error('base_datos_exports upsert error:', error);
        });
    }

    return NextResponse.json({ success: true, count: result.length, data: result });

  } catch (err) {
    console.error('GET /api/admin/sharecarts/base-datos:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
