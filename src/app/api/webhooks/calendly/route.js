import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const payload = await req.json();

    // Solo procesar invitee.created
    if (payload.event !== "invitee.created") {
      return NextResponse.json({ message: "ignored" }, { status: 200 });
    }

    const inviteeEmail   = payload.payload?.email;
    const eventTypeUri   = payload.payload?.scheduled_event?.event_type;

    if (!inviteeEmail || !eventTypeUri) {
      return NextResponse.json({ message: "missing data" }, { status: 200 });
    }

    // Buscar la capacitación con ese calendly_event_uri
    const { data: capacitacion } = await supabase
      .from("capacitaciones")
      .select("id")
      .eq("calendly_event_uri", eventTypeUri)
      .maybeSingle();

    if (!capacitacion) {
      return NextResponse.json({ message: "no matching capacitacion" }, { status: 200 });
    }

    // Actualizar inscripción pendiente que tenga ese email + capacitacion
    const { error } = await supabase
      .from("capacitacion_inscripciones")
      .update({ status: "inscrito" })
      .eq("capacitacion_id", capacitacion.id)
      .eq("email", inviteeEmail.toLowerCase())
      .eq("status", "pendiente");

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Calendly webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
