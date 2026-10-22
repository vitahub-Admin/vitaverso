import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificarEnlace } from "@/lib/enlaceLogin";
import { COOKIE_SESION, SESION_DIAS, firmarSesion, leerSesion, opcionesCookie } from "@/lib/sesionWeb";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * POST /api/sesion/enlace  { ml, ruta }
 * El profesional tocó el enlace de una notificación. Si el enlace es auténtico, no
 * venció y es de esa página, se le abre una sesión de nivel "enlace". Si ya tenía una
 * sesión propia, no se toca: un enlace nunca baja de nivel a quien ya entró de verdad.
 */
export async function POST(req) {
  try {
    const { ml, ruta } = await req.json().catch(() => ({}));
    const id = verificarEnlace(ml, ruta);
    if (!id) return NextResponse.json({ ok: false }, { status: 401 });

    const actual = leerSesion(req.cookies.get(COOKIE_SESION)?.value);
    if (actual?.id === id) return NextResponse.json({ ok: true, customerId: id, nivel: actual.nivel });

    const { data } = await supabase
      .from("affiliates")
      .select("status, deleted_at")
      .eq("shopify_customer_id", id)
      .maybeSingle();
    if (!data || data.status !== "active" || data.deleted_at) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, customerId: id, nivel: "e" });
    res.cookies.set(COOKIE_SESION, firmarSesion(id, "e"), opcionesCookie());
    res.cookies.set("customerId", id, { ...opcionesCookie(), httpOnly: false, maxAge: SESION_DIAS * 24 * 60 * 60 });
    return res;
  } catch (e) {
    console.error("sesion/enlace:", e.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
