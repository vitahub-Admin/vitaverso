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

const resend = new Resend(process.env.RESEND_API_KEY);

const APP_IOS_URL = "https://apps.apple.com/mx/app/id6821184197";
const APP_ANDROID_URL = "https://play.google.com/store/apps/details?id=mx.vitahub.cliente";

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
      await avisar({ promo, email, valor: escalon.monto, descuento: d, nombre: payload.customer?.first_name });
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
async function avisar({ promo, email, valor, descuento, nombre }) {
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
      const saludo = nombre ? `¡Hola, ${String(nombre).replace(/[<>&"]/g, "")}!` : "¡Hola!";
      // Android solo si ya está publicada (misma variable que los correos de protocolo)
      const tiendas = [["iPhone", APP_IOS_URL], ...(process.env.MI_VITAHUB_ANDROID_PUBLICA === "1" ? [["Android", APP_ANDROID_URL]] : [])];
      const { error } = await resend.emails.send({
        from: "Vitahub <noreply@pro.vitahub.mx>",
        to: email,
        subject: `Tienes ${pesos(valor)} de cashback esperándote en la app`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
            <img src="https://pro.vitahub.mx/logosimple.png" alt="Vitahub" width="165" height="40" style="display:block;border:0;height:40px;width:auto;margin-bottom:24px" />
            <h2 style="color:#1b3f7a;margin:0 0 8px">${saludo}</h2>
            <p style="color:#555;margin:0 0 20px;line-height:1.5">Gracias por tu compra. Te regalamos cashback para tu próximo pedido:</p>
            <div style="background:#1b3f7a;color:#fff;font-size:34px;font-weight:bold;text-align:center;padding:20px;border-radius:10px">
              ${pesos(valor)}
            </div>
            <p style="color:#555;margin:20px 0;line-height:1.5">
              Lo encuentras en la app de Vitahub, en tus descuentos. Entra con este mismo correo (${email}) y se aplica al pagar.${vence}
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              ${tiendas.map(([nombre, url]) => `<td style="padding:4px"><a href="${url}" style="display:block;background:#1E8FA8;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:bold">Descargar para ${nombre}</a></td>`).join("")}
            </tr></table>
            <p style="color:#999;font-size:12px;margin-top:24px">Es de un solo uso y se combina con otras promociones.</p>
          </div>
        `,
        text: `${saludo} Gracias por tu compra. Tienes ${pesos(valor)} de cashback para tu próximo pedido en la app de Vitahub: entra con ${email} y lo verás en tus descuentos.${vence} ${tiendas.map(([n, u]) => `${n}: ${u}`).join(" · ")}`,
        tags: [{ name: "flujo", value: `cashback_${String(promo.id).replace(/[^a-zA-Z0-9_-]/g, "_")}` }],
      });
      if (error) throw new Error(error.message ?? JSON.stringify(error));
      await supabase.from("customer_discounts").update({ email_sent_at: new Date().toISOString() }).eq("id", descuento.id);
    } catch (err) {
      console.error("[cashback] correo", email, err?.message);
    }
  }
}
