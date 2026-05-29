import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .select('shopify_collection_id')
      .eq('shopify_customer_id', customerIdNum)
      .single();

    if (error || !affiliate) {
      return NextResponse.json({ ok: false, error: 'Afiliado no encontrado' }, { status: 404 });
    }
    if (!affiliate.shopify_collection_id) {
      return NextResponse.json({ ok: false, error: 'Sin colección asignada' }, { status: 404 });
    }

    const collectionId = affiliate.shopify_collection_id;

    const query = `{
      collection(id: "gid://shopify/Collection/${collectionId}") {
        title
        handle
        image { src }
        presentacion: metafield(namespace: "custom", key: "presentacion") { value }
      }
    }`;

    const shopifyRes = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    const shopifyData = await shopifyRes.json();
    const col = shopifyData.data?.collection;

    if (!col) {
      return NextResponse.json({ ok: false, error: 'Colección no encontrada en Shopify' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      customerId: customerIdNum,
      collection: {
        title: col.title,
        handle: col.handle,
        imageUrl: col.image?.src || null,
        presentacion: col.presentacion?.value || '',
      },
    });
  } catch (err) {
    console.error('❌ mi-tienda GET:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
