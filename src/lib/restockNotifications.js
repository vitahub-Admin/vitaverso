// Avisos push de "se te está acabando" para la app de clientes.
// Corre una vez al día (/api/crons/customer-restock).
//
// Reglas:
//   · Umbrales: quedan 7 días (tiempo para que llegue el envío), 3 días y se terminó (0).
//   · Un solo push por umbral: supplement_tracking.restock_notified_days guarda el último enviado.
//   · Si el cliente pospuso (snoozed_until), se calla hasta esa fecha y ese día recibe un recordatorio.
//   · Antes de avisar se recalcula el stack con buildStack(): si ya recompró, el fin se movió
//     y no se avisa.
import { supabase, buildStack, mxDate, addDays } from "@/lib/customerSupplements";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const UMBRALES = [7, 3, 0];

function bucketFor(daysRemaining) {
  if (daysRemaining == null) return null;
  return [...UMBRALES].reverse().find((u) => daysRemaining <= u) ?? null; // 0, 3 o 7
}

function mensaje(bucket, item, esRecordatorio) {
  const nombre = item.productTitle.split("|")[0].trim();
  if (esRecordatorio) {
    return {
      title: "¿Ya reabasteciste tu suplemento?",
      body: `Te recordamos tu ${nombre}. Pídelo para no interrumpir tu protocolo.`,
    };
  }
  if (bucket === 0) {
    return {
      title: "Se terminó tu suplemento",
      body: `Tu ${nombre} ya se terminó. Pídelo de nuevo para continuar tu protocolo.`,
    };
  }
  if (bucket === 3) {
    return {
      title: "Te quedan 3 días",
      body: `Tu ${nombre} está por terminarse. Pídelo hoy para no quedarte sin él.`,
    };
  }
  return {
    title: "Te queda una semana de suplemento",
    body: `Tu ${nombre} se termina en unos 7 días. Pídelo ahora y te llega a tiempo.`,
  };
}

async function sendExpo(messages) {
  const tickets = [];
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    const json = await res.json().catch(() => ({}));
    tickets.push(...(json.data ?? messages.slice(i, i + 100).map(() => ({ status: "error" }))));
  }
  return tickets;
}

export async function sendRestockNotifications() {
  const today = mxDate();

  // Se recalcula el stack de TODOS los clientes con push: así los pedidos que se
  // entregaron (paquetería o consultorio) arrancan su seguimiento solos aunque el
  // cliente no haya abierto la app. Con pocos miles de usuarios entra en el límite
  // del cron; si crece, partir en lotes por día o disparar desde los webhooks.
  const { data: users, error } = await supabase
    .from("customer_app_users")
    .select("id, email, shopify_customer_id, push_token")
    .not("push_token", "is", null);
  if (error) throw new Error(error.message);

  const userIds = (users ?? []).map((u) => u.id);
  if (!userIds.length) return { candidatos: 0, enviados: 0 };

  const messages = [];
  const marks = []; // { trackingId, bucket, clearSnooze, userId }

  for (const user of users ?? []) {
    let stack;
    try {
      ({ supplements: stack } = await buildStack(user));
    } catch (err) {
      console.error(`[restock] no se pudo recalcular el stack de ${user.id}:`, err.message);
      continue;
    }

    for (const item of stack) {
      if (item.needsOnboarding || !item.trackingId || item.daysRemaining == null) continue;

      const snoozed = item.snoozedUntil && item.snoozedUntil > today;
      if (snoozed) continue;
      const esRecordatorio = !!item.snoozedUntil && item.snoozedUntil <= today;

      const bucket = bucketFor(item.daysRemaining);
      if (bucket == null && !esRecordatorio) continue;

      // Ya avisamos este umbral (o uno más urgente)
      const yaAvisado = item.restockNotifiedDays != null && bucket != null && item.restockNotifiedDays <= bucket;
      if (yaAvisado && !esRecordatorio) continue;
      // Terminó hace más de un día y ya le avisamos que se terminó: no insistir
      if (item.daysRemaining === 0 && item.endDate < addDays(today, -1) && !esRecordatorio) continue;

      const { title, body } = mensaje(bucket, item, esRecordatorio);
      messages.push({
        to: user.push_token,
        title,
        body,
        sound: "default",
        channelId: "default",
        data: {
          type: "restock",
          variantId: item.variantId,
          productTitle: item.productTitle,
          productHandle: item.productHandle,
          url: item.buyUrl,
        },
      });
      marks.push({ trackingId: item.trackingId, bucket: bucket ?? item.restockNotifiedDays, clearSnooze: esRecordatorio, userId: user.id });
    }
  }

  if (!messages.length) return { candidatos: userIds.length, enviados: 0 };

  const tickets = await sendExpo(messages);
  let enviados = 0;
  const tokensMuertos = new Set();

  await Promise.all(
    marks.map((m, i) => {
      const t = tickets[i];
      if (t?.status === "ok") enviados++;
      if (t?.details?.error === "DeviceNotRegistered") tokensMuertos.add(m.userId);
      // Marcamos aunque falle para no reintentar cada día con un token roto
      return supabase
        .from("supplement_tracking")
        .update({
          restock_notified_days: m.bucket,
          restock_notified_at: new Date().toISOString(),
          ...(m.clearSnooze ? { snoozed_until: null } : {}),
        })
        .eq("id", m.trackingId);
    })
  );

  if (tokensMuertos.size) {
    await supabase.from("customer_app_users").update({ push_token: null }).in("id", [...tokensMuertos]);
  }

  return { candidatos: userIds.length, mensajes: messages.length, enviados, tokensBorrados: tokensMuertos.size };
}
