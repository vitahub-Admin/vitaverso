// Chequea supplement_tracking y manda push cuando quedan 5 o 3 días
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const STORE_URL = "https://vitahub.mx/products";

function daysRemaining(startDate, durationDays) {
  if (!startDate || !durationDays) return null;
  const elapsed = Math.floor((Date.now() - new Date(startDate)) / (1000 * 60 * 60 * 24));
  return Math.max(0, durationDays - elapsed);
}

async function sendPush(tokens, title, body, url) {
  if (!tokens.length) return;
  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    data: { url },
    sound: "default",
  }));

  await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
}

export async function sendRestockNotifications() {
  // Traer todos los trackings activos con start_date y duration_days
  const { data: rows, error } = await supabase
    .from("supplement_tracking")
    .select("shopify_customer_id, product_title, product_handle, start_date, duration_days")
    .not("start_date", "is", null)
    .not("duration_days", "is", null);

  if (error) throw new Error(error.message);

  // Agrupar por días restantes
  const at5 = [];
  const at3 = [];

  for (const row of rows ?? []) {
    const days = daysRemaining(row.start_date, row.duration_days);
    if (days === 5) at5.push(row);
    else if (days === 3) at3.push(row);
  }

  if (!at5.length && !at3.length) return { sent: 0 };

  // Obtener push tokens de los clientes afectados
  const customerIds = [...new Set([...at5, ...at3].map((r) => r.shopify_customer_id))];
  const { data: users } = await supabase
    .from("customer_app_users")
    .select("shopify_customer_id, push_token")
    .in("shopify_customer_id", customerIds)
    .not("push_token", "is", null);

  const tokenByCustomer = {};
  for (const u of users ?? []) {
    tokenByCustomer[u.shopify_customer_id] = u.push_token;
  }

  let sent = 0;

  for (const row of at5) {
    const token = tokenByCustomer[row.shopify_customer_id];
    if (!token) continue;
    const url = row.product_handle ? `${STORE_URL}/${row.product_handle}` : STORE_URL;
    await sendPush([token],
      "Te quedan 5 días de suplemento",
      `Tu ${row.product_title} se acaba pronto. ¡Reabastecete!`,
      url
    );
    sent++;
  }

  for (const row of at3) {
    const token = tokenByCustomer[row.shopify_customer_id];
    if (!token) continue;
    const url = row.product_handle ? `${STORE_URL}/${row.product_handle}` : STORE_URL;
    await sendPush([token],
      "Te quedan solo 3 días",
      `Tu ${row.product_title} está por terminarse. Comprá antes de que se agote.`,
      url
    );
    sent++;
  }

  return { sent, at5: at5.length, at3: at3.length };
}
