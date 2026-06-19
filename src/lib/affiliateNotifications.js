import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendBatch(messages) {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  return res.json();
}

export async function sendPushToAffiliate(shopifyCustomerId, title, body, data = {}) {
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('push_token')
    .eq('shopify_customer_id', shopifyCustomerId)
    .single();

  try {
    await supabase.from('affiliate_notifications').insert([{
      customer_id: shopifyCustomerId,
      title,
      body,
      data,
    }]);
  } catch {}

  if (!affiliate?.push_token) return null;

  return sendBatch([{ to: affiliate.push_token, title, body, data, sound: 'default' }]);
}

export async function broadcastToAffiliates(title, body, data = {}) {
  const { data: affiliates } = await supabase
    .from('affiliates')
    .select('shopify_customer_id, push_token')
    .not('push_token', 'is', null);

  if (!affiliates?.length) return null;

  const notifRows = affiliates.map((a) => ({
    customer_id: a.shopify_customer_id,
    title,
    body,
    data,
  }));
  try {
    await supabase.from('affiliate_notifications').insert(notifRows);
  } catch {}

  const tokens = affiliates.map((a) => a.push_token).filter(Boolean);
  const results = [];

  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100).map((to) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
    }));
    results.push(await sendBatch(batch));
  }

  return results;
}
