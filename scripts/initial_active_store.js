// scripts/initial_active_store.js
import 'dotenv/config'; // carga variables del .env automáticamente
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Inicializamos Supabase con Service Role para update seguro
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Función para consultar Shopify Collection
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
      const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
  
      const data = await res.json();
      const collection = data?.data?.collection;
  
      if (!collection) return false; // BOOLEAN
  
      const hasImage = !!collection.image?.src;
      const hasProducts = (collection.products?.edges?.length ?? 0) > 0;
  
      return hasImage || hasProducts; // BOOLEAN true/false
    } catch (err) {
      console.error("❌ Error fetch collection", collectionId, err.message);
      return false; // BOOLEAN
    }
  }
  

async function main() {
  console.log('🔹 Iniciando primer seteo de active_store...');

  // 1️⃣ Traemos todos los afiliados con shopify_collection_id
  const { data: affiliates, error } = await supabase
  .from("affiliates")
  .select("id, shopify_collection_id")
  .not('shopify_collection_id', 'is', null);


  if (error) {
    console.error('❌ Error al traer afiliados:', error);
    return;
  }

  console.log(`🔹 Encontrados ${affiliates.length} afiliados con collection_id`);

  // 2️⃣ Iteramos y consultamos Shopify
  for (const aff of affiliates) {
    const status = await fetchCollection(aff.shopify_collection_id);

    const { error: updateError } = await supabase
      .from('affiliates')
      .update({ active_store: status })
      .eq('id', aff.id);

    if (updateError) {
      console.error(`❌ Error actualizando affiliate ${aff.id}:`, updateError);
    } else {
      console.log(`${aff.id}: active_store = ${status}`);
    }
  }

  console.log('✅ Primer seteo completado');
}

// Ejecutamos
main().catch(err => {
  console.error('❌ Error en script:', err);
});
