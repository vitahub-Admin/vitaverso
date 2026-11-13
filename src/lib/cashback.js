// Cashback por compra (Buen Fin 2026 y las promos que vengan): una compra pagada dentro de las
// fechas de la promo le deja al cliente un cupón para su PRÓXIMO pedido, según el monto:
//   $1,000 → $50 · $1,500 → $100 · $2,000 → $150 (no acumulables: solo el escalón más alto)
//
// El monto que cuenta es el de los productos a precio de lista, sin restar descuentos ni sumar
// el envío: 1,490 en productos, 700 de descuento y 100 de envío → escalón de 1,000 → $50.
//
// La promo se configura en Supabase (tabla promo_cashback, supabase/migrations/promo_cashback.sql):
// se prende y se apaga con `activo`, sin subir código. El cupón queda en customer_discounts
// por correo: aunque el cliente todavía no tenga la app, lo ve al entrar con ese correo.
//
// Lo llama el webhook de órdenes (api/webhooks/shopify): otorgarCashback con la orden pagada,
// anularCashback si se cancela o se reembolsa entera (solo si el cupón no se usó).
import { Resend } from "resend";
import { supabase } from "@/lib/customerSupplements";
import { otorgarDescuento, anularDescuentosDeCompra } from "@/lib/descuentosClientes";
import { enviarNotificaciones } from "@/lib/customerNotifications";
import { correoCashback } from "@/lib/cashbackCorreo";

const resend = new Resend(process.env.RESEND_API_KEY);

// La configuración se lee como mucho una vez por minuto (el webhook recibe muchas órdenes)
let cache = { at: 0, promos: [] };
async function promosActivas() {
  if (cache.at > Date.now() - 60_000) return cache.promos;
  const { data, error } = await supabase.from("promo_cashback").select("*").eq("activo", true);
  // Sin la tabla (SQL sin correr) o con error: no hay promo, la orden sigue normal
  if (error) {
    console.error("[cashback] config:", error.message);
    return [];
  }
  cache = { at: Date.now(), promos: data ?? [] };
  return cache.promos;
}

/** Monto de productos a precio de lista (antes de descuentos, sin envío). */
export function montoDeProductos(payload) {
  const total = Number(payload.total_line_items_price);
  if (Number.isFinite(total) && total > 0) return total;
  return (payload.line_items ?? []).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
}

/** El escalón más alto que alcanza (no se acumulan). null si no llega al primero. */
export function escalonPara(monto, escalones) {
  const alcanzados = (escalones ?? [])
    .map((e) => ({ desde: Number(e.desde), monto: Number(e.monto) }))
    .filter((e) => e.desde > 0 && e.monto > 0 && monto >= e.desde)
    .sort((a, b) => b.desde - a.desde);
  return alcanzados[0] ?? null;
}

// ilike sin comodines: "_" es común en los correos y en ilike vale por cualquier letra
const exacto = (s) => String(s).replace(/[\\%_]/g, "\\$&");

const pesos = (n) => `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" });

async function esProfesional(email, customerId) {
  const consultas = [];
  if (email) consultas.push(supabase.from("affiliates").select("shopify_customer_id").ilike("email", exacto(email)).limit(1));
  if (customerId) consultas.push(supabase.from("affiliates").select("shopify_customer_id").eq("shopify_customer_id", Number(customerId)).limit(1));
  const res = await Promise.all(consultas);
  return res.some((r) => r.data?.length);
}

/**
 * Otorga el cashback de una orden pagada si cae en una promo activa. Idempotente: los
 * reenvíos de Shopify (orders/create, orders/paid, orders/updated) no crean otro cupón ni
 * vuelven a avisar. Nunca lanza: un problema acá no frena el webhook.
 * @returns { promo, code, valor } si otorgó uno nuevo; null si no
 */
export async function otorgarCashback(payload) {
  try {
    if (payload.cancelled_at || payload.test) return null;
    const promos = await promosActivas();
    if (!promos.length) return null;

    const creada = new Date(payload.created_at || Date.now()).getTime();
    const email = String(payload.email || payload.customer?.email || "").trim().toLowerCase();
    if (!email) return null;
    const monto = montoDeProductos(payload);

    for (const promo of promos) {
      if (promo.desde && creada < new Date(promo.desde).getTime()) continue;
      if (promo.hasta && creada > new Date(promo.hasta).getTime()) continue;
      const escalon = escalonPara(monto, promo.escalones);
      if (!escalon) continue;
      if (promo.excluir_profesionales && (await esProfesional(email, payload.customer?.id))) continue;

      const d = await otorgarDescuento({
        email,
        monto: escalon.monto,
        minimo: promo.minimo_uso ?? null,
        venceEl: promo.vence_el ?? null,
        venceEnDias: promo.vence_en_dias ?? null,
        titulo: `${promo.titulo || "Cashback"} por tu pedido ${payload.name ?? ""}`.trim(),
        origen: `cashback:${promo.id}`,
        origenRef: String(payload.id),
        prefijo: promo.prefijo || "BF",
      });
      if (!d.nuevo) return null;

      console.log(`[cashback] ${promo.id} ${payload.name} ${pesos(monto)} → ${d.code} ${pesos(escalon.monto)}`);
      await avisar({ promo, email, valor: escalon.monto, descuento: d, nombre: payload.customer?.first_name, pedido: payload.name });
      return { promo: promo.id, code: d.code, valor: escalon.monto };
    }
    return null;
  } catch (err) {
    console.error("[cashback] orden", payload?.name, err?.message);
    return null;
  }
}

/** La orden se canceló o se reembolsó entera: se apaga su cashback si no se usó. Nunca lanza. */
export async function anularCashback(payload) {
  try {
    const n = await anularDescuentosDeCompra(String(payload.id));
    if (n) console.log(`[cashback] anulado por cancelación/reembolso: ${payload.name} (${n})`);
    return n;
  } catch (err) {
    console.error("[cashback] anular", payload?.name, err?.message);
    return 0;
  }
}

// ── Avisos ───────────────────────────────────────────────────────────────────
// Push a quien ya tiene la app y correo a todos. El correo NO lleva el código: el cupón se ve
// y se aplica en la app, así es el motivo para descargarla.
async function avisar({ promo, email, valor, descuento, nombre, pedido }) {
  const vence = descuento.endsAt ? ` Úsalo antes del ${fechaCorta(descuento.endsAt)}.` : "";

  if (promo.avisar_push) {
    try {
      const { data: usuarios } = await supabase.from("customer_app_users").select("id").ilike("email", exacto(email));
      if (usuarios?.length) {
        await enviarNotificaciones(
          usuarios.map((u) => ({
            userId: u.id,
            title: `¡Ganaste ${pesos(valor)} de cashback! 🎉`,
            body: `Ya está en tus descuentos para tu próximo pedido.${vence}`,
            data: { type: "cashback", code: descuento.code, evento: `cashback:${promo.id}` },
          }))
        );
      }
    } catch (err) {
      console.error("[cashback] push", email, err?.message);
    }
  }

  if (promo.avisar_correo) {
    try {
      const { asunto, html, texto } = correoCashback({
        valor,
        email,
        nombre,
        pedido,
        venceIso: descuento.endsAt,
        promo: String(promo.titulo || "").replace(/^cashback\s*/i, "") || "Vitahub",
        // La app ya está en Google Play: los dos botones siempre
        conAndroid: true,
      });
      const { error } = await resend.emails.send({
        from: "Vitahub <noreply@pro.vitahub.mx>",
        to: email,
        subject: asunto,
        html,
        text: texto,
        tags: [{ name: "flujo", value: `cashback_${String(promo.id).replace(/[^a-zA-Z0-9_-]/g, "_")}` }],
      });
      if (error) throw new Error(error.message ?? JSON.stringify(error));
      await supabase.from("customer_discounts").update({ email_sent_at: new Date().toISOString() }).eq("id", descuento.id);
    } catch (err) {
      console.error("[cashback] correo", email, err?.message);
    }
  }
}
