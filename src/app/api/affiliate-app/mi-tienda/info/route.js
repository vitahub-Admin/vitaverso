import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function PATCH(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const { title } = await req.json();
    if (!title?.trim()) {
      return NextResponse.json({ ok: false, error: 'El título es requerido' }, { status: 400 });
    }

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .select('shopify_collection_id')
      .eq('shopify_customer_id', customerIdNum)
      .single();

    if (error || !affiliate?.shopify_collection_id) {
      return NextResponse.json({ ok: false, error: 'Colección no encontrada' }, { status: 404 });
    }

    const collectionId = affiliate.shopify_collection_id;

    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2024-04/custom_collections/${collectionId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ custom_collection: { id: collectionId, title: title.trim() } }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(JSON.stringify(err.errors ?? err));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ mi-tienda/info PATCH:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
