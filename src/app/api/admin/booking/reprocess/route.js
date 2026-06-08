import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCalendarEvent } from "@/lib/bookingCalendar";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  const { appointment_id } = await req.json();
  if (!appointment_id) {
    return NextResponse.json({ error: "appointment_id requerido" }, { status: 400 });
  }

  const { data: appointment } = await supabase
    .from("booking_appointments")
    .select(`
      *,
      booking_affiliates (shopify_customer_id, display_name, google_calendar_token, google_calendar_id),
      booking_services (name, duration_minutes, price)
    `)
    .eq("id", appointment_id)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const affiliate = appointment.booking_affiliates;
  const results = { calendar: null, n8n: null };

  // ── Google Calendar ──────────────────────────────────────────────
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

      const meetLink = event.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri || null;

      await supabase
        .from("booking_appointments")
        .update({ google_calendar_event_id: event.id, meet_link: meetLink })
        .eq("id", appointment_id);

      results.calendar = { event_id: event.id, meet_link: meetLink };
    } catch (err) {
      results.calendar = { error: err.message };
    }
  } else {
    results.calendar = { skipped: "sin token de Calendar" };
  }

  // ── n8n ──────────────────────────────────────────────────────────
  if (process.env.N8N_BOOKING_CONFIRMED_WEBHOOK) {
    try {
      const { data: affiliateAccount } = await supabase
        .from("affiliates")
        .select("email")
        .eq("shopify_customer_id", Number(affiliate?.shopify_customer_id))
        .maybeSingle();

      const meetLink = results.calendar?.meet_link || appointment.meet_link || null;

      const n8nRes = await fetch(process.env.N8N_BOOKING_CONFIRMED_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id,
          client_name: appointment.client_name,
          client_email: appointment.client_email,
          client_phone: appointment.client_phone || null,
          service_name: appointment.booking_services?.name,
          duration_minutes: appointment.booking_services?.duration_minutes,
          starts_at: appointment.starts_at,
          ends_at: appointment.ends_at,
          affiliate_name: affiliate?.display_name || null,
          affiliate_email: affiliateAccount?.email || null,
          meet_link: meetLink,
          shopify_order_id: appointment.shopify_order_id,
        }),
      });
      results.n8n = { status: n8nRes.status };
    } catch (err) {
      results.n8n = { error: err.message };
    }
  } else {
    results.n8n = { skipped: "N8N_BOOKING_CONFIRMED_WEBHOOK no configurado" };
  }

  return NextResponse.json({ ok: true, appointment_id, results });
}
