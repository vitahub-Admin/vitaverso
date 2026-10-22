import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCustomerToken } from "@/lib/customerAppAuth";
import {
  COOKIE_SESION, SESION_DIAS, firmarSesion, leerSesion, necesitaRenovar,
  opcionesCookie, legadaVigente,
} from "@/lib/sesionWeb";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// El profesional dado de baja no renueva: pierde el acceso en su siguiente visita.
async function dadoDeBaja(customerId) {
  const { data } = await supabase
    .from("affiliates")
    .select("status, deleted_at")
    .eq("shopify_customer_id", customerId)
    .maybeSingle();
  return !!data && (data.status !== "active" || !!data.deleted_at);
}

function cerrar() {
  // legada: mientras sea true la cookie vieja aún vale y la web no debe sacar al usuario
  const res = NextResponse.json({ ok: false, legada: legadaVigente() }, { status: 401 });
  res.cookies.set(COOKIE_SESION, "", { ...opcionesCookie(), maxAge: 0 });
  return res;
}

function emitir(customerId, nivel = "f") {
  const res = NextResponse.json({ ok: true, customerId: String(customerId), nivel });
  res.cookies.set(COOKIE_SESION, firmarSesion(customerId, nivel), opcionesCookie());
  // Cookie legible solo para pintar la pantalla; el servidor no se fía de ella
  res.cookies.set("customerId", String(customerId), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESION_DIAS * 24 * 60 * 60,
  });
  return res;
}

/**
 * POST /api/sesion
 * Abre o renueva la sesión web. Quien llama se identifica con una de dos cosas:
 *   1. el token que acaba de dar el login (Authorization: Bearer …)  → abre sesión
* La cookie vieja "customerId" NO se cambia por una firmada: eso dejaría a cualquiera que la escriba a mano con una sesión de un año.
 */
export async function POST(req) {
  const bearer = verifyCustomerToken(req);
  if (bearer?.userId) {
    if (await dadoDeBaja(bearer.userId)) return cerrar();
    return emitir(bearer.userId);
  }

  const firmada = leerSesion(req.cookies.get(COOKIE_SESION)?.value);
  if (firmada) {
    if (!necesitaRenovar(firmada)) return NextResponse.json({ ok: true, customerId: firmada.id, nivel: firmada.nivel });
    if (await dadoDeBaja(firmada.id)) return cerrar();
    return emitir(firmada.id, firmada.nivel);
  }

  return cerrar();
}

// Cerrar sesión: borra la cookie firmada, que el navegador no puede borrar por su cuenta
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION, "", { ...opcionesCookie(), maxAge: 0 });
  res.cookies.set("customerId", "", { path: "/", maxAge: 0 });
  return res;
}
