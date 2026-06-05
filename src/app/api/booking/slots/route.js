// GET /api/booking/slots?slug=XXX&date=YYYY-MM-DD&service_id=UUID
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeAvailableSlots } from "@/lib/bookingSlots";
import { getCalendarBusy } from "@/lib/bookingCalendar";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const date = searchParams.get("date"); // YYYY-MM-DD
  const serviceId = searchParams.get("service_id");

  if (!slug || !date || !serviceId) {
    return NextResponse.json(
      { error: "slug, date y service_id son requeridos" },
      { status: 400 }
    );
  }

  // Validar formato de fecha
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Formato de fecha inválido" }, { status: 400 });
  }

  // Obtener afiliado + servicio en paralelo
  const [affiliateRes, serviceRes] = await Promise.all([
    supabase
      .from("booking_affiliates")
      .select("id, timezone, google_calendar_token, google_calendar_id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("booking_services")
      .select("id, duration_minutes, affiliate_id")
      .eq("id", serviceId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!affiliateRes.data) {
    return NextResponse.json({ error: "Afiliado no encontrado" }, { status: 404 });
  }
  if (!serviceRes.data || serviceRes.data.affiliate_id !== affiliateRes.data.id) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
  }

  const affiliate = affiliateRes.data;
  const { duration_minutes } = serviceRes.data;

  // Día de la semana para esa fecha (0=Dom, 1=Lun ... 6=Sab)
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();

  // Disponibilidad, citas y bloqueos en paralelo
  const [availRes, apptRes, blockRes] = await Promise.all([
    supabase
      .from("booking_availability")
      .select("start_time, end_time")
      .eq("affiliate_id", affiliate.id)
      .eq("day_of_week", dayOfWeek),

    supabase
      .from("booking_appointments")
      .select("starts_at, ends_at, status, created_at")
      .eq("affiliate_id", affiliate.id)
      .gte("starts_at", `${date}T00:00:00`)
      .lt("starts_at", `${date}T23:59:59`)
      .in("status", ["pending_payment", "confirmed"]),

    supabase
      .from("booking_blocked_slots")
      .select("start_time, end_time")
      .eq("affiliate_id", affiliate.id)
      .eq("blocked_date", date),
  ]);

  // Google Calendar busy (solo si el afiliado lo conectó)
  let calendarBusy = [];
  if (affiliate.google_calendar_token) {
    try {
      calendarBusy = await getCalendarBusy(
        affiliate.google_calendar_token,
        affiliate.google_calendar_id,
        `${date}T00:00:00`,
        `${date}T23:59:59`
      );
    } catch {
      // Si falla el calendario no bloqueamos el booking
    }
  }

  const slots = computeAvailableSlots(
    date,
    duration_minutes,
    availRes.data || [],
    apptRes.data || [],
    blockRes.data || [],
    calendarBusy
  );

  return NextResponse.json({ date, slots });
}
