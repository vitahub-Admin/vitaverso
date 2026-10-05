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

/**
 * Notifica a una lista de afiliados y cuenta qué pasó con cada uno.
 *
 * Las dos funciones de abajo devuelven la respuesta cruda de Expo o `null`, que
 * alcanza cuando un humano aprieta un botón y ve el resultado. Para un webhook
 * no alcanza: del otro lado hay una máquina que necesita saber si su evento
 * llegó a alguien, y "null" no distingue entre "no existe ese afiliado" y "no
 * tiene la app instalada".
 *
 * La notificación se guarda igual aunque no haya push: queda en el listado
 * dentro de la app para cuando la abra.
 *
 * @returns {{ enviados, sin_token, fallidos, destinatarios, errores }}
 */
export async function notificarAfiliados({ customerIds, title, body, data = {} }) {
  const ids = [...new Set((customerIds || []).map(Number).filter(Boolean))];
  const resumen = { enviados: 0, sin_token: 0, fallidos: 0, destinatarios: ids.length, errores: [] };
  if (!ids.length) return resumen;

  const { data: afiliados } = await supabase
    .from('affiliates')
    .select('shopify_customer_id, push_token')
    .in('shopify_customer_id', ids);

  const encontrados = afiliados || [];
  resumen.destinatarios = encontrados.length;

  if (encontrados.length) {
    try {
      await supabase.from('affiliate_notifications').insert(
        encontrados.map(a => ({ customer_id: a.shopify_customer_id, title, body, data }))
      );
    } catch (e) {
      resumen.errores.push(`no se pudo guardar en el listado: ${e.message}`);
    }
  }

  const conToken = encontrados.filter(a => a.push_token);
  resumen.sin_token = encontrados.length - conToken.length;

  // Expo acepta hasta 100 mensajes por llamada y responde un estado por cada uno
  for (let i = 0; i < conToken.length; i += 100) {
    const lote = conToken.slice(i, i + 100);
    try {
      const r = await sendBatch(lote.map(a => ({
        to: a.push_token, title, body, data, sound: 'default',
      })));
      for (const t of r?.data || []) {
        if (t.status === 'ok') resumen.enviados++;
        else {
          resumen.fallidos++;
          // DeviceNotRegistered = desinstaló la app o cambió de teléfono
          const motivo = t.details?.error || t.message || 'desconocido';
          if (!resumen.errores.includes(motivo)) resumen.errores.push(motivo);
        }
      }
    } catch (e) {
      resumen.fallidos += lote.length;
      resumen.errores.push(e.message);
    }
  }

  return resumen;
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
