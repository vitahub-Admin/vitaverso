/**
 * POST /api/webhooks/shopify-envios
 *
 * Avisos de envío para los clientes de la app Mi Vitahub. Suscribir en Shopify
 * (Configuración → Notificaciones → Webhooks, formato JSON) los eventos:
 *   · fulfillments/create   (se creó el envío / salió con guía)
 *   · fulfillments/update   (la paquetería actualizó: en camino, sale a entrega, entregado)
 * Firmado con el mismo secreto que el webhook de órdenes (SHOPIFY_WEBHOOK_SECRET).
 *
 * Un aviso por etapa y por envío (en_camino, sale_hoy, entregado): Shopify reintenta
 * y manda varios update iguales, así que se deduplica contra el historial del cliente.
 * Al entregarse se recalcula su stack: si el pedido trae receta con dosis, el
 * seguimiento arranca solo ese día.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase, shopifyAdmin, buildStack } from "@/lib/customerSupplements";
import { enviarNotificaciones } from "@/lib/customerNotifications";

export const runtime = "nodejs";
export const maxDuration = 60;

function firmaValida(rawBody, hmac) {
  if (!hmac || !process.env.SHOPIFY_WEBHOOK_SECRET) return false;
  const digest = crypto.createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Etapa que vale avisar según el estado del envío que reporta la paquetería
function etapaDe(f) {
  if (f.status && f.status !== "success") return null; // cancelado, error, abierto
  const s = f.shipment_status;
  if (s === "delivered") return "entregado";
  if (s === "out_for_delivery") return "sale_hoy";
  if (s === "failure" || s === "attempted_delivery") return null; // los resuelve atención a clientes
  return "en_camino"; // null, label_printed, confirmed, in_transit, ready_for_pickup...
}

function mensaje(etapa, f, orderName) {
  const guia = f.tracking_number ? ` Guía ${f.tracking_number}${f.tracking_company ? ` (${f.tracking_company})` : ""}.` : "";
  if (etapa === "entregado") {
    return {
      title: "Tu pedido fue entregado",
      body: `Tu pedido ${orderName} ya llegó. Abre Mi Vitahub para empezar el seguimiento de tus suplementos.`,
    };
  }
  if (etapa === "sale_hoy") {
    return { title: "Tu pedido llega hoy", body: `Tu pedido ${orderName} salió a entrega.${guia}` };
  }
  return { title: "Tu pedido va en camino", body: `Tu pedido ${orderName} ya salió.${guia}` };
}

// De la orden al cliente de la app: primero nuestra tabla orders, si no, Shopify
async function clienteDeOrden(orderId) {
  let customerId = null;
  let email = null;
  let name = null;

  const { data: row } = await supabase
    .from("orders")
    .select("customer_id, customer_email, order_name")
    .eq("order_id", Number(orderId))
    .maybeSingle();
  if (row) {
    customerId = row.customer_id;
    email = row.customer_email;
    name = row.order_name;
  }

  if (!customerId && !email) {
    // Ventas de consultorio y otras que no entran a la tabla orders
    const data = await shopifyAdmin(
      `query ordenCliente($id: ID!) { order(id: $id) { name email customer { id email } } }`,
      { id: `gid://shopify/Order/${orderId}` }
    );
    const o = data?.order;
    customerId = o?.customer?.id ? Number(o.customer.id.split("/").pop()) : null;
    email = o?.customer?.email ?? o?.email ?? null;
    name = o?.name ?? null;
  }

  let user = null;
  if (customerId) {
    ({ data: user } = await supabase
      .from("customer_app_users")
      .select("id, email, shopify_customer_id")
      .eq("shopify_customer_id", customerId)
      .maybeSingle());
  }
  if (!user && email) {
    ({ data: user } = await supabase
      .from("customer_app_users")
      .select("id, email, shopify_customer_id")
      .eq("email", String(email).trim().toLowerCase())
      .maybeSingle());
  }
  return { user, orderName: name };
}

export async function POST(req) {
  const rawBody = await req.text();
  if (!firmaValida(rawBody, req.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const f = JSON.parse(rawBody);
    const etapa = etapaDe(f);
    if (!etapa || !f.order_id) return NextResponse.json({ ok: true, accion: "sin-aviso" });

    const { user, orderName } = await clienteDeOrden(f.order_id);
    if (!user) return NextResponse.json({ ok: true, accion: "sin-cuenta-en-la-app" });

    const clave = `${f.id}:${etapa}`;
    const { data: ya } = await supabase
      .from("customer_notifications")
      .select("id")
      .eq("user_id", user.id)
      .filter("data->>envio_key", "eq", clave)
      .limit(1);
    if (ya?.length) return NextResponse.json({ ok: true, accion: "ya-avisado" });

    // Si entregó antes de que avisáramos "en camino", solo avisamos la entrega
    const nombre = orderName || (f.name ? `#${String(f.name).split(".")[0].replace(/^#/, "")}` : "");
    const { title, body } = mensaje(etapa, f, nombre);
    const resumen = await enviarNotificaciones([
      {
        userId: user.id,
        title,
        body,
        data: {
          type: "order",
          envio_key: clave,
          orderId: String(f.order_id),
          ...(etapa !== "entregado" && f.tracking_url ? { url: f.tracking_url } : {}),
        },
      },
    ]);

    // Entregado: que el seguimiento de lo que llegó arranque ya (si hay receta con dosis)
    if (etapa === "entregado") {
      await buildStack(user).catch((err) => console.error("[shopify-envios] stack:", err.message));
    }

    return NextResponse.json({ ok: true, accion: etapa, enviados: resumen.enviados });
  } catch (err) {
    console.error("[webhook shopify-envios]", err);
    // 500 → Shopify reintenta; es seguro porque se deduplica por envío y etapa
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
