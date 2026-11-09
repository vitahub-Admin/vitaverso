// POST /api/registro  { accion, ... }
//
//   enviar     { ...formulario }   valida, revisa duplicados y manda el código al correo
//   reenviar   { email }           otro código para un registro en curso
//   verificar  { email, code }     confirma el código, crea la cuenta y devuelve { token, customer }
//   reintentar { reintento }       reanuda la creación de la cuenta si falló a la mitad (pase de 30 min)
//   completar  { email }           anota que la persona ya entró a Pro
//
// Pública a propósito (la usa quien todavía no tiene cuenta). Se protege con: verificación del correo ANTES de
// crear nada en Shopify, límites por correo, por IP y por registros, y un campo trampa para bots.
// Todo el trabajo vive en src/lib/registroAfiliado.js. Siempre abierta; REGISTRO_PRO_CERRADO=1 es el corte de
// emergencia. Con el correo fake@vitahub.mx corre en modo demostración: recorre los pasos sin guardar nada.
import { NextResponse } from "next/server";
import {
  registroAbierto, iniciarRegistro, reenviarCodigo, verificarYCrear, reintentarCuenta, marcarCompletado,
} from "@/lib/registroAfiliado";

export const maxDuration = 60; // crear cliente + colección + metafields en Shopify tarda unos segundos

export async function POST(req) {
  if (!registroAbierto()) {
    return NextResponse.json({ ok: false, error: "El registro desde Pro está en pausa por unos minutos. Intenta más tarde." }, { status: 503 });
  }

  try {
    const body = await req.json();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    let r;

    switch (body?.accion) {
      case "enviar":     r = await iniciarRegistro(body, ip); break;
      case "reenviar":   r = await reenviarCodigo(body.email, ip); break;
      case "verificar":  r = await verificarYCrear(body.email, body.code); break;
      case "reintentar": r = await reintentarCuenta(body.reintento); break;
      case "completar":
        await marcarCompletado(body.email);
        r = { status: 200, json: { ok: true } };
        break;
      default:
        r = { status: 400, json: { ok: false, error: "Acción no válida" } };
    }
    return NextResponse.json(r.json, { status: r.status });
  } catch (err) {
    console.error("registro error:", err);
    return NextResponse.json({ ok: false, error: "No pudimos procesar tu registro. Intenta de nuevo." }, { status: 500 });
  }
}
