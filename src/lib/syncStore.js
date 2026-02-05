import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


async function fetchCollection(collectionId) {
  const query = `
    {
      collection(id: "gid://shopify/Collection/${collectionId}") {
        id
        image { src }
        products(first: 5) {
          edges { node { id } }
        }
      }
    }
  `;

  try {
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    const data = await res.json();
    const collection = data?.data?.collection;

    if (!collection) return false;

    const hasImage = Boolean(collection.image?.src);
    const hasProducts = (collection.products?.edges?.length ?? 0) > 0;

    return hasImage || hasProducts;
  } catch (err) {
    console.error('❌ Error fetch collection', collectionId, err);
    return false;
  }
}

/* MAIN JOB                                       */

export async function syncActiveStore() {
  console.log('🔹 Iniciando sync de active_store...');

  const { data: affiliates, error } = await supabase
    .from('affiliates')
    .select('id, shopify_collection_id')
    .not('shopify_collection_id', 'is', null);

  if (error) {
    console.error('❌ Error al traer afiliados:', error);
    throw error;
  }

  console.log(`🔹 ${affiliates.length} afiliados encontrados`);

  let updated = 0;

  for (const aff of affiliates) {
    try {
      const status = await fetchCollection(aff.shopify_collection_id);

      const { error: updateError } = await supabase
        .from('affiliates')
        .update({ active_store: status })
        .eq('id', aff.id);

      if (updateError) {
        console.error(`❌ Error affiliate ${aff.id}:`, updateError);
      } else {
        updated++;
        console.log(`✅ ${aff.id}: active_store = ${status}`);
      }

      // anti rate-limit Shopify
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`💥 Error procesando affiliate ${aff.id}`, err);
    }
  }

  console.log('✅ Sync completado');

  return {
    total: affiliates.length,
    updated,
  };
}
