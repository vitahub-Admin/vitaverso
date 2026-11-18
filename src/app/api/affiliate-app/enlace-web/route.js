// POST /api/affiliate-app/enlace-web  { destino }   (Authorization: Bearer <token de Pro>)
// La app Pro pide un enlace para abrir una página de la web con la sesión ya iniciada
// (por ejemplo, la agenda). Devuelve { ok, url }; la URL vale 2 minutos.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { firmarSalto } from "@/lib/enlaceLogin";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Solo páginas de Pro a las que tiene sentido saltar desde la app
const DESTINOS = new Set(["/booking-dashboard"]);
const BASE = "https://pro.vitahub.mx";

export async function POST(req) {
  try {
    const payload = verifyCustomerToken(req);
    if (!payload?.userId) return unauthorized();

    const { destino } = await req.json().catch(() => ({}));
    if (!DESTINOS.has(destino)) {
      return NextResponse.json({ ok: false, error: "Destino no permitido" }, { status: 400 });
    }

    const { data: afiliado } = await supabase
      .from("affiliates")
      .select("status, deleted_at")
      .eq("shopify_customer_id", Number(payload.userId))
      .maybeSingle();
    if (!afiliado || afiliado.status !== "active" || afiliado.deleted_at) return unauthorized();

    const h = firmarSalto(String(payload.userId), destino);
    if (!h) throw new Error("Falta SHOPIFY_TOKEN_SECRET");

    const url = `${BASE}/api/sesion/desde-app?h=${encodeURIComponent(h)}&d=${encodeURIComponent(destino)}`;
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("affiliate-app/enlace-web:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
