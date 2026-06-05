// GET  /api/booking/services  — lista servicios del afiliado autenticado
// POST /api/booking/services  — crea un servicio
// DELETE /api/booking/services?id=UUID — elimina (desactiva) un servicio
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
    .from("booking_services")
    .select("*")
    .eq("affiliate_id", affiliate.id)
    .order("created_at");

  return NextResponse.json({ data });
}

export async function POST(req) {
  const { affiliate, error } = await resolveBookingAffiliate(req);
  if (error) return NextResponse.json({ error }, { status: 401 });
  if (!affiliate) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  const { name, description, duration_minutes, price, currency } = await req.json();

  if (!name || !duration_minutes || price === undefined) {
    return NextResponse.json({ error: "name, duration_minutes y price son requeridos" }, { status: 400 });
  }

  const { data, error: insertError } = await supabase
    .from("booking_services")
    .insert({
      affiliate_id: affiliate.id,
      name,
      description,
      duration_minutes: Number(duration_minutes),
      price: Number(price),
      currency: currency || "MXN",
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req) {
  const { affiliate, error } = await resolveBookingAffiliate(req);
  if (error) return NextResponse.json({ error }, { status: 401 });
  if (!affiliate) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error: updateError } = await supabase
    .from("booking_services")
    .update({ is_active: false })
    .eq("id", id)
    .eq("affiliate_id", affiliate.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
