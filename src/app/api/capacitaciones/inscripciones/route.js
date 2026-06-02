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

// GET — inscripciones del usuario con su status
export async function GET() {
  const cookieStore = await cookies();
  const customerId  = getCustomerId(cookieStore);
  if (!customerId) return NextResponse.json({ success: false }, { status: 401 });

  const { data, error } = await supabase
    .from("capacitacion_inscripciones")
    .select("capacitacion_id, status")
    .eq("customer_id", parseInt(customerId, 10));

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    inscripciones: (data || []).map(r => ({
      id:     r.capacitacion_id,
      status: r.status,
    })),
  });
}

// POST — marcar como pendiente + guardar email para match con Calendly
export async function POST(req) {
  const cookieStore = await cookies();
  const customerId  = getCustomerId(cookieStore);
  if (!customerId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { capacitacion_id } = await req.json();
    if (!capacitacion_id) {
      return NextResponse.json({ success: false, error: "capacitacion_id requerido" }, { status: 400 });
    }

    // Obtener email del afiliado
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("email")
      .eq("shopify_customer_id", parseInt(customerId, 10))
      .maybeSingle();

    const { error } = await supabase
      .from("capacitacion_inscripciones")
      .upsert(
        {
          capacitacion_id,
          customer_id: parseInt(customerId, 10),
          email:       affiliate?.email || null,
          status:      "pendiente",
        },
        { onConflict: "capacitacion_id,customer_id" }
      );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
