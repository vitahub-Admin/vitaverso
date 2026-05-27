// GET /api/admin/sharecarts/base-datos
// Carritos últimos 30 días que NO convirtieron en orden,
// sin duplicados por teléfono, sin teléfonos inválidos.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function normalizePhone(phone) {
  return (phone ?? '').replace(/\D/g, '');
}

function isValidPhone(digits) {
  if (digits.length === 10) return true;                                    // local MX
  if (digits.length === 12 && digits.startsWith('52')) return true;        // +52 + 10
  if (digits.length === 13 && digits.startsWith('521')) return true;       // +521 + 10
  return false;
}

export async function GET(req) {
  const apiKey = req.headers.get('x-api-key');
  const cookieHeader = req.headers.get('cookie') ?? '';
  const hasAdminCookie = cookieHeader.includes('customerId=');

  if (apiKey !== process.env.SHARECART_API_KEY && !hasAdminCookie) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Sharecarts últimos 30 días con phone
    const { data: carts, error: cartsError } = await supabase
      .from('sharecarts')
      .select('id, phone, name, token, created_at')
      .gte('created_at', thirtyDaysAgo)
      .not('phone', 'is', null)
      .neq('phone', '')
      .order('created_at', { ascending: false });

    if (cartsError) throw cartsError;
    if (!carts?.length) return NextResponse.json({ success: true, count: 0, data: [] });

    // 2. Tokens que convirtieron a orden (todo el historial)
    const { data: convertedOrders } = await supabase
      .from('orders')
      .select('share_cart')
      .not('share_cart', 'is', null);

    const convertedTokens = new Set((convertedOrders || []).map(r => r.share_cart));

    // 3. Phones de sharecarts que convirtieron → "phones que compraron"
    const convertedCartTokens = [...convertedTokens];
    let convertedPhones = new Set();

    if (convertedCartTokens.length > 0) {
      const { data: convertedCarts } = await supabase
        .from('sharecarts')
        .select('phone')
        .in('token', convertedCartTokens)
        .not('phone', 'is', null);

      for (const c of convertedCarts || []) {
        const digits = normalizePhone(c.phone);
        if (digits) convertedPhones.add(digits);
      }
    }

    // 4. Filtrar: excluir conversiones directas y phones que ya compraron
    const pending = carts.filter(c => {
      if (convertedTokens.has(c.token)) return false;
      const digits = normalizePhone(c.phone);
      if (convertedPhones.has(digits)) return false;
      return true;
    });

    // 5. Validar teléfono — descartar números con largo incorrecto
    const validPhone = pending.filter(c => isValidPhone(normalizePhone(c.phone)));

    // 6. Deduplicar por phone normalizado — quedarse con el más reciente
    //    (ya viene ordenado desc por created_at, así que el primero que aparece es el más nuevo)
    const seen = new Set();
    const unique = [];
    for (const c of validPhone) {
      const digits = normalizePhone(c.phone);
      if (!seen.has(digits)) {
        seen.add(digits);
        unique.push(c);
      }
    }

    const data = unique.map(c => ({
      name:  c.name ?? '',
      phone: normalizePhone(c.phone),
    }));

    // Persistir en tabla para historial y seguimiento de conversiones (non-blocking)
    if (data.length > 0) {
      supabase
        .from('base_datos_exports')
        .upsert(
          data.map(c => ({
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

    return NextResponse.json({ success: true, count: data.length, data });

  } catch (err) {
    console.error('GET /api/admin/sharecarts/base-datos:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
