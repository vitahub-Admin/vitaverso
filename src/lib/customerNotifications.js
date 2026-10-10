// Notificaciones de la app de clientes (Mi Vitahub).
//
// Mismo esquema que las de profesionales (affiliateNotifications.js): cada aviso se
// guarda en el historial del cliente aunque no tenga push, y el push sale por la
// Expo Push API en lotes de 100. A diferencia de las de profesionales:
//   · cada push lleva el id de su fila (notificationId) para registrar la APERTURA
//   · los envíos masivos quedan como campaña, con destinatarios/enviados/leídas/abiertas
//   · los tokens muertos (DeviceNotRegistered) se borran solos

import { supabase } from "@/lib/customerSupplements";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Solo http(s): el link termina en Linking.openURL dentro de la app. */
export function validarUrl(raw) {
  if (!raw) return null;
  const u = new URL(String(raw).trim()); // lanza si no es URL
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("La URL debe empezar con https://");
  return u.toString();
}

/**
 * A quién va un envío. `target` acepta:
 *   "all"                         todos los clientes con cuenta (tengan o no push)
 *   "con_app"                     solo los que tienen push activo
 *   "correo@x.com" | [correos]    clientes por correo
 *   { especialista: <shopifyId> } los pacientes de un profesional
 *   { usuario: <uuid> }           un cliente puntual
 * Devuelve { userIds, faltan (correos sin cuenta), audiencia (para guardar en la campaña) }.
 */
export async function resolverAudiencia(target = "all") {
  if (target === "all" || target === "con_app") {
    let q = supabase.from("customer_app_users").select("id");
    if (target === "con_app") q = q.not("push_token", "is", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { userIds: (data ?? []).map((u) => u.id), faltan: [], audiencia: { tipo: target } };
  }

  if (target && typeof target === "object" && !Array.isArray(target)) {
    if (target.especialista) {
      const { data, error } = await supabase
        .from("customer_app_users")
        .select("id")
        .eq("specialist_shopify_id", Number(target.especialista));
      if (error) throw new Error(error.message);
      return {
        userIds: (data ?? []).map((u) => u.id),
        faltan: [],
        audiencia: { tipo: "especialista", especialista: Number(target.especialista) },
      };
    }
    if (target.usuario) {
      return { userIds: [String(target.usuario)], faltan: [], audiencia: { tipo: "usuario", usuario: String(target.usuario) } };
    }
    throw new Error("target no reconocido");
  }

  const emails = (Array.isArray(target) ? target : [target])
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (!emails.length) throw new Error("target no reconocido");

  const { data, error } = await supabase.from("customer_app_users").select("id, email").in("email", emails);
  if (error) throw new Error(error.message);
  const hallados = new Set((data ?? []).map((u) => String(u.email).toLowerCase()));
  return {
    userIds: (data ?? []).map((u) => u.id),
    faltan: emails.filter((e) => !hallados.has(e)),
    audiencia: { tipo: "emails", emails },
  };
}

async function enviarLote(messages) {
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const json = await res.json().catch(() => ({}));
  return json.data ?? messages.map(() => ({ status: "error", message: `HTTP ${res.status}` }));
}

/**
 * Núcleo: guarda cada aviso en el historial del cliente y manda el push a quien tenga token.
 * items: [{ userId, title, body, data }]   (cada uno puede tener texto distinto, ej. restock)
 * @returns {{ destinatarios, enviados, sin_token, fallidos, errores, ids }}
 */
export async function enviarNotificaciones(items, { campaignId = null } = {}) {
  const resumen = { destinatarios: 0, enviados: 0, sin_token: 0, fallidos: 0, errores: [], ids: [] };
  if (!items.length) return resumen;

  const userIds = [...new Set(items.map((i) => i.userId))];
  const tokenDe = {};
  for (let i = 0; i < userIds.length; i += 500) {
    const { data } = await supabase
      .from("customer_app_users")
      .select("id, push_token")
      .in("id", userIds.slice(i, i + 500));
    for (const u of data ?? []) tokenDe[u.id] = u.push_token;
  }

  const validos = items.filter((i) => i.userId in tokenDe);
  resumen.destinatarios = validos.length;
  if (!validos.length) return resumen;

  // 1. Historial (de a 500 filas)
  const filas = [];
  for (let i = 0; i < validos.length; i += 500) {
    const { data, error } = await supabase
      .from("customer_notifications")
      .insert(
        validos.slice(i, i + 500).map((it) => ({
          user_id: it.userId,
          campaign_id: campaignId,
          title: it.title,
          body: it.body,
          data: it.data ?? {},
          push_status: tokenDe[it.userId] ? null : "no_token",
        }))
      )
      .select("id, user_id");
    if (error) throw new Error(`No se pudo guardar el historial: ${error.message}`);
    filas.push(...data);
  }
  resumen.ids = filas.map((f) => f.id);

  // 2. Push a quien tenga token, con el id de su fila para medir la apertura
  const conToken = validos
    .map((it, idx) => ({ it, fila: filas[idx] }))
    .filter(({ it }) => tokenDe[it.userId]);
  resumen.sin_token = validos.length - conToken.length;

  const enviados = [];
  const fallidos = [];
  const muertos = new Set();
  for (let i = 0; i < conToken.length; i += 100) {
    const lote = conToken.slice(i, i + 100);
    let tickets;
    try {
      tickets = await enviarLote(
        lote.map(({ it, fila }) => ({
          to: tokenDe[it.userId],
          title: it.title,
          body: it.body,
          sound: "default",
          channelId: "default",
          data: { ...(it.data ?? {}), notificationId: fila.id },
        }))
      );
    } catch (err) {
      tickets = lote.map(() => ({ status: "error", message: err.message }));
    }
    lote.forEach(({ it, fila }, k) => {
      const t = tickets[k];
      if (t?.status === "ok") {
        enviados.push(fila.id);
      } else {
        fallidos.push(fila.id);
        const motivo = t?.details?.error || t?.message || "desconocido";
        if (!resumen.errores.includes(motivo)) resumen.errores.push(motivo);
        if (t?.details?.error === "DeviceNotRegistered") muertos.add(it.userId);
      }
    });
  }
  resumen.enviados = enviados.length;
  resumen.fallidos = fallidos.length;

  for (const [ids, status] of [[enviados, "sent"], [fallidos, "failed"]]) {
    for (let i = 0; i < ids.length; i += 500) {
      await supabase.from("customer_notifications").update({ push_status: status }).in("id", ids.slice(i, i + 500));
    }
  }
  if (muertos.size) {
    await supabase.from("customer_app_users").update({ push_token: null }).in("id", [...muertos]);
  }

  return resumen;
}

/**
 * Envío masivo con campaña (admin y webhook). Mismo texto para todos.
 * @returns resumen + campaign_id
 */
export async function enviarCampana({ target = "all", title, body, url = null, evento = null, eventId = null, source = "admin", createdBy = null }) {
  const { userIds, faltan, audiencia } = await resolverAudiencia(target);
  if (!userIds.length) {
    return { ok: false, error: "No hay clientes para ese destinatario", faltan };
  }

  const { data: campana, error } = await supabase
    .from("customer_notification_campaigns")
    .insert({
      title, body, url, audience: audiencia, source, evento,
      event_id: eventId, created_by: createdBy, recipients: userIds.length,
    })
    .select("id")
    .single();
  if (error) {
    // event_id repetido: ya se mandó (reintento de la plataforma)
    if (error.code === "23505") return { ok: true, duplicado: true, mensaje: "Ese evento ya se había notificado" };
    throw new Error(error.message);
  }

  const data = { type: "admin_message", campaignId: campana.id, ...(url ? { url } : {}), ...(evento ? { evento } : {}) };
  const resumen = await enviarNotificaciones(
    userIds.map((userId) => ({ userId, title, body, data })),
    { campaignId: campana.id }
  );

  await supabase
    .from("customer_notification_campaigns")
    .update({
      recipients: resumen.destinatarios,
      sent_count: resumen.enviados,
      no_token_count: resumen.sin_token,
      failed_count: resumen.fallidos,
    })
    .eq("id", campana.id);

  const { ids, ...sinIds } = resumen;
  return { ok: true, campaign_id: campana.id, ...sinIds, ...(faltan.length ? { faltan } : {}) };
}

/** Métricas de campañas (más recientes primero). */
export async function estadisticasCampanas({ limit = 30, eventId = null, campaignId = null } = {}) {
  let q = supabase.from("customer_notification_campaign_stats").select("*").order("created_at", { ascending: false });
  if (eventId) q = q.eq("event_id", eventId);
  if (campaignId) q = q.eq("id", campaignId);
  const { data, error } = await q.limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    body: c.body,
    url: c.url,
    audience: c.audience,
    source: c.source,
    evento: c.evento,
    event_id: c.event_id,
    created_at: c.created_at,
    destinatarios: c.recipients,
    enviados: c.sent_count,
    sin_token: c.no_token_count,
    fallidos: c.failed_count,
    leidas: Number(c.read_count),
    abiertas: Number(c.opened_count),
    tasa_apertura: c.recipients ? Number((Number(c.opened_count) / c.recipients).toFixed(3)) : 0,
  }));
}
