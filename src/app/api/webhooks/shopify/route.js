import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToAffiliate } from "@/lib/affiliateNotifications";
import { createCalendarEvent } from "@/lib/bookingCalendar";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

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
      sku: item.sku || null,
      variant_title: item.variant_title || null,
      quantity: item.quantity,
      price: Number(item.price),
    }));

    const discountTitle = payload.discount_codes?.[0]?.code || null;

    // ── Resolución de specialist_ref (5 pasos) ──────────────────
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
        } else {
          status = "suspect";
        }
      } else {
        status = "suspect";
      }
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
