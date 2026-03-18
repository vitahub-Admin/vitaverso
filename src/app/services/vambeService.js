// services/vambeService.js

const VAMBE_API_URL = 'https://api.vambe.me/api/public';
const VAMBE_PIPELINE_ID = 'e62197d9-4933-4ad9-87d2-64fe03166ef5';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-api-key': process.env.VAMBE_API_KEY,
});

// ─── SHOPIFY: obtener handle de la collection ──────────────────────────────

async function getCollectionHandle(collectionId) {
  if (!collectionId) return null;

  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/collections/${collectionId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
    }
  );

  if (!res.ok) {
    console.warn(`[Shopify] No se pudo obtener collection ${collectionId} [${res.status}]`);
    return null;
  }

  const { collection } = await res.json();
  return collection.handle ?? null;
}


// ─── VAMBE: construir URL del chat ─────────────────────────────────────────

export function getVambeUrl(vambeContactId) {
  if (!vambeContactId) return null;
  return `https://app.vambeai.com/pipeline?id=${VAMBE_PIPELINE_ID}&chatContactId=${vambeContactId}`;
}


// ─── VAMBE: upsert afiliado ────────────────────────────────────────────────

export async function upsertAffiliate(affiliate, supabase) {
  // El teléfono es requerido para WhatsApp
  if (!affiliate.phone) {
    console.warn(`[Vambe] Afiliado ${affiliate.id} sin teléfono, se omite upsert`);
    return null;
  }

  // Paso intermedio: obtener store handle desde Shopify
  const storeHandle = await getCollectionHandle(affiliate.shopify_collection_id);

  // Armar body del request
  const body = {
    channel: 'whatsapp',
    channel_phone_number: process.env.VAMBE_CHANNEL_PHONE,
    contact_phone_number: affiliate.phone,
    contact_name: [affiliate.first_name, affiliate.last_name]
      .filter(Boolean)
      .join(' '),
    contact_email: affiliate.email ?? undefined,

// En vambeService.js, la sección custom_field_values queda así:

custom_field_values: [
  { key: 'affiliate_email',     value: affiliate.email },
  { key: 'store_handle',        value: storeHandle },
  { key: 'profession',          value: affiliate.profession },
  { key: 'city',                value: affiliate.city },
  { key: 'state',               value: affiliate.state },
  { key: 'shopify_customer_id', value: String(affiliate.shopify_customer_id) },
].filter(f => f.value != null && f.value !== ''),

    meta_data: {
      source: 'plataforma-afiliados',
      address: affiliate.address ?? null,
      updatedAt: new Date().toISOString(),
    },
  };

  // Llamada a Vambe
  const res = await fetch(`${VAMBE_API_URL}/customer/upsert/info`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(`[Vambe] upsert failed [${res.status}]: ${JSON.stringify(error)}`);
  }

  const contact = await res.json();

  // Guardar vambe_contact_id en Supabase
  if (supabase) {
    const { error: dbError } = await supabase
      .from('affiliates')
      .update({ vambe_contact_id: contact.id })
      .eq('id', affiliate.id);

    if (dbError) {
      console.error('[Vambe] Error guardando vambe_contact_id:', dbError.message);
    }
  }

  return {
    vambeContactId: contact.id,
    vambeUrl: getVambeUrl(contact.id),
  };
}