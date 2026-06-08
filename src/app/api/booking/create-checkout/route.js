// POST /api/booking/create-checkout
// Crea la cita en Supabase + Draft Order en Shopify, devuelve invoice_url.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function shopifyAdminFetch(path, body) {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify(body),
    }
  );
  return res.json();
}

export async function POST(req) {
  try {
    const {
      slug,
      service_id,
      date,        // YYYY-MM-DD
      time,        // HH:MM
      client_name,
      client_email,
      client_phone,
      client_notes,
    } = await req.json();

    if (!slug || !service_id || !date || !time || !client_name || !client_email) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    // Obtener afiliado y servicio
    const { data: affiliate } = await supabase
      .from("booking_affiliates")
      .select("id, display_name, timezone")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!affiliate) {
      return NextResponse.json({ error: "Afiliado no encontrado" }, { status: 404 });
    }

    const { data: service } = await supabase
      .from("booking_services")
      .select("id, name, duration_minutes, price, currency")
      .eq("id", service_id)
      .eq("affiliate_id", affiliate.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!service) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
    }

    const startsAt = new Date(`${date}T${time}:00`);
    const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60 * 1000);

    // Verificar que el slot sigue libre.
    // pending_payment expira a los 30 min; solo bloquea si es reciente.
    const expiryThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: conflict } = await supabase
      .from("booking_appointments")
      .select("id")
      .eq("affiliate_id", affiliate.id)
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
      .or(`status.eq.confirmed,and(status.eq.pending_payment,created_at.gt.${expiryThreshold})`)
      .maybeSingle();

    if (conflict) {
      return NextResponse.json({ error: "Ese horario ya no está disponible" }, { status: 409 });
    }

    // Crear appointment en Supabase con estado pending_payment
    const { data: appointment, error: apptError } = await supabase
      .from("booking_appointments")
      .insert({
        affiliate_id: affiliate.id,
        service_id: service.id,
        client_name,
        client_email,
        client_phone: client_phone || null,
        client_notes: client_notes || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "pending_payment",
      })
      .select()
      .single();

    if (apptError) throw apptError;

    // Formatear fecha legible para el título de la orden
    const dateLabel = startsAt.toLocaleDateString("es-MX", {
      weekday: "short", day: "numeric", month: "short",
    });
    const timeLabel = time;

    // Crear Draft Order en Shopify
    const draftOrderRes = await shopifyAdminFetch("draft_orders.json", {
      draft_order: {
        line_items: [
          {
            title: `${service.name} — ${affiliate.display_name}`,
            price: service.price.toString(),
            quantity: 1,
            requires_shipping: false,
            taxable: false,
          },
        ],
        note: `Cita el ${dateLabel} a las ${timeLabel}hs`,
        note_attributes: [
          { name: "booking_appointment_id", value: appointment.id },
          { name: "booking_affiliate_slug", value: slug },
        ],
        customer: { email: client_email },
        use_customer_default_address: false,
      },
    });

    const draftOrder = draftOrderRes.draft_order;
    if (!draftOrder) {
      // Rollback: marcar cita como expirada si Shopify falla
      await supabase
        .from("booking_appointments")
        .update({ status: "expired" })
        .eq("id", appointment.id);
      return NextResponse.json({ error: "Error al crear la orden de pago" }, { status: 500 });
    }

    // Guardar el draft_order_id en la cita
    await supabase
      .from("booking_appointments")
      .update({ shopify_draft_order_id: String(draftOrder.id) })
      .eq("id", appointment.id);

    return NextResponse.json({
      appointment_id: appointment.id,
      checkout_url: draftOrder.invoice_url,
    });
  } catch (err) {
    console.error("create-checkout error:", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
