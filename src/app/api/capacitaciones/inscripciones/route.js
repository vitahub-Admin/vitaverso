import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function getCustomerId(cookieStore) {
  return cookieStore.get("customerId")?.value || null;
}

// GET — IDs de capacitaciones en las que el usuario ya está inscripto
export async function GET() {
  const cookieStore = await cookies();
  const customerId  = getCustomerId(cookieStore);
  if (!customerId) return NextResponse.json({ success: false }, { status: 401 });

  const { data, error } = await supabase
    .from("capacitacion_inscripciones")
    .select("capacitacion_id")
    .eq("customer_id", parseInt(customerId, 10));

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    inscripciones: (data || []).map(r => r.capacitacion_id),
  });
}

// POST — inscribir al usuario en una capacitación
export async function POST(req) {
  const cookieStore = await cookies();
  const customerId  = getCustomerId(cookieStore);
  if (!customerId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { capacitacion_id } = await req.json();
    if (!capacitacion_id) {
      return NextResponse.json({ success: false, error: "capacitacion_id requerido" }, { status: 400 });
    }

    const { error } = await supabase
      .from("capacitacion_inscripciones")
      .upsert(
        { capacitacion_id, customer_id: parseInt(customerId, 10) },
        { onConflict: "capacitacion_id,customer_id" }
      );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
