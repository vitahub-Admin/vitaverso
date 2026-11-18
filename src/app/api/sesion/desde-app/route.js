// GET /api/sesion/desde-app?h=<salto>&d=<destino>
// El navegador llega acá desde la app Pro (ver /api/affiliate-app/enlace-web). Si el salto
// es auténtico y el profesional sigue activo, se abre la sesión web igual que al entrar con
// código (cookie firmada, customerId y proJwt) y se lo lleva al destino. Si no, al destino
// sin sesión: la página pedirá el código como siempre.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificarSalto } from "@/lib/enlaceLogin";
import { signCustomerToken, PRO_TOKEN_DAYS } from "@/lib/customerAppAuth";
import { COOKIE_SESION, SESION_DIAS, firmarSesion, opcionesCookie } from "@/lib/sesionWeb";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DESTINOS = new Set(["/booking-dashboard"]);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const destino = DESTINOS.has(searchParams.get("d")) ? searchParams.get("d") : "/home";
  const res = NextResponse.redirect(new URL(destino, req.url));
  // Que el enlace no quede guardado en ninguna caché
  res.headers.set("Cache-Control", "no-store");

  try {
    const id = verificarSalto(searchParams.get("h"), destino);
    if (!id) return res;

    const { data: afiliado } = await supabase
      .from("affiliates")
      .select("status, deleted_at, email")
      .eq("shopify_customer_id", Number(id))
      .maybeSingle();
    if (!afiliado || afiliado.status !== "active" || afiliado.deleted_at) return res;

    // Entró en la app con el código del correo: sesión completa, como en la web
    res.cookies.set(COOKIE_SESION, firmarSesion(id, "f"), opcionesCookie());
    res.cookies.set("customerId", id, { ...opcionesCookie(), httpOnly: false, maxAge: SESION_DIAS * 24 * 60 * 60 });
    // La agenda lee el token desde el navegador, por eso esta no es httpOnly
    res.cookies.set("proJwt", signCustomerToken(id, afiliado.email), {
      ...opcionesCookie(), httpOnly: false, maxAge: PRO_TOKEN_DAYS * 24 * 60 * 60,
    });
  } catch (e) {
    console.error("sesion/desde-app:", e.message);
  }
  return res;
}
