import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToAffiliate } from "@/lib/affiliateNotifications";
import { createCalendarEvent } from "@/lib/bookingCalendar";
import { Resend } from "resend";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Email de prescripción ─────────────────────────────────────────────────────

function buildPrescriptionEmail({ affiliateName, patientName, orderNumber, date, lineItems }) {
  const rows = lineItems.map((item, i) => `
    <tr>
      <td style="padding-bottom:22px;${i > 0 ? "padding-top:22px;border-top:1px solid #f3f4f6;" : ""}">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-bottom:8px;">
              <span style="display:inline-block;background:#1b3f7a;color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-right:10px;">×${item.quantity}</span>
              <span style="font-size:15px;font-weight:700;color:#1b3f7a;">${item.title}</span>
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#6b7280;line-height:1.65;">${item.desc}</td>
          </tr>
        </table>
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Protocolo de Suplementación</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FB;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FB;">
<tr><td align="center" style="padding:40px 20px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

<tr><td style="background:#1b3f7a;border-radius:16px 16px 0 0;padding:30px 40px 26px;">
  <p style="margin:0 0 8px;color:#7eb8c9;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Vitahub Pro</p>
  <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.2;">Protocolo de Suplementación</h1>
</td></tr>

<tr><td style="background:#1E8FA8;padding:18px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td>
      <p style="margin:0;color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Paciente</p>
      <p style="margin:4px 0 0;color:#ffffff;font-size:15px;font-weight:700;">${patientName}</p>
    </td>
    <td align="right">
      <p style="margin:0;color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;text-align:right;">Especialista</p>
      <p style="margin:4px 0 0;color:#ffffff;font-size:15px;font-weight:700;text-align:right;">${affiliateName}</p>
    </td>
  </tr>
  </table>
</td></tr>

<tr><td style="background:#ffffff;padding:12px 40px;border-bottom:1px solid #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="color:#9ca3af;font-size:12px;">Orden #${orderNumber}</td>
    <td align="right" style="color:#9ca3af;font-size:12px;">${date}</td>
  </tr>
  </table>
</td></tr>

<tr><td style="background:#ffffff;padding:28px 40px;">
  <p style="margin:0 0 20px;font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;">Tu protocolo incluye</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  ${rows}
  </table>
</td></tr>

<tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;border-radius:0 0 16px 16px;padding:24px 40px;">
  <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;text-align:center;">
    Este protocolo fue diseñado para ti por <strong style="color:#6b7280;">${affiliateName}</strong><br>a través de <strong style="color:#1b3f7a;">Vitahub Pro</strong>.<br>
    Para dudas o ajustes, contacta directamente a tu especialista.<br><br>
    <a href="https://vitahub.mx" style="color:#1E8FA8;text-decoration:none;font-weight:600;">vitahub.mx</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendProtocolEmail(payload, shareCartToken) {
  try {
    const customerEmail = payload.customer?.email || payload.email;
    if (!customerEmail) return;

    // Datos del sharecart (nombre del paciente + owner + origen)
    const { data: cartData } = await supabase
      .from("sharecarts")
      .select("owner_id, name, extra")
      .eq("token", shareCartToken)
      .maybeSingle();

    if (!cartData) return;

    // Solo enviar para prescripciones generadas desde Protocolos Clínicos
    if (cartData.extra?.origen !== 'protocolo') return;

    // Nombre del especialista desde affiliates
    const { data: affiliateData } = await supabase
      .from("affiliates")
      .select("display_name, email")
      .eq("shopify_customer_id", Number(cartData.owner_id))
      .maybeSingle();

    // Catálogo para cruzar product_id → slug de componente
    const productIds = (payload.line_items || [])
      .map(i => Number(i.product_id))
      .filter(Boolean);

    const [{ data: catalogRows }, { data: compRows }] = await Promise.all([
      supabase.from("product_catalog").select("product_id, componente").in("product_id", productIds),
      supabase.from("componentes").select("slug, descripcion"),
    ]);

    const catalogMap = {};
    (catalogRows || []).forEach(r => {
      catalogMap[r.product_id] = (r.componente || "").trim().toLowerCase();
    });

    const descMap = {};
    (compRows || []).forEach(r => {
      if (r.slug) descMap[r.slug.trim().toLowerCase()] = r.descripcion;
    });

    const FALLBACK = "Suplemento de alta calidad seleccionado especialmente para tu protocolo de salud.";

    const lineItems = (payload.line_items || []).map(item => {
      const slug = catalogMap[item.product_id] || "";
      const desc = (slug && descMap[slug]) || FALLBACK;
      return { title: item.title || "", quantity: item.quantity, desc };
    });

    const patientName =
      cartData.name ||
      [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") ||
      "Paciente";

    const affiliateName = affiliateData?.display_name || "Tu especialista en Vitahub";

    const date = new Date(payload.created_at).toLocaleDateString("es-MX", {
      year: "numeric", month: "long", day: "numeric",
    });

    const html = buildPrescriptionEmail({ affiliateName, patientName, orderNumber: payload.order_number, date, lineItems });

    await resend.emails.send({
      from: "Vitahub Pro <noreply@pro.vitahub.mx>",
      to: customerEmail,
      subject: "Tu protocolo de suplementación — Vitahub Pro",
      html,
    });

    console.log(`[webhook] Prescripción enviada → ${customerEmail} (orden #${payload.order_number})`);
  } catch (err) {
    console.error("[webhook] sendProtocolEmail error:", err?.message);
  }
}

async function handleBookingPayment(payload) {
  const getAttr = (name) =>
    payload.note_attributes?.find((a) => a.name === name)?.value || null;

  const appointmentId = getAttr("booking_appointment_id");
  if (!appointmentId) return false;

  const { data: appointment } = await supabase
    .from("booking_appointments")
    .select(`
      *,
      booking_affiliates (shopify_customer_id, display_name, google_calendar_token, google_calendar_id),
      booking_services (name, duration_minutes, price, currency)
    `)
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) return false;

  // Confirmar la cita
  await supabase
    .from("booking_appointments")
    .update({
      status: "confirmed",
      shopify_order_id: String(payload.id),
      shopify_order_number: String(payload.order_number),
    })
    .eq("id", appointmentId);

  // Registrar ganancia en el wallet del afiliado (idempotente)
  const affiliate = appointment.booking_affiliates;
  if (affiliate) {
    const { data: existingEarning } = await supabase
      .from("point_transactions_live")
      .select("id")
      .eq("reference_id", String(appointmentId))
      .eq("reference_type", "booking_appointment")
      .maybeSingle();

    if (!existingEarning) {
      const servicePrice = Number(appointment.booking_services?.price || 0);
      const { data: commissionSetting } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "booking_commission_rate")
        .maybeSingle();
      const commissionRate = Number(commissionSetting?.value ?? 0.10);
      const earning = Number((servicePrice * (1 - commissionRate)).toFixed(2));

      if (earning > 0) {
        await supabase.from("point_transactions_live").insert([{
          customer_id: Number(affiliate.shopify_customer_id),
          points: earning,
          direction: "IN",
          category: "booking",
          status: "confirmed",
          reference_id: String(appointmentId),
          reference_type: "booking_appointment",
          description: `Cita: ${appointment.booking_services?.name} — ${appointment.client_name}`,
          actor_type: "system",
          metadata: {
            appointment_id: appointmentId,
            service_name: appointment.booking_services?.name,
            client_email: appointment.client_email,
            shopify_order_id: String(payload.id),
            gross_amount: servicePrice,
            commission_rate: commissionRate,
          },
        }]);
      }
    }
  }

  // Crear evento en Google Calendar del afiliado (primero, para tener el meet_link)
  let meetLink = null;
  if (affiliate?.google_calendar_token) {
    try {
      const event = await createCalendarEvent(
        affiliate.google_calendar_token,
        affiliate.google_calendar_id,
        {
          summary: `${appointment.booking_services.name} — ${appointment.client_name}`,
          description: appointment.client_notes || "",
          start: { dateTime: appointment.starts_at },
          end: { dateTime: appointment.ends_at },
          attendees: [{ email: appointment.client_email }],
        },
        async (newTokens) => {
          await supabase
            .from("booking_affiliates")
            .update({ google_calendar_token: newTokens })
            .eq("shopify_customer_id", Number(affiliate.shopify_customer_id));
        }
      );
      meetLink = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri || null;
      await supabase
        .from("booking_appointments")
        .update({
          google_calendar_event_id: event.id,
          meet_link: meetLink,
        })
        .eq("id", appointmentId);
    } catch {
      // No bloquear si falla Calendar
    }
  }

  // Notificar a n8n para emails de confirmación (cliente + afiliado)
  if (process.env.N8N_BOOKING_CONFIRMED_WEBHOOK) {
    const { data: affiliateAccount } = await supabase
      .from("affiliates")
      .select("email, phone")
      .eq("shopify_customer_id", Number(affiliate?.shopify_customer_id))
      .maybeSingle();

    try {
      await fetch(process.env.N8N_BOOKING_CONFIRMED_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointmentId,
          client_name: appointment.client_name,
          client_email: appointment.client_email,
          client_phone: appointment.client_phone || null,
          service_name: appointment.booking_services?.name,
          duration_minutes: appointment.booking_services?.duration_minutes,
          starts_at: appointment.starts_at,
          ends_at: appointment.ends_at,
          affiliate_name: affiliate?.display_name || null,
          affiliate_email: affiliateAccount?.email || null,
          affiliate_phone: affiliateAccount?.phone || null,
          meet_link: meetLink,
          shopify_order_id: String(payload.id),
        }),
      });
    } catch (err) {
      console.error("❌ n8n booking webhook failed:", err.message);
    }
  }

  return true;
}

const getCollectionHandle = (landingSite) => {
  if (!landingSite) return null;
  const match = landingSite.match(/^\/collections\/([^/?]+)/);
  return match ? match[1] : null;
};

async function getEspecIdFromCollectionHandle(handle) {
  const query = `
    query($handle: String!) {
      collectionByHandle(handle: $handle) {
        metafield(namespace: "custom", key: "especId") { value }
      }
    }`;
  const res = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { handle } }),
  }).then(r => r.json()).catch(() => null);

  return res?.data?.collectionByHandle?.metafield?.value || null;
}

export async function POST(req) {
  try {
    const rawBody = await req.text();
    const hmac = req.headers.get("x-shopify-hmac-sha256");

    if (!hmac) {
      return NextResponse.json({ error: "No HMAC header" }, { status: 401 });
    }

    const digest = crypto
      .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody, "utf8")
      .digest("base64");

    if (digest !== hmac) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    if (payload.financial_status !== "paid") {
      return NextResponse.json({ message: "Not paid" }, { status: 200 });
    }

    // Si es una orden de booking, la procesamos aparte y terminamos
    const isBooking = await handleBookingPayment(payload);
    if (isBooking) {
      return NextResponse.json({ success: true, type: "booking" }, { status: 200 });
    }

    const orderId = payload.id;
    const orderNumber = payload.order_number;
    const customer = payload.customer || {};

    const getAttr = (name) =>
      payload.note_attributes?.find((a) => a.name === name)?.value || "";

    let specialistRef = getAttr("specialist_ref") || "0000";
    const shareCart = getAttr("share_cart") || null;

    const lineItems = (payload.line_items || []).map((item) => ({
      product_id: item.product_id || null,
      title: item.title || null,
      sku: item.sku || null,
      variant_title: item.variant_title || null,
      quantity: item.quantity,
      price: Number(item.price),
    }));

    const discountTitle = payload.discount_codes?.[0]?.code || null;

    // ── Resolución de specialist_ref (6 pasos) ──────────────────
    let correctedRef = null;
    let status = "ok";

    if (!specialistRef || specialistRef === "0000") {
      const customerId = customer.id;

      // Fetch customer tags + metafields en paralelo
      const [custRes, metaRes] = await Promise.all([
        fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/customers/${customerId}.json?fields=id,tags`, {
          headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
        }).then(r => r.json()).catch(() => ({})),
        fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/customers/${customerId}/metafields.json`, {
          headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
        }).then(r => r.json()).catch(() => ({ metafields: [] })),
      ]);

      const custTags      = custRes.customer?.tags || "";
      const metafields    = metaRes.metafields || [];
      const referidoMeta  = metafields.find(m => m.key === "referido");
      const referidoValue = referidoMeta?.value || "";
      const isEspecialista = custTags.split(",").map(t => t.trim().toLowerCase()).includes("especialista");

      const setReferido = (value) => {
        const body = referidoMeta
          ? JSON.stringify({ metafield: { id: referidoMeta.id, value: String(value), type: "single_line_text_field" } })
          : JSON.stringify({ metafield: { namespace: "custom", key: "referido", value: String(value), type: "single_line_text_field" } });
        const url = referidoMeta
          ? `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/metafields/${referidoMeta.id}.json`
          : `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/customers/${customerId}/metafields.json`;
        fetch(url, { method: referidoMeta ? "PUT" : "POST", headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json" }, body })
          .catch(e => console.error("setReferido error:", e.message));
      };

      // Paso 2: Customer es especialista → self-referral
      if (isEspecialista) {
        correctedRef = String(customerId);
        status = "corrected";
        if (!referidoValue) setReferido(customerId);

      // Paso 3: Customer tiene metafield referido
      } else if (referidoValue) {
        correctedRef = referidoValue;
        status = "corrected";

      // Paso 4: Share cart
      } else if (shareCart) {
        const { data: cartData } = await supabase
          .from("sharecarts")
          .select("owner_id")
          .eq("token", shareCart)
          .maybeSingle();

        if (cartData?.owner_id) {
          correctedRef = String(cartData.owner_id);
          status = "corrected";
          if (!referidoValue) setReferido(cartData.owner_id);
        }
      }

      // Paso 5: landing_site → collection → metafield custom.especId
      if (!correctedRef) {
        const collectionHandle = getCollectionHandle(payload.landing_site);
        if (collectionHandle) {
          const especId = await getEspecIdFromCollectionHandle(collectionHandle);
          if (especId) {
            correctedRef = especId;
            status = "corrected";
          }
        }
      }

      status = correctedRef ? "corrected" : "suspect";
    } else {
      // Paso 1: Ya tiene ref válido → backfill referido si falta (fire-and-forget)
      if (customer.id) {
        fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/customers/${customer.id}/metafields.json`, {
          headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
        })
          .then(r => r.json())
          .then(({ metafields = [] }) => {
            const referidoMeta  = metafields.find(m => m.key === "referido");
            if (!referidoMeta?.value) {
              const url  = referidoMeta
                ? `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/metafields/${referidoMeta.id}.json`
                : `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/customers/${customer.id}/metafields.json`;
              const body = referidoMeta
                ? JSON.stringify({ metafield: { id: referidoMeta.id, value: specialistRef, type: "single_line_text_field" } })
                : JSON.stringify({ metafield: { namespace: "custom", key: "referido", value: specialistRef, type: "single_line_text_field" } });
              fetch(url, { method: referidoMeta ? "PUT" : "POST", headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json" }, body })
                .catch(e => console.error("backfill referido error:", e.message));
            }
          })
          .catch(e => console.error("backfill referido fetch error:", e.message));
      }
    }

    // Guardar orden (upsert por si llega orders/updated)
    const { error: orderError } = await supabase
      .from("orders")
      .upsert(
        {
          order_id: orderId,
          order_name: payload.name,
          customer_id: customer.id || null,
          customer_name:
            [customer.first_name, customer.last_name]
              .filter(Boolean)
              .join(" ") || null,
          customer_email: customer.email || null,
          customer_phone: customer.phone || null,
          share_cart: shareCart,
          specialist_ref: specialistRef,
          corrected_ref: correctedRef,
          status,
          financial_status: payload.financial_status,
          fulfillment_status: payload.fulfillment_status || null,
          line_items: lineItems,
          discount_title: discountTitle,
          total: Number(payload.total_price),
          total_discounts: Number(payload.total_discounts),
          shopify_created_at: payload.created_at,
          shopify_updated_at: payload.updated_at,
        },
        { onConflict: "order_id" }
      );

    if (orderError) console.error("Order upsert error:", orderError);

    // Si fue corregida automáticamente → actualizar note_attributes en Shopify
    if (status === "corrected" && correctedRef) {
      const mergedAttributes = [
        ...(payload.note_attributes || []).filter(
          a => a.name !== "specialist_ref" && a.name !== "corregido"
        ),
        { name: "specialist_ref", value: correctedRef },
        { name: "corregido",      value: "vitahubpro automat" },
      ];

      fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/orders/${orderId}.json`, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order: { id: orderId, note_attributes: mergedAttributes } }),
      })
        .then(r => { if (!r.ok) r.text().then(t => console.error("Shopify order update error:", t)) })
        .catch(e => console.error("Shopify order update error:", e.message));
    }

    // Marcar como convertido en base_datos_exports si la orden tiene sharecart
    if (shareCart) {
      supabase
        .from('sharecarts')
        .select('phone')
        .eq('token', shareCart)
        .maybeSingle()
        .then(({ data: cartData }) => {
          const cartPhone = (cartData?.phone ?? '').replace(/\D/g, '');
          if (!cartPhone) return;
          supabase
            .from('base_datos_exports')
            .update({ deleted_at: new Date().toISOString() })
            .eq('phone', cartPhone)
            .is('deleted_at', null)
            .then(({ error }) => {
              if (error) console.error('base_datos_exports update error:', error);
            });
        });
    }

    // Enviar prescripción por email (idempotencia atómica)
    // UPDATE solo aplica cuando protocol_email_sent_at IS NULL → solo el primer handler que llega lo reclama.
    // Si Shopify reintenta el webhook (o llegan dos simultáneos), el segundo UPDATE no devuelve fila → skip.
    if (shareCart) {
      supabase
        .from('orders')
        .update({ protocol_email_sent_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .is('protocol_email_sent_at', null)
        .select('order_id')
        .maybeSingle()
        .then(({ data: claimed }) => {
          if (claimed) sendProtocolEmail(payload, shareCart).catch(() => {});
        });
    }

    // Determinar especialista efectivo para comisiones
    const effectiveSpecialist =
      correctedRef || (specialistRef !== "0000" ? specialistRef : null);

    if (!effectiveSpecialist) {
      return NextResponse.json(
        { message: "No valid specialist, order saved", status },
        { status: 200 }
      );
    }

    const specialistId = Number(effectiveSpecialist);

    // Idempotencia
    const { data: existingTx } = await supabase
      .from("point_transactions")
      .select("id")
      .eq("reference_id", String(orderId))
      .eq("reference_type", "shopify_order")
      .eq("category", "earning")
      .maybeSingle();

    if (existingTx) {
      return NextResponse.json({ message: "Already processed" }, { status: 200 });
    }

    // Calcular comisiones
    let totalCommission = 0;
    const breakdown = [];

    for (const item of payload.line_items) {
      const variantId = item.variant_id;
      const quantity = Number(item.quantity);
      const price = Number(item.price);

      const discount =
        item.discount_allocations?.reduce(
          (sum, d) => sum + Number(d.amount),
          0
        ) || 0;

      const subtotal = price * quantity - discount;

      const { data: commissionData } = await supabase
        .from("product_variant_commissions")
        .select("commission_percent")
        .eq("variant_id", variantId)
        .eq("active", true)
        .maybeSingle();

      const commissionPercent = commissionData?.commission_percent || 0;
      const commissionLine = subtotal * (Number(commissionPercent) / 100);

      totalCommission += commissionLine;
      breakdown.push({
        variant_id: variantId,
        quantity,
        price,
        subtotal,
        commission_percent: commissionPercent,
        commission_line: commissionLine,
      });
    }

    totalCommission = Number(totalCommission.toFixed(2));

    if (totalCommission <= 0) {
      return NextResponse.json(
        { message: "No commission", status },
        { status: 200 }
      );
    }

    const { error: txError } = await supabase
      .from("point_transactions")
      .insert([
        {
          customer_id: specialistId,
          points: totalCommission,
          direction: "IN",
          category: "earning",
          status: "confirmed",
          reference_id: String(orderId),
          reference_type: "shopify_order",
          description: `Ganancia por orden #${orderNumber}`,
          actor_type: "system",
          metadata: {
            order_number: orderNumber,
            shopify_order_id: orderId,
            corrected: !!correctedRef,
            breakdown,
          },
        },
      ]);

    if (txError) throw txError;

    sendPushToAffiliate(
      specialistId,
      '¡Nueva comisión! 💰',
      `Ganaste $${totalCommission.toFixed(2)} MXN por la orden #${orderNumber}.`,
      { type: 'new_commission', orderId, orderNumber, amount: totalCommission }
    ).catch(() => {});

    await supabase.rpc("increment_affiliate_orders", {
      p_shopify_id: specialistId,
    });

    return NextResponse.json({ success: true, status }, { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
