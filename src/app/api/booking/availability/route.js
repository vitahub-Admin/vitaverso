// GET  /api/booking/availability  — horario semanal del afiliado
// POST /api/booking/availability  — reemplaza el horario completo (array de franjas)
// DELETE /api/booking/availability?id=UUID — elimina una franja
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveBookingAffiliate } from "@/lib/bookingAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const { affiliate, error } = await resolveBookingAffiliate(req);
  if (error) return NextResponse.json({ error }, { status: 401 });
  if (!affiliate) return NextResponse.json({ data: [] });

  const { data } = await supabase
    .from("booking_availability")
    .select("*")
    .eq("affiliate_id", affiliate.id)
    .order("day_of_week")
    .order("start_time");

  return NextResponse.json({ data });
}

export async function POST(req) {
  const { affiliate, error } = await resolveBookingAffiliate(req);
  if (error) return NextResponse.json({ error }, { status: 401 });
  if (!affiliate) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  // Espera un array: [{ day_of_week, start_time, end_time }, ...]
  const { slots } = await req.json();

  if (!Array.isArray(slots)) {
    return NextResponse.json({ error: "slots debe ser un array" }, { status: 400 });
  }

  // Reemplazar horario completo: borrar los existentes y reinsertar
  await supabase
    .from("booking_availability")
    .delete()
    .eq("affiliate_id", affiliate.id);

  if (slots.length === 0) return NextResponse.json({ data: [] });

  const rows = slots.map(({ day_of_week, start_time, end_time }) => ({
    affiliate_id: affiliate.id,
    day_of_week: Number(day_of_week),
    start_time,
    end_time,
  }));

  const { data, error: insertError } = await supabase
    .from("booking_availability")
    .insert(rows)
    .select();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ data });
}
