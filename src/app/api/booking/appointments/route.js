// GET   /api/booking/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD — citas del afiliado
// PATCH /api/booking/appointments?id=UUID — actualizar status (cancelar, completar)
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

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("booking_appointments")
    .select(`*, booking_services(name, duration_minutes, price)`)
    .eq("affiliate_id", affiliate.id)
    .is("deleted_at", null)
    .order("starts_at");

  if (from) query = query.gte("starts_at", `${from}T00:00:00`);
  if (to) query = query.lte("starts_at", `${to}T23:59:59`);

  const { data, error: fetchError } = await query;
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function PATCH(req) {
  const { affiliate, error } = await resolveBookingAffiliate(req);
  if (error) return NextResponse.json({ error }, { status: 401 });
  if (!affiliate) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const body = await req.json();

  const updates = {};

  if (body.status !== undefined) {
    const allowed = ["pending", "confirmed", "cancelled", "completed"];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (body.starts_at !== undefined) updates.starts_at = body.starts_at;
  if (body.ends_at   !== undefined) updates.ends_at   = body.ends_at;
  if (body.affiliate_notes !== undefined) updates.affiliate_notes = body.affiliate_notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error: updateError } = await supabase
    .from("booking_appointments")
    .update(updates)
    .eq("id", id)
    .eq("affiliate_id", affiliate.id)
    .select(`*, booking_services(name, duration_minutes, price)`)
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json(data);
}
